import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ComingSoonModal } from "@/components/ComingSoonModal";
import { MiniMapPreview } from "@/components/mechanic/MiniMapPreview";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useMechanic } from "@/contexts/MechanicContext";
import { supabase } from "@/lib/supabase";
import { colors, radii, spacing } from "@/lib/theme";
import { normalizeText } from "@/lib/typography";

type AvailableJob = {
  id: string;
  motorist_id: string;
  mechanic_id: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  vehicle_issue: string | null;
  request_type: string | null;
  service_price: number | null;
  estimated_total: number | null;
  search_radius_km: number | null;
  created_at: string;
  scheduled_at: string | null;
  latitude: number | null;
  longitude: number | null;
  customer_name: string;
  customer_contact: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

function distanceInKm(from: Coordinates, to: Coordinates) {
  const earthRadiusKm = 6371;
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const latitude1 = (from.latitude * Math.PI) / 180;
  const latitude2 = (to.latitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 *
      Math.cos(latitude1) *
      Math.cos(latitude2);
  return (
    earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function formatDistance(
  mechanicLocation: Coordinates | null,
  job: AvailableJob,
) {
  if (!mechanicLocation || job.latitude === null || job.longitude === null) {
    return "Distance unavailable";
  }
  const distance = distanceInKm(mechanicLocation, {
    latitude: job.latitude,
    longitude: job.longitude,
  });
  return distance < 1
    ? `${Math.round(distance * 1000)} m away`
    : `${distance.toFixed(1)} km away`;
}

function formatBookingSchedule(value: string | null) {
  if (!value) return "As soon as possible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Schedule unavailable";

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDifference = Math.round(
    (startOfDate.getTime() - startOfToday.getTime()) / 86400000,
  );
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (dayDifference === 1) {
    return `Tomorrow, ${time}`;
  }
  if (dayDifference === 0) {
    return `Today, ${time}`;
  }

  const day = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return `${day}, ${time}`;
}

function displayName(fullName: string | undefined, email: string | undefined) {
  if (fullName?.trim()) return fullName.trim();
  const local = email?.split("@")[0];
  if (!local) return "Mekaniko";
  return local.replace(/[._]/g, " ");
}

export default function MechanicHomeScreen() {
  const { session } = useAuth();
  const { online, setOnline, rating, avatarUrl } = useMechanic();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [sidebarProgress] = useState(() => new Animated.Value(0));
  const [availableJobs, setAvailableJobs] = useState<AvailableJob[]>([]);
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);
  const [, setJobsError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<AvailableJob | null>(null);
  const [declineJobId, setDeclineJobId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [mechanicLocation, setMechanicLocation] = useState<Coordinates | null>(
    null,
  );
  const [, setLocationError] = useState<string | null>(null);
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const [sliderActivated, setSliderActivated] = useState(false);
  const [slidePosition] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!sliderActivated && online) {
      setOnline(false);
    }
  }, [online, setOnline, sliderActivated]);

  const onlineSlider = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 5,
        onPanResponderMove: (_, gestureState) => {
          slidePosition.setValue(
            Math.max(0, Math.min(1, gestureState.dx / 200)),
          );
        },
        onPanResponderRelease: (_, gestureState) => {
          const completed = gestureState.dx >= 130;
          if (completed) {
            setSliderActivated(true);
            setOnline(true);
          }
          Animated.spring(slidePosition, {
            toValue: 0,
            useNativeDriver: false,
            bounciness: 5,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(slidePosition, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        },
      }),
    [setOnline, slidePosition],
  );

  function openCustomerLocation(job: AvailableJob) {
    if (job.latitude === null || job.longitude === null) {
      setJobsError("Customer location is not available.");
      return;
    }
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${job.latitude},${job.longitude}`;
    void Linking.openURL(mapsUrl).catch(() => {
      setJobsError("Unable to open maps.");
    });
  }

  useEffect(() => {
    if (!online || !sliderActivated) {
      return;
    }

    let active = true;
    async function refreshMechanicLocation() {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          throw new Error(
            "Location permission is required to calculate distance.",
          );
        }
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) return;
        setMechanicLocation({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
        setLocationError(null);
      } catch (error) {
        if (!active) return;
        setLocationError(
          error instanceof Error
            ? error.message
            : "Unable to get your current location.",
        );
      }
    }

    void refreshMechanicLocation();
    const interval = setInterval(() => void refreshMechanicLocation(), 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [online, sliderActivated]);

  useEffect(() => {
    let active = true;

    async function loadAvailableJobs() {
      if (!online || !sliderActivated || !session?.user.id) {
        setAvailableJobs([]);
        return;
      }

      const { data, error } = await supabase
        .from("service_requests")
        .select(
          "id,motorist_id,mechanic_id,vehicle_type,plate_number,vehicle_issue,request_type,service_price,estimated_total,search_radius_km,created_at,scheduled_at,latitude,longitude",
        )
        .or(`mechanic_id.is.null,mechanic_id.eq.${session.user.id}`)
        .in("status", ["pending", "scheduled"])
        .order("created_at", { ascending: false });

      if (!active) return;
      if (error) {
        setJobsError(error.message);
        return;
      }
      const requests = (data ?? []) as Omit<
        AvailableJob,
        "customer_name" | "customer_contact"
      >[];
      const motoristIds = [...new Set(requests.map((job) => job.motorist_id))];
      const profilesResult = motoristIds.length
        ? await supabase
            .from("profiles")
            .select("id,full_name,mobile_number,email")
            .in("id", motoristIds)
        : { data: [], error: null };
      const profiles = new Map(
        (profilesResult.data ?? []).map((profile) => [
          profile.id,
          {
            name: profile.full_name || "Customer",
            contact: profile.mobile_number || "Not provided",
          },
        ]),
      );
      const visibleRequests = requests.filter((job) => {
        if (job.request_type !== "emergency") return true;
        if (!mechanicLocation || job.latitude === null || job.longitude === null) {
          return false;
        }
        const radius = Number(job.search_radius_km ?? 5);
        return distanceInKm(mechanicLocation, {
          latitude: job.latitude,
          longitude: job.longitude,
        }) <= radius;
      });
      setJobsError(null);
      setAvailableJobs(
        visibleRequests.map((job) => ({
          ...job,
          customer_name: profiles.get(job.motorist_id)?.name || "Customer",
          customer_contact:
            profiles.get(job.motorist_id)?.contact || "Not provided",
        })),
      );
    }

    void loadAvailableJobs();
    const interval = setInterval(() => void loadAvailableJobs(), 10000);
    const channel = supabase
      .channel(`mechanic-sos-dispatch-${session?.user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_requests" },
        () => void loadAvailableJobs(),
      )
      .subscribe();

    return () => {
      active = false;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [online, session?.user.id, sliderActivated, mechanicLocation]);

  async function acceptJob(id: string) {
    if (!session?.user.id) return;
    setAcceptingJobId(id);
    const { data, error } = await supabase
      .from("service_requests")
      .update({ mechanic_id: session.user.id, status: "accepted" })
      .eq("id", id)
      .or(`mechanic_id.is.null,mechanic_id.eq.${session.user.id}`)
      .in("status", ["pending", "scheduled"])
      .select("id")
      .maybeSingle();

    if (error) {
      setJobsError(error.message);
    } else if (!data) {
      setJobsError("This request was already accepted by another mechanic.");
      setAvailableJobs((jobs) => jobs.filter((job) => job.id !== id));
      setSelectedJob(null);
    } else {
      setAvailableJobs((jobs) => jobs.filter((job) => job.id !== id));
      setSelectedJob(null);
    }
    setAcceptingJobId(null);
  }

  function openDeclineDialog(id: string) {
    setDeclineReason("");
    setDeclineJobId(id);
  }

  async function declineJob() {
    const id = declineJobId;
    if (!session?.user.id) return;
    const reason = declineReason.trim();
    if (!id || !reason) {
      setJobsError("Please provide a reason before declining the booking.");
      return;
    }
    setAcceptingJobId(id);
    const { error } = await supabase
      .from("service_requests")
      .update({
        mechanic_id: null,
        status: "declined",
        decline_reason: reason,
      })
      .eq("id", id)
      .is("mechanic_id", null);

    if (error) {
      setJobsError(error.message);
    } else {
      setAvailableJobs((jobs) => jobs.filter((job) => job.id !== id));
      setSelectedJob(null);
      setDeclineJobId(null);
      setDeclineReason("");
    }
    setAcceptingJobId(null);
  }

  const closeSidebar = (onComplete?: () => void) => {
    if (!sidebarVisible) {
      onComplete?.();
      return;
    }
    Animated.timing(sidebarProgress, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSidebarVisible(false);
      onComplete?.();
    });
  };

  useEffect(() => {
    if (!sidebarVisible) return;
    sidebarProgress.setValue(0);
    Animated.timing(sidebarProgress, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [sidebarProgress, sidebarVisible]);

  const name = displayName(
    typeof session?.user.user_metadata?.full_name === "string"
      ? session.user.user_metadata.full_name
      : undefined,
    session?.user.email,
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.homeScroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.identity}
            onPress={() => setSidebarVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open profile menu"
          >
            <View style={styles.avatarWrap}>
              <ProfileAvatar
                uri={avatarUrl}
                name={name}
                size={48}
                backgroundColor={colors.amberSoft}
              />
              <View
                style={[
                  styles.statusDot,
                  online && sliderActivated && styles.statusDotOnline,
                ]}
              />
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.availabilityText}>
                {online && sliderActivated ? "Available" : "Not Available"}
              </Text>
            </View>
          </Pressable>
          <View style={styles.headerActions}>
            <View style={styles.headerRating}>
              <Ionicons name="star" size={20} color={colors.amber} />
              <Text style={styles.headerRatingValue}>{rating.toFixed(2)}</Text>
            </View>
            <Pressable
              style={styles.notificationButton}
              onPress={() => router.push("./notifications")}
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color={colors.amber}
              />
            </Pressable>
          </View>
        </View>
        {online && sliderActivated ? (
          <Pressable
            style={styles.offlineButton}
            onPress={() => {
              slidePosition.setValue(0);
              setSliderActivated(false);
              setOnline(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="Go offline"
          >
            <Ionicons name="power-outline" size={17} color={colors.sos} />
            <Text style={styles.offlineButtonText}>Go offline</Text>
          </Pressable>
        ) : null}
        {!online || !sliderActivated ? (
          <View style={styles.homeImageContainer}>
            <Image
              source={require("../../assets/images/mechanic-homeicon.png")}
              resizeMode="contain"
              style={styles.homeImage}
              accessibilityLabel="Mechanic home illustration"
            />
            <Text style={styles.homeImageHeader}>Ready to fix and earn?</Text>
            <Text style={styles.homeImageSubtext}>
              Stay online to receive nearby repair and roadside assistance
              requests.
            </Text>
            <View style={styles.onlineSlider}>
              <Text style={styles.onlineSliderText}>Slide to online</Text>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.onlineSliderTrail,
                  {
                    width: slidePosition.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 260],
                    }),
                  },
                ]}
              />
              <Animated.View
                {...onlineSlider.panHandlers}
                style={[
                  styles.onlineSliderHandle,
                  {
                    transform: [
                      {
                        translateX: slidePosition.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 198],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color={colors.blue}
                />
              </Animated.View>
            </View>
          </View>
        ) : null}
        {online && sliderActivated ? (
          <View style={styles.availableSection}>
            {availableJobs.length === 0 ? (
              <View style={styles.onlineEmptyState}>
                <Image
                  source={require("../../assets/images/no-booking.png")}
                  resizeMode="contain"
                  style={styles.noBookingImage}
                  accessibilityLabel="No bookings"
                />
                <Text style={styles.noBookingText}>No bookings yet ...</Text>
              </View>
            ) : (
              <View style={styles.availableStack}>
                {availableJobs.map((job) => {
                  const isEmergency = job.request_type === "emergency";
                  return (
                    <View
                      key={job.id}
                      style={[
                        styles.availableCard,
                        isEmergency && styles.emergencyCard,
                        !isEmergency && styles.scheduledCard,
                      ]}
                    >
                      <Pressable onPress={() => setSelectedJob(job)}>
                        {isEmergency ? (
                          <>
                            <View style={styles.sosDispatchHeader}>
                              <View>
                                <Text style={styles.sosDispatchTitle}>
                                  INCOMING SOS DISPATCH
                                </Text>
                                <Text style={styles.sosDispatchSubtitle}>
                                  Immediate roadside assist requested
                                </Text>
                              </View>
                              <View style={styles.sosHeaderDistance}>
                                <Text style={styles.sosHeaderDistanceText}>
                                  {formatDistance(mechanicLocation, job)}
                                </Text>
                                <Text style={styles.sosHeaderArrivalText}>
                                  ~6 mins arrival
                                </Text>
                              </View>
                            </View>
                          </>
                        ) : null}
                        <View
                          style={
                            isEmergency ? styles.sosRouteContainer : undefined
                          }
                        >
                          {!isEmergency ? (
                            <View style={styles.availableHeader}>
                              <View style={styles.requestTitleRow}>
                                <View style={styles.requestIcon}>
                                  <Ionicons
                                    name="calendar"
                                    size={16}
                                    color={colors.blue}
                                  />
                                </View>
                                <Text style={styles.availableType}>
                                  {formatBookingSchedule(job.scheduled_at)}
                                </Text>
                              </View>
                              <Ionicons
                                name="chevron-forward"
                                size={20}
                                color={colors.textDim}
                              />
                            </View>
                          ) : null}
                          {isEmergency ? (
                            <MiniMapPreview
                              compact
                              mechanicLocation={mechanicLocation}
                              customerLocation={
                                job.latitude !== null && job.longitude !== null
                                  ? {
                                      latitude: job.latitude,
                                      longitude: job.longitude,
                                    }
                                  : null
                              }
                              distanceLabel={formatDistance(mechanicLocation, job)}
                            />
                          ) : null}
                        </View>
                        <View
                          style={
                            isEmergency ? styles.sosDetailsContainer : undefined
                          }
                        >
                          {!isEmergency ? (
                            <Text
                              style={styles.requestCustomer}
                              numberOfLines={1}
                            >
                              {job.customer_name}
                            </Text>
                          ) : null}
                          {isEmergency ? (
                            <View style={styles.sosVehicleRow}>
                              <View style={styles.sosVehicleInfo}>
                                <View>
                                  <Text style={styles.sosSectionLabel}>VEHICLE</Text>
                                  <Text style={styles.sosVehicleName}>
                                    {job.vehicle_type || "Vehicle not provided"}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.sosPlateBlock}>
                                <Text style={styles.sosSectionLabel}>PLATE</Text>
                                <Text style={styles.sosPlate}>
                                  {job.plate_number || "NO PLATE"}
                                </Text>
                              </View>
                            </View>
                          ) : null}
                          {!isEmergency ? (
                            <View style={styles.requestInfoGrid}>
                              <View style={styles.requestInfoItem}>
                                <Ionicons
                                  name="car-outline"
                                  size={16}
                                  color={colors.textMuted}
                                />
                                <Text
                                  style={styles.requestInfoText}
                                  numberOfLines={1}
                                >
                                  {job.vehicle_type || "Vehicle not provided"}
                                </Text>
                              </View>
                              <View style={styles.requestInfoItem}>
                                <Ionicons
                                  name="location-outline"
                                  size={16}
                                  color={colors.textMuted}
                                />
                                <Text
                                  style={styles.requestInfoText}
                                  numberOfLines={1}
                                >
                                  {formatDistance(mechanicLocation, job)}
                                </Text>
                              </View>
                            </View>
                          ) : null}
                          {job.vehicle_issue ? (
                            isEmergency ? (
                              <View style={styles.sosSymptoms}>
                                <View style={styles.sosSymptomsAccent} />
                                <View style={styles.sosSymptomsContent}>
                                  <Text style={styles.sosSectionLabel}>
                                    SYMPTOMS / SITUATION
                                  </Text>
                                  <Text style={styles.sosIssue} numberOfLines={3}>
                                    {job.vehicle_issue}
                                  </Text>
                                </View>
                              </View>
                            ) : (
                              <Text style={styles.requestIssue} numberOfLines={3}>
                                {job.vehicle_issue}
                              </Text>
                            )
                          ) : null}
                        </View>
                        {isEmergency ? (
                          <View style={styles.sosFareBox}>
                            <View style={styles.sosFareText}>
                              <Text style={styles.sosFareLabel}>
                                GUARANTEED EARNINGS
                              </Text>
                              <Text style={styles.sosFareHint}>
                                Base fare ₱350.00 · Emergency dispatch
                              </Text>
                            </View>
                            <Text style={styles.sosFareValue}>
                              ₱
                              {Number(
                                job.estimated_total ?? job.service_price ?? 350,
                              ).toFixed(2)}
                            </Text>
                          </View>
                        ) : null}
                      </Pressable>
                      {isEmergency ? (
                        <View style={styles.sosActions}>
                          <Pressable
                            style={styles.sosAcceptButton}
                            onPress={() => void acceptJob(job.id)}
                            disabled={acceptingJobId === job.id}
                          >
                            <Ionicons
                              name="checkmark-circle"
                              size={17}
                              color={colors.white}
                            />
                            <Text style={styles.sosAcceptText}>
                              {acceptingJobId === job.id
                                ? "Saving..."
                                : "Accept"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={styles.sosDeclineButton}
                            onPress={() => openDeclineDialog(job.id)}
                            disabled={acceptingJobId === job.id}
                          >
                            <Ionicons
                              name="close"
                              size={17}
                              color={colors.textMuted}
                            />
                            <Text style={styles.sosDeclineText}>Decline</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={selectedJob !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedJob(null)}
      >
        {selectedJob ? (
          <SafeAreaView
            style={styles.jobDetailScreen}
            edges={["top", "bottom"]}
          >
            <View
              style={[
                styles.jobDetailHeader,
                selectedJob.request_type === "emergency" &&
                  styles.emergencyDetailHeader,
                selectedJob.request_type !== "emergency" &&
                  styles.scheduledDetailHeader,
              ]}
            >
              <Pressable
                onPress={() => setSelectedJob(null)}
                style={styles.detailBackButton}
                accessibilityRole="button"
                accessibilityLabel="Close booking details"
              >
                <Ionicons name="arrow-back" size={24} color="#000000" />
              </Pressable>
              <Text style={styles.jobDetailHeaderTitle}>Booking details</Text>
              <View style={styles.detailHeaderSpacer} />
            </View>
            <ScrollView
              contentContainerStyle={styles.jobDetailContent}
              showsVerticalScrollIndicator={false}
            >
              <Text
                style={[
                  styles.jobDetailType,
                  selectedJob.request_type !== "emergency" &&
                    styles.scheduledDetailText,
                ]}
              >
                {selectedJob.request_type === "emergency"
                  ? "URGENT REQUEST"
                  : "SCHEDULED SERVICE"}
              </Text>
              <Text style={styles.jobDetailCustomer}>
                {selectedJob.customer_name}
              </Text>
              <Pressable
                style={styles.detailRoute}
                onPress={() => openCustomerLocation(selectedJob)}
                disabled={
                  selectedJob.latitude === null ||
                  selectedJob.longitude === null
                }
                accessibilityRole="button"
                accessibilityLabel="View customer location on map"
              >
                <View style={styles.detailRouteRow}>
                  <Ionicons
                    name="location"
                    size={20}
                    color={
                      selectedJob.request_type === "emergency"
                        ? colors.amber
                        : colors.blue
                    }
                  />
                  <View style={styles.detailRouteText}>
                    <Text style={styles.detailRouteLabel}>
                      Customer location
                    </Text>
                    <Text style={styles.detailRouteValue}>
                      {selectedJob.latitude !== null &&
                      selectedJob.longitude !== null
                        ? `${selectedJob.latitude.toFixed(5)}, ${selectedJob.longitude.toFixed(5)}`
                        : "Location not provided"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.detailRouteHint}>
                  {selectedJob.latitude !== null &&
                  selectedJob.longitude !== null
                    ? "Tap to open in maps"
                    : "Location not available"}
                </Text>
              </Pressable>
              <View style={styles.fullDetailSection}>
                <Text
                  style={[
                    styles.distanceLabel,
                    selectedJob.request_type !== "emergency" &&
                      styles.scheduledDetailText,
                  ]}
                >
                  DISTANCE FROM YOU
                </Text>
                <Text
                  style={[
                    styles.distanceValue,
                    selectedJob.request_type !== "emergency" &&
                      styles.scheduledDistanceValue,
                  ]}
                >
                  {formatDistance(mechanicLocation, selectedJob)}
                </Text>
                <Text style={styles.fullDetailLabel}>DATE SCHEDULED</Text>
                <Text style={styles.fullDetailValue}>
                  {selectedJob.scheduled_at
                    ? new Date(selectedJob.scheduled_at).toLocaleString()
                    : "As soon as possible"}
                </Text>
                <Text style={styles.fullDetailLabel}>VEHICLE</Text>
                <Text style={styles.fullDetailValue}>
                  {selectedJob.vehicle_type || "Not provided"}
                </Text>
                <Text style={styles.fullDetailLabel}>PLATE NUMBER</Text>
                <Text style={styles.fullDetailValue}>
                  {selectedJob.plate_number || "Not provided"}
                </Text>
                <Text style={styles.fullDetailLabel}>SERVICE DETAILS</Text>
                <Text style={styles.fullDetailValue}>
                  {selectedJob.vehicle_issue ||
                    "No issue description provided."}
                </Text>
              </View>
            </ScrollView>
            <View style={styles.fullDetailActions}>
              <Pressable
                style={[
                  styles.detailAcceptButton,
                  selectedJob.request_type !== "emergency" &&
                    styles.scheduledAcceptButton,
                ]}
                onPress={() => void acceptJob(selectedJob.id)}
                disabled={acceptingJobId === selectedJob.id}
              >
                <Text style={styles.acceptJobText}>
                  {acceptingJobId === selectedJob.id
                    ? "Saving..."
                    : "Accept job"}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.detailDeclineButton,
                  selectedJob.request_type !== "emergency" &&
                    styles.scheduledDeclineButton,
                ]}
                onPress={() => openDeclineDialog(selectedJob.id)}
                disabled={acceptingJobId === selectedJob.id}
              >
                <Text style={styles.declineJobText}>Decline</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        ) : null}
      </Modal>

      <Modal
        visible={declineJobId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeclineJobId(null)}
      >
        <View style={styles.declineModalOverlay}>
          <View style={styles.declineModalCard}>
            <Text style={styles.declineModalTitle}>Reason for declining</Text>
            <Text style={styles.declineModalHint}>
              Please tell the customer why you cannot accept this booking.
            </Text>
            <TextInput
              value={declineReason}
              onChangeText={setDeclineReason}
              placeholder="Enter decline reason"
              placeholderTextColor={colors.textDim}
              multiline
              maxLength={250}
              style={styles.declineReasonInput}
              autoFocus
            />
            <View style={styles.declineModalActions}>
              <Pressable
                style={styles.cancelDeclineButton}
                onPress={() => setDeclineJobId(null)}
                disabled={acceptingJobId !== null}
              >
                <Text style={styles.cancelDeclineText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmDeclineButton}
                onPress={() => void declineJob()}
                disabled={acceptingJobId !== null || !declineReason.trim()}
              >
                <Text style={styles.confirmDeclineText}>
                  {acceptingJobId ? "Saving..." : "Decline booking"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={sidebarVisible}
        transparent
        animationType="none"
        onRequestClose={() => closeSidebar()}
      >
        <View style={styles.sidebarOverlay}>
          <Animated.View
            style={[
              styles.sidebar,
              {
                transform: [
                  {
                    translateX: sidebarProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-300, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              style={styles.sidebarProfile}
              onPress={() => closeSidebar(() => router.push("./profile"))}
            >
              <ProfileAvatar
                uri={avatarUrl}
                name={name}
                size={50}
                backgroundColor={colors.amberSoft}
              />
              <Text style={styles.sidebarName} numberOfLines={2}>
                {name}
              </Text>
            </Pressable>
            <View style={styles.sidebarDivider} />
            <Pressable
              style={styles.sidebarRow}
              onPress={() => setComingSoonVisible(true)}
            >
              <Ionicons
                name="help-circle-outline"
                size={23}
                color={colors.text}
              />
              <Text style={styles.sidebarRowText}>Help</Text>
              <Ionicons
                name="chevron-forward"
                size={19}
                color={colors.textDim}
              />
            </Pressable>
            <Pressable
              style={styles.sidebarRow}
              onPress={() => setComingSoonVisible(true)}
            >
              <Ionicons name="settings-outline" size={23} color={colors.text} />
              <Text style={styles.sidebarRowText}>Settings</Text>
              <Ionicons
                name="chevron-forward"
                size={19}
                color={colors.textDim}
              />
            </Pressable>
          </Animated.View>
          <Pressable
            style={styles.sidebarDismiss}
            onPress={() => closeSidebar()}
            accessibilityLabel="Close profile menu"
          />
        </View>
      </Modal>
      <ComingSoonModal
        visible={comingSoonVisible}
        onClose={() => setComingSoonVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  homeScroll: {
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
    borderRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginHorizontal: -spacing.sm,
    marginBottom: spacing.md,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  homeImageContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 120,
    marginBottom: spacing.xl,
  },
  homeImage: {
    width: "88%",
    height: 260,
  },
  homeImageHeader: {
    marginTop: -30,
    color: colors.text,
    fontSize: normalizeText(24),
    fontWeight: "800",
    textAlign: "center",
  },
  onlineSlider: {
    width: "78%",
    maxWidth: 260,
    height: 58,
    marginTop: spacing.lg,
    borderRadius: 29,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  onlineSliderText: {
    color: colors.white,
    fontSize: normalizeText(16),
    fontWeight: "800",
  },
  onlineSliderTrail: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  onlineSliderHandle: {
    position: "absolute",
    left: 4,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  homeImageSubtext: {
    maxWidth: 310,
    marginTop: spacing.xs,
    color: colors.textDim,
    fontSize: normalizeText(15),
    lineHeight: normalizeText(22),
    textAlign: "center",
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  avatarWrap: {
    position: "relative",
  },
  statusDot: {
    position: "absolute",
    right: 0,
    top: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.sos,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  statusDotOnline: {
    backgroundColor: colors.success,
  },
  availabilityText: {
    color: colors.textMuted,
    fontSize: normalizeText(13),
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerRatingValue: {
    color: colors.text,
    fontSize: normalizeText(16),
    fontWeight: "700",
  },
  notificationButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  offlineButton: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "rgba(255, 77, 79, 0.45)",
    borderRadius: 19,
    backgroundColor: colors.sosSoft,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  offlineButtonText: {
    color: colors.sos,
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  sidebarOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.52)",
  },
  sidebarDismiss: {
    flex: 1,
  },
  sidebar: {
    width: "65%",
    backgroundColor: colors.bgElevated,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  sidebarProfile: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  sidebarAvatar: {
    width: 50,
    height: 50,
    borderRadius: 29,
    backgroundColor: colors.amberSoft,
    borderWidth: 2,
    borderColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
    overflow: "hidden",
  },
  sidebarAvatarImage: {
    width: "100%",
    height: "100%",
  },
  sidebarName: {
    flex: 1,
    color: colors.text,
    fontSize: normalizeText(18),
    fontWeight: "800",
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  sidebarRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sidebarRowText: {
    flex: 1,
    color: colors.text,
    fontSize: normalizeText(17),
    fontWeight: "700",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.amberSoft,
    borderWidth: 2,
    borderColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.amber,
    fontWeight: "800",
    fontSize: normalizeText(19),
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 30,
  },
  identityText: {
    flex: 1,
  },
  hello: {
    color: colors.textMuted,
    fontSize: normalizeText(13),
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  name: {
    color: colors.text,
    fontSize: normalizeText(19),
    fontWeight: "800",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  rating: {
    color: colors.text,
    fontWeight: "800",
    fontSize: normalizeText(14),
  },
  ratingHint: {
    color: colors.textMuted,
    fontSize: normalizeText(13),
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.sos,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.white,
    fontSize: normalizeText(10),
    fontWeight: "800",
  },
  availability: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  flex: {
    flex: 1,
  },
  availLabel: {
    color: colors.text,
    fontWeight: "800",
    fontSize: normalizeText(15),
  },
  availHint: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: normalizeText(13),
    lineHeight: normalizeText(17),
  },
  availableSection: {
    marginTop: spacing.md,
  },
  onlineEmptyState: {
    alignItems: "center",
    paddingTop: 120,
    paddingHorizontal: spacing.lg,
  },
  noBookingImage: {
    width: "72%",
    maxWidth: 280,
    height: 190,
  },
  noBookingText: {
    color: colors.textMuted,
    fontSize: normalizeText(18),
    fontWeight: "700",
    textAlign: "center",
    marginTop: 0,
  },
  jobCount: {
    color: colors.amber,
    fontWeight: "800",
    marginTop: spacing.lg,
  },
  availableStack: {
    gap: spacing.sm,
  },
  availableCard: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: spacing.sm,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    overflow: "hidden",
  },
  sosDispatchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.sos,
    marginHorizontal: -10,
    marginTop: -10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 58,
  },
  sosDispatchTitle: {
    color: colors.white,
    fontSize: normalizeText(15),
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  sosDispatchSubtitle: {
    color: colors.white,
    fontSize: normalizeText(12),
    marginTop: 2,
  },
  sosHeaderDistance: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  sosHeaderDistanceText: {
    color: colors.white,
    fontSize: normalizeText(15),
    fontWeight: "900",
  },
  sosHeaderArrivalText: {
    color: colors.white,
    fontSize: normalizeText(11),
    fontWeight: "700",
    marginTop: 2,
  },
  autoReassignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: -10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 38,
    zIndex: 1,
  },
  autoReassignLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  autoReassignText: {
    color: colors.textMuted,
    fontSize: normalizeText(10),
    fontWeight: "900",
  },
  reassignTrack: {
    flex: 1,
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.amberSoft,
    overflow: "hidden",
  },
  reassignProgress: {
    width: "70%",
    height: "100%",
    backgroundColor: colors.amber,
    borderRadius: 4,
  },
  reassignTime: {
    color: colors.text,
    fontSize: normalizeText(12),
    fontWeight: "800",
  },
  pickupHeader: {
    marginHorizontal: -spacing.md,
    marginTop: -spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    backgroundColor: colors.amber,
  },
  emergencyCard: {
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    marginHorizontal: -spacing.sm,
    padding: 10,
    marginTop: -10,
  },
  emergencyCardHeader: {
    backgroundColor: colors.sos,
  },
  pickupHeaderText: {
    color: colors.bg,
    fontSize: normalizeText(16),
    fontWeight: "800",
  },
  emergencyHeader: {
    backgroundColor: colors.sos,
  },
  scheduledHeader: {
    backgroundColor: colors.blue,
  },
  badges: {
    flexDirection: "row",
    gap: 6,
  },
  bookingBadge: {
    color: colors.textMuted,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: normalizeText(12),
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  scheduledCard: {
    borderColor: "rgba(37, 99, 235, 0.55)",
  },
  availableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 8,
  },
  sosRouteContainer: {
    width: "100%",
    marginBottom: 8,
  },
  sosDetailsContainer: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 7,
  },
  requestTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  requestIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blueSoft,
  },
  emergencyRequestIcon: {
    backgroundColor: colors.sosSoft,
  },
  availableType: {
    color: colors.text,
    fontSize: normalizeText(17),
    fontWeight: "800",
    flex: 1,
  },
  sosDispatchType: {
    fontSize: normalizeText(15),
    color: colors.text,
  },
  highPriorityBadge: {
    backgroundColor: "rgba(255, 77, 79, 0.12)",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  highPriorityText: {
    color: colors.sos,
    fontSize: normalizeText(10),
    fontWeight: "900",
  },
  sosCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 2,
  },
  sosAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: "#A7C7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sosAvatarText: {
    color: colors.blue,
    fontSize: normalizeText(12),
    fontWeight: "900",
  },
  sosCustomerName: {
    flex: 1,
    color: colors.text,
    fontSize: normalizeText(16),
    fontWeight: "800",
  },
  sosCallButton: {
    width: 31,
    height: 31,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  sosVehicleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sosVehicleInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  sosVehicleName: {
    color: colors.text,
    fontSize: normalizeText(18),
    fontWeight: "800",
    marginTop: 3,
  },
  sosSectionLabel: {
    color: colors.textMuted,
    fontSize: normalizeText(11),
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  sosPlateBlock: {
    alignItems: "flex-end",
  },
  sosPlate: {
    color: colors.text,
    fontSize: normalizeText(12),
    fontWeight: "800",
    marginTop: 3,
    letterSpacing: 0.5,
  },
  sosSymptoms: {
    flexDirection: "row",
    marginTop: 10,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#FFF8F8",
  },
  sosSymptomsAccent: {
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.sos,
    marginRight: 9,
  },
  sosSymptomsContent: {
    flex: 1,
  },
  sosFareBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 7,
    padding: 8,
    borderWidth: 1,
    borderColor: "#CFE0FF",
    borderRadius: 9,
    backgroundColor: "#F5F9FF",
  },
  sosFareText: {
    flex: 1,
  },
  sosFareLabel: {
    color: colors.textMuted,
    fontSize: normalizeText(12),
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  sosFareHint: {
    color: colors.textMuted,
    fontSize: normalizeText(11),
    marginTop: 4,
  },
  sosFareValue: {
    color: "#1D4294",
    fontSize: normalizeText(18),
    fontWeight: "900",
  },
  sosActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 7,
  },
  sosAcceptButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: "#0EA54B",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  sosAcceptText: {
    color: colors.white,
    fontSize: normalizeText(15),
    fontWeight: "900",
  },
  sosDeclineButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E88A8A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
    backgroundColor: colors.white,
  },
  sosDeclineText: {
    color: colors.textMuted,
    fontSize: normalizeText(15),
    fontWeight: "800",
  },
  requestCustomer: {
    color: colors.text,
    fontSize: normalizeText(22),
    fontWeight: "800",
    marginTop: 10,
  },
  requestInfoGrid: {
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  requestInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  requestInfoText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: normalizeText(15),
    fontWeight: "600",
  },
  requestIssue: {
    color: colors.textDim,
    fontSize: normalizeText(15),
    lineHeight: normalizeText(21),
    marginTop: 12,
  },
  sosIssue: {
    color: colors.sos,
    fontSize: normalizeText(15),
    fontWeight: "700",
    lineHeight: normalizeText(21),
    marginTop: 4,
  },
  newLabel: {
    color: colors.success,
    fontSize: normalizeText(12),
    fontWeight: "800",
  },
  emergencyText: {
    color: colors.sos,
  },
  scheduledText: {
    color: colors.blue,
  },
  availableVehicle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: normalizeText(17),
    marginTop: spacing.xs,
  },
  availableIssue: {
    color: colors.textMuted,
    lineHeight: normalizeText(20),
    marginTop: 4,
  },
  acceptJobButton: {
    flex: 1,
    backgroundColor: colors.amber,
    borderRadius: 8,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  jobActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  declineJobButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.sos,
    borderRadius: 8,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  declineJobText: {
    color: colors.sos,
    fontWeight: "800",
  },
  bookingDetails: {
    gap: 4,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  vehicleDetails: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  vehicleDetailsTitle: {
    color: colors.text,
    fontSize: normalizeText(13),
    fontWeight: "800",
    marginBottom: 2,
  },
  bookingDetail: {
    color: colors.textMuted,
    fontSize: normalizeText(13),
    lineHeight: normalizeText(18),
  },
  compactSummary: {
    flexDirection: "row",
    justifyContent: "flex-end",
    minHeight: 30,
  },
  compactRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  compactName: {
    color: colors.text,
    fontSize: normalizeText(17),
    fontWeight: "700",
  },
  compactVehicle: {
    color: colors.textMuted,
    fontSize: normalizeText(14),
    fontWeight: "600",
  },
  compactDistance: {
    color: colors.amber,
    fontSize: normalizeText(13),
    fontWeight: "800",
  },
  requestValues: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  requestValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  requestValue: {
    flex: 1,
    color: colors.text,
    fontSize: normalizeText(15),
    lineHeight: normalizeText(20),
  },
  routeBox: {
    backgroundColor: colors.bgInput,
    borderRadius: 0,
    padding: spacing.md,
    gap: 6,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  routeText: {
    flex: 1,
  },
  routeTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: normalizeText(14),
  },
  routeLine: {
    height: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.textDim,
    marginLeft: 8,
  },
  detailsPanel: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailLabel: {
    color: colors.textDim,
    fontSize: normalizeText(11),
    fontWeight: "800",
    letterSpacing: 0.7,
    marginTop: 5,
  },
  detailValue: {
    color: colors.textMuted,
    fontSize: normalizeText(14),
    marginTop: 2,
  },
  jobDetailScreen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  jobDetailHeader: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.amber,
  },
  emergencyDetailHeader: {
    backgroundColor: colors.sos,
  },
  scheduledDetailHeader: {
    backgroundColor: colors.blue,
  },
  detailBackButton: {
    width: 42,
    height: 42,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  detailHeaderSpacer: {
    width: 42,
  },
  jobDetailHeaderTitle: {
    color: colors.white,
    fontSize: normalizeText(19),
    fontWeight: "800",
  },
  jobDetailContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  jobDetailType: {
    color: colors.amber,
    fontSize: normalizeText(13),
    fontWeight: "800",
    letterSpacing: 1,
  },
  scheduledDetailText: {
    color: colors.blue,
  },
  jobDetailCustomer: {
    color: colors.text,
    fontSize: normalizeText(29),
    fontWeight: "800",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  detailRoute: {
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  detailRouteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  detailRouteText: {
    flex: 1,
  },
  detailRouteLabel: {
    color: colors.textMuted,
    fontSize: normalizeText(13),
    fontWeight: "700",
  },
  detailRouteValue: {
    color: colors.text,
    fontSize: normalizeText(17),
    lineHeight: normalizeText(24),
    marginTop: 3,
  },
  detailRouteHint: {
    color: colors.amber,
    fontSize: normalizeText(13),
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  detailRouteLine: {
    height: 22,
    borderLeftWidth: 1,
    borderLeftColor: colors.textDim,
    marginLeft: 10,
  },
  fullDetailSection: {
    paddingTop: spacing.lg,
  },
  fullDetailLabel: {
    color: colors.textDim,
    fontSize: normalizeText(12),
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  contactDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  callMotoristButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    marginLeft: spacing.md,
  },
  distanceLabel: {
    color: colors.textDim,
    fontSize: normalizeText(12),
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  distanceValue: {
    color: colors.amber,
    fontSize: normalizeText(25),
    fontWeight: "800",
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  scheduledDistanceValue: {
    color: colors.blue,
  },
  fullDetailValue: {
    color: colors.text,
    fontSize: normalizeText(17),
    lineHeight: normalizeText(23),
    marginTop: 4,
  },
  fullDetailActions: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  detailAcceptButton: {
    minHeight: 50,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  scheduledAcceptButton: {
    backgroundColor: colors.blue,
  },
  detailDeclineButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.sos,
    alignItems: "center",
    justifyContent: "center",
  },
  scheduledDeclineButton: {
    borderColor: colors.blue,
  },
  declineModalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.md,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  declineModalCard: {
    backgroundColor: colors.bgElevated,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  declineModalTitle: {
    color: colors.text,
    fontSize: normalizeText(21),
    fontWeight: "800",
  },
  declineModalHint: {
    color: colors.textMuted,
    fontSize: normalizeText(14),
    lineHeight: normalizeText(20),
    marginTop: spacing.xs,
  },
  declineReasonInput: {
    minHeight: 100,
    marginTop: spacing.md,
    padding: spacing.sm,
    color: colors.text,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: "top",
    fontSize: normalizeText(15),
  },
  declineModalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelDeclineButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelDeclineText: {
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: normalizeText(15),
  },
  confirmDeclineButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sos,
  },
  confirmDeclineText: {
    color: colors.white,
    fontWeight: "800",
    textAlign: "center",
    fontSize: normalizeText(15),
  },
  acceptJobText: {
    color: colors.bg,
    fontWeight: "800",
    fontSize: normalizeText(16),
  },
  emptyJobs: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    padding: spacing.md,
  },
  emptyJobsText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: normalizeText(15),
  },
  emptyJobsHint: {
    color: colors.textMuted,
    fontSize: normalizeText(13),
    marginTop: 4,
  },
  jobsError: {
    color: colors.sos,
    fontSize: normalizeText(13),
    marginBottom: spacing.sm,
  },
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.text,
    fontSize: normalizeText(17),
    fontWeight: "800",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  link: {
    color: colors.amber,
    fontWeight: "700",
    marginTop: spacing.lg,
    fontSize: normalizeText(15),
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metric: {
    flexGrow: 1,
    flexBasis: "30%",
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  metricWide: {
    flexBasis: "100%",
    backgroundColor: colors.amberSoft,
    borderColor: "rgba(240, 162, 2, 0.35)",
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: normalizeText(13),
    fontWeight: "600",
  },
  metricValue: {
    marginTop: 4,
    color: colors.text,
    fontSize: normalizeText(29),
    fontWeight: "800",
  },
  metricValueSm: {
    marginTop: 4,
    color: colors.text,
    fontSize: normalizeText(19),
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.8,
  },
});