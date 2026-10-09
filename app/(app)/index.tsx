import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
    Animated,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Image,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useMechanic } from "@/contexts/MechanicContext";
import { supabase } from "@/lib/supabase";
import { colors, radii, spacing } from "@/lib/theme";

type AvailableJob = {
  id: string;
  motorist_id: string;
  vehicle_type: string | null;
  vehicle_issue: string | null;
  request_type: string | null;
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
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function formatDistance(
  mechanicLocation: Coordinates | null,
  job: AvailableJob,
) {
  if (
    !mechanicLocation ||
    job.latitude === null ||
    job.longitude === null
  ) {
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

function displayName(fullName: string | undefined, email: string | undefined) {
  if (fullName?.trim()) return fullName.trim();
  const local = email?.split("@")[0];
  if (!local) return "Mekaniko";
  return local.replace(/[._]/g, " ");
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatScheduledDate(value: string | null) {
  if (!value) return "Date not specified";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPickupLocation(job: AvailableJob) {
  if (job.latitude === null || job.longitude === null) {
    return "Location not provided";
  }
  return `${job.latitude.toFixed(5)}, ${job.longitude.toFixed(5)}`;
}

export default function MechanicHomeScreen() {
  const { session } = useAuth();
  const {
    online,
    setOnline,
    rating,
    unreadNotifications,
  } = useMechanic();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [sidebarProgress] = useState(() => new Animated.Value(0));
  const [availableJobs, setAvailableJobs] = useState<AvailableJob[]>([]);
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<AvailableJob | null>(null);
  const [declineJobId, setDeclineJobId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [mechanicLocation, setMechanicLocation] =
    useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (!online) {
      return;
    }

    let active = true;
    async function refreshMechanicLocation() {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          throw new Error("Location permission is required to calculate distance.");
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
  }, [online]);

  useEffect(() => {
    let active = true;
    async function loadAvatar() {
      if (!session?.user.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("avatar_path")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!active || !data?.avatar_path) return;
      const publicUrl = supabase.storage
        .from("mechanic-avatars")
        .getPublicUrl(data.avatar_path).data.publicUrl;
      if (active) setAvatarUrl(`${publicUrl}?v=${Date.now()}`);
    }
    void loadAvatar();
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  useEffect(() => {
    let active = true;

    async function loadAvailableJobs() {
      if (!online || !session?.user.id) {
        setAvailableJobs([]);
        return;
      }

      const { data, error } = await supabase
        .from("service_requests")
        .select("id,motorist_id,vehicle_type,vehicle_issue,request_type,created_at,scheduled_at,latitude,longitude")
        .is("mechanic_id", null)
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
            contact: profile.mobile_number || profile.email || "Not provided",
          },
        ]),
      );
      setJobsError(null);
      setAvailableJobs(
        requests.map((job) => ({
          ...job,
          customer_name: profiles.get(job.motorist_id)?.name || "Customer",
          customer_contact:
            profiles.get(job.motorist_id)?.contact || "Not provided",
        })),
      );
    }

    void loadAvailableJobs();
    const interval = setInterval(() => void loadAvailableJobs(), 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [online, session?.user.id]);

  async function acceptJob(id: string) {
    if (!session?.user.id) return;
    setAcceptingJobId(id);
    const { error } = await supabase
      .from("service_requests")
      .update({ mechanic_id: session.user.id, status: "accepted" })
      .eq("id", id)
      .is("mechanic_id", null);

    if (error) {
      setJobsError(error.message);
    } else {
      setAvailableJobs((jobs) => jobs.filter((job) => job.id !== id));
      setSelectedJob(null);
      router.push("./jobs");
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

  async function openCustomerDirections(job: AvailableJob) {
    if (
      !mechanicLocation ||
      job.latitude === null ||
      job.longitude === null
    ) {
      setJobsError(
        "Directions unavailable because your location or the customer's location is missing.",
      );
      return;
    }

    const origin = `${mechanicLocation.latitude},${mechanicLocation.longitude}`;
    const destination = `${job.latitude},${job.longitude}`;
    const mapsUrl =
      `https://www.google.com/maps/dir/?api=1&origin=${origin}` +
      `&destination=${destination}&travelmode=driving`;

    try {
      await Linking.openURL(mapsUrl);
    } catch {
      setJobsError("Unable to open Google Maps.");
    }
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
            <View style={styles.avatar}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{initials(name)}</Text>
              )}
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={13} color={colors.amber} />
                <Text style={styles.rating}>{rating.toFixed(1)}</Text>
                <Text style={styles.ratingHint}>rating</Text>
              </View>
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push("./notifications")}
            style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={colors.text}
            />
            {unreadNotifications > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadNotifications}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={styles.availability}>
          <View style={styles.flex}>
            <Text style={styles.availLabel}>
              {online ? "Online · accepting jobs" : "Offline"}
            </Text>
            <Text style={styles.availHint}>
              {online
                ? "You are visible to nearby motorists."
                : "You will not appear on the SOS radar while offline."}
            </Text>
          </View>
          <Switch
            value={online}
            onValueChange={setOnline}
            trackColor={{ false: colors.border, true: colors.success }}
            thumbColor={colors.white}
            ios_backgroundColor={colors.border}
          />
        </View>

        {online ? (
          <View style={styles.availableSection}>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>Available job requests</Text>
              <Text style={styles.jobCount}>{availableJobs.length}</Text>
            </View>
            {jobsError ? <Text style={styles.jobsError}>{jobsError}</Text> : null}
            {locationError ? (
              <Text style={styles.jobsError}>
                Distance unavailable: {locationError}
              </Text>
            ) : null}
            {availableJobs.length === 0 ? (
              <View style={styles.emptyJobs}>
                <Text style={styles.emptyJobsText}>No new requests right now.</Text>
                <Text style={styles.emptyJobsHint}>Stay online to receive nearby service requests.</Text>
              </View>
            ) : (
              <View style={styles.availableStack}>
                {availableJobs.map((job) => (
                  <Pressable
                    key={job.id}
                    onPress={() => setSelectedJob(job)}
                    style={[
                      styles.availableCard,
                      job.request_type === "emergency"
                        ? styles.emergencyCard
                        : styles.scheduledCard,
                    ]}
                  >
                    <View
                      style={[
                        styles.pickupHeader,
                        job.request_type === "emergency"
                          ? styles.emergencyHeader
                          : styles.scheduledHeader,
                      ]}
                    >
                      <Text style={styles.pickupHeaderText}>
                        {job.request_type === "emergency"
                          ? "Urgent request · Pick Up Now"
                          : formatScheduledDate(job.scheduled_at)}
                      </Text>
                    </View>
                    <View style={styles.availableHeader}>
                      <View style={styles.badges}>
                        <Text style={styles.bookingBadge}>Service</Text>
                        <Text style={styles.bookingBadge}>
                          {job.request_type === "emergency" ? "Priority" : "Scheduled"}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={
                          job.request_type === "emergency"
                            ? colors.sos
                            : colors.blue
                        }
                      />
                    </View>
                    <View style={styles.compactSummary}>
                      <Text style={styles.compactDistance}>
                        {formatDistance(mechanicLocation, job)}
                      </Text>
                    </View>
                    <View style={styles.requestValues}>
                      <View style={styles.requestValueRow}>
                        <Ionicons name="location-outline" size={18} color={colors.sos} />
                        <Text style={styles.requestValue} numberOfLines={2}>
                          {formatPickupLocation(job)}
                        </Text>
                      </View>
                      <View style={styles.requestValueRow}>
                        <Ionicons name="person-outline" size={18} color={colors.textMuted} />
                        <Text style={styles.requestValue} numberOfLines={1}>
                          {job.customer_name}
                        </Text>
                      </View>
                      <View style={styles.requestValueRow}>
                        <Ionicons name="construct-outline" size={18} color={colors.textMuted} />
                        <Text style={styles.requestValue} numberOfLines={2}>
                          {job.vehicle_issue || "Service details not provided"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
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
          <SafeAreaView style={styles.jobDetailScreen} edges={["top", "bottom"]}>
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
                <Ionicons name="arrow-back" size={24} color={colors.white} />
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
                onPress={() => void openCustomerDirections(selectedJob)}
                accessibilityRole="link"
                accessibilityLabel="Open customer location in Google Maps"
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
                    <Text style={styles.detailRouteLabel}>Customer location</Text>
                    <Text style={styles.detailRouteValue}>
                      {selectedJob.latitude !== null &&
                      selectedJob.longitude !== null
                        ? `${selectedJob.latitude.toFixed(5)}, ${selectedJob.longitude.toFixed(5)}`
                        : "Location not provided"}
                    </Text>
                    <Text
                      style={[
                        styles.detailRouteHint,
                        selectedJob.request_type !== "emergency" &&
                          styles.scheduledDetailText,
                      ]}
                    >
                      Tap to open directions in Google Maps
                    </Text>
                  </View>
                  <Ionicons
                    name="open-outline"
                    size={20}
                    color={
                      selectedJob.request_type === "emergency"
                        ? colors.amber
                        : colors.blue
                    }
                  />
                </View>
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
                <Text style={styles.fullDetailLabel}>CONTACT NO.</Text>
                <Text style={styles.fullDetailValue}>
                  {selectedJob.customer_contact}
                </Text>
                <Text style={styles.fullDetailLabel}>VEHICLE</Text>
                <Text style={styles.fullDetailValue}>
                  {selectedJob.vehicle_type || "Not provided"}
                </Text>
                <Text style={styles.fullDetailLabel}>SERVICE DETAILS</Text>
                <Text style={styles.fullDetailValue}>
                  {selectedJob.vehicle_issue || "No issue description provided."}
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
                  {acceptingJobId === selectedJob.id ? "Saving..." : "Accept job"}
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
                transform: [{
                  translateX: sidebarProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-300, 0],
                  }),
                }],
              },
            ]}
          >
            <Pressable
              style={styles.sidebarProfile}
              onPress={() => closeSidebar(() => router.push("./profile"))}
            >
              <View style={styles.sidebarAvatar}>
                <Text style={styles.avatarText}>{initials(name)}</Text>
              </View>
              <Text style={styles.sidebarName} numberOfLines={2}>{name}</Text>
            </Pressable>
            <View style={styles.sidebarDivider} />
            <Pressable style={styles.sidebarRow} onPress={() => closeSidebar()}>
              <Ionicons name="help-circle-outline" size={23} color={colors.text} />
              <Text style={styles.sidebarRowText}>Help</Text>
              <Ionicons name="chevron-forward" size={19} color={colors.textDim} />
            </Pressable>
            <Pressable style={styles.sidebarRow} onPress={() => closeSidebar()}>
              <Ionicons name="settings-outline" size={23} color={colors.text} />
              <Text style={styles.sidebarRowText}>Settings</Text>
              <Ionicons name="chevron-forward" size={19} color={colors.textDim} />
            </Pressable>
          </Animated.View>
          <Pressable
            style={styles.sidebarDismiss}
            onPress={() => closeSidebar()}
            accessibilityLabel="Close profile menu"
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
    marginBottom: spacing.md,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 12,
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
  },
  sidebarName: {
    flex: 1,
    color: colors.text,
    fontSize: 16.5,
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
    fontSize: 16,
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
    fontSize: 18,
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
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  name: {
    color: colors.text,
    fontSize: 20,
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
    fontSize: 13,
  },
  ratingHint: {
    color: colors.textMuted,
    fontSize: 12,
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
    fontSize: 9,
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
    fontSize: 14,
  },
  availHint: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  availableSection: {
    marginTop: spacing.lg,
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
    borderRadius: 0,
    padding: spacing.md,
    minHeight: 142,
    overflow: "hidden",
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
    borderColor: "rgba(255, 77, 79, 0.7)",
    backgroundColor: colors.sosSoft,
  },
  emergencyCardHeader: {
    backgroundColor: colors.sos,
  },
  pickupHeaderText: {
    color: colors.bg,
    fontSize: 15,
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
    borderRadius: 0,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: "700",
  },
  scheduledCard: {
    borderColor: "rgba(37, 99, 235, 0.55)",
  },
  availableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  availableType: {
    color: colors.text,
    fontWeight: "800",
    flex: 1,
  },
  newLabel: {
    color: colors.success,
    fontSize: 11,
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
    fontSize: 16,
    marginTop: spacing.sm,
  },
  availableIssue: {
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: 4,
  },
  acceptJobButton: {
    flex: 1,
    backgroundColor: colors.amber,
    borderRadius: 0,
    minHeight: 42,
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
    borderRadius: 0,
    minHeight: 42,
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
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 2,
  },
  bookingDetail: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
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
    fontSize: 16,
    fontWeight: "700",
  },
  compactVehicle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  compactDistance: {
    color: colors.amber,
    fontSize: 12,
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
    fontSize: 14,
    lineHeight: 19,
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
    fontSize: 13,
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
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginTop: 5,
  },
  detailValue: {
    color: colors.textMuted,
    fontSize: 13,
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
    fontSize: 18,
    fontWeight: "800",
  },
  jobDetailContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  jobDetailType: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  scheduledDetailText: {
    color: colors.blue,
  },
  jobDetailCustomer: {
    color: colors.text,
    fontSize: 28,
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
    fontSize: 12,
    fontWeight: "700",
  },
  detailRouteValue: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 3,
  },
  detailRouteHint: {
    color: colors.amber,
    fontSize: 12,
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
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  distanceLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  distanceValue: {
    color: colors.amber,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  scheduledDistanceValue: {
    color: colors.blue,
  },
  fullDetailValue: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
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
    fontSize: 20,
    fontWeight: "800",
  },
  declineModalHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
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
  },
  acceptJobText: {
    color: colors.bg,
    fontWeight: "800",
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
  },
  emptyJobsHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  jobsError: {
    color: colors.sos,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.text,
    fontSize: 16,
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
    fontSize: 12,
    fontWeight: "600",
  },
  metricValue: {
    marginTop: 4,
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  metricValueSm: {
    marginTop: 4,
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.8,
  },
});
