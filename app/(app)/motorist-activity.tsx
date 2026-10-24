import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

import { MotoristHomeHeader } from "@/components/MotoristHomeHeader";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { normalizeText } from "@/lib/typography";

type BookingColors = {
  bg: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
};

const mechanicAvatarUrlCache = new Map<string, string>();
const mechanicServicesCountCache = new Map<string, number>();
const mechanicServicesCountKey = (mechanicId: string) =>
  `mechanic_services_count_${mechanicId}`;
const CANCELLATION_REASONS = [
  "Mechanic is taking too long",
  "Mechanic is unresponsive",
  "Pinned the wrong location/vehicle",
  "Issue was resolved locally",
  "Other",
];

function ScheduledBookingCard({
  request,
  colors,
  onCancel,
}: {
  request: any;
  colors: BookingColors;
  onCancel: (id: string) => void;
}) {
  const mapRef = useRef<WebView>(null);
  const router = useRouter();
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [updatingChargeId, setUpdatingChargeId] = useState<string | null>(null);
  const [bookingAddress, setBookingAddress] = useState("Address unavailable");
  const normalizedStatus = String(request.status ?? "").toLowerCase();
  const isAwaitingMechanic = ["scheduled", "pending"].includes(normalizedStatus);
  const isTrackingActive = [
    "in_transit",
    "arrived",
    "in_progress",
  ].includes(normalizedStatus);
  const currentStep =
    normalizedStatus === "in_progress"
      ? 3
      : normalizedStatus === "completed"
        ? 4
        : normalizedStatus === "in_transit" || normalizedStatus === "arrived"
          ? 2
          : 1;
  const progressStatusLabel =
    isAwaitingMechanic
      ? "WAITING FOR ACCEPTANCE"
      : currentStep === 1
        ? "CONFIRMED"
        : currentStep === 2
          ? "ON THE WAY"
          : currentStep === 3
            ? "IN SERVICE"
            : "COMPLETED";
  const additionalCharges = Array.isArray(request.additional_charges)
    ? request.additional_charges
    : [];
  const approvedAdditionalTotal = additionalCharges
    .filter((charge: any) => charge.status === "approved")
    .reduce((sum: number, charge: any) => sum + Number(charge.amount || 0), 0);
  const payableTotal =
    Number(request.estimated_total ?? request.service_price ?? 0) +
    approvedAdditionalTotal;

  useEffect(() => {
    let active = true;
    const latitude = Number(request.latitude);
    const longitude = Number(request.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return () => {
        active = false;
      };
    }

    void Location.reverseGeocodeAsync({ latitude, longitude })
      .then(([address]) => {
        if (!active) return;
        const formatted = [
          address?.name,
          address?.street,
          address?.district,
          address?.city,
          address?.region,
        ]
          .filter(Boolean)
          .filter(
            (value, index, values) =>
              values.findIndex(
                (candidate) =>
                  String(candidate).toLowerCase() === String(value).toLowerCase(),
              ) === index,
          )
          .join(", ");
        setBookingAddress(formatted || "Address unavailable");
      })
      .catch(() => {
        if (active) setBookingAddress("Address unavailable");
      });

    return () => {
      active = false;
    };
  }, [request.latitude, request.longitude]);

  async function updateChargeStatus(
    chargeId: string,
    status: "approved" | "rejected",
  ) {
    setUpdatingChargeId(chargeId);
    const updatedCharges = additionalCharges.map((charge: any) =>
    charge.id === chargeId ? { ...charge, status } : charge,
    );
    const { error } = await supabase
    .from("service_requests")
    .update({ additional_charges: updatedCharges })
    .eq("id", request.id)
    .eq("motorist_id", request.motorist_id);
    if (error) {
    Alert.alert("Unable to update charge", error.message);
    }
    setUpdatingChargeId(null);
  }
  const latitude = Number(request.latitude) || 14.5794;
  const longitude = Number(request.longitude) || 121.0359;
  const mechanicLatitude = Number(request.mechanic_latitude);
  const mechanicLongitude = Number(request.mechanic_longitude);
  const hasMechanicLocation =
    Number.isFinite(mechanicLatitude) && Number.isFinite(mechanicLongitude);
  const mechanicLogoUri = Image.resolveAssetSource(
    require("../../assets/images/mechaniclogo.png"),
  ).uri;
  const mapHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { height: 100%; margin: 0; }
          .leaflet-control-attribution { display: none; }
          .you-pin { width: 38px; height: 38px; border-radius: 50%; background: #2450D8; border: 3px solid #fff; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; box-shadow: 0 2px 6px rgba(0,0,0,.3); }
          .mechanic-pin { width: 48px; height: 48px; border-radius: 50%; background: #FFFFFF; border: 3px solid #18A957; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
          .mechanic-pin img { width: 100%; height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var mapCenter = [${latitude}, ${longitude}];
          var map = L.map('map', { zoomControl: false, attributionControl: false }).setView(mapCenter, 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
          var icon = L.divIcon({ html: '<div class="you-pin">⌖</div>', className: '', iconSize: [38, 38], iconAnchor: [19, 19] });
          L.marker(mapCenter, { icon: icon }).addTo(map);
          var mechanicMarker = null;
          var mechanicLogoUrl = ${JSON.stringify(mechanicLogoUri)};
          window.updateMechanicLocation = function(lat, lng) {
            var mechanicPoint = [lat, lng];
            if (!mechanicMarker) {
              var mechanicIcon = L.divIcon({ html: '<div class="mechanic-pin"><img src="' + mechanicLogoUrl + '" /></div>', className: '', iconSize: [48, 48], iconAnchor: [24, 24] });
              mechanicMarker = L.marker(mechanicPoint, { icon: mechanicIcon }).addTo(map);
            } else {
              mechanicMarker.setLatLng(mechanicPoint);
            }
            map.fitBounds([mapCenter, mechanicPoint], { padding: [32, 32], maxZoom: 16 });
          };
          ${hasMechanicLocation ? `window.updateMechanicLocation(${mechanicLatitude}, ${mechanicLongitude});` : ""}
          setTimeout(function () { map.invalidateSize(); }, 100);
        </script>
      </body>
    </html>
  `;

  useEffect(() => {
    if (!isTrackingActive || !hasMechanicLocation) return;
    mapRef.current?.injectJavaScript(
      `if (window.updateMechanicLocation) { window.updateMechanicLocation(${mechanicLatitude}, ${mechanicLongitude}); } true;`,
    );
  }, [
    hasMechanicLocation,
    isTrackingActive,
    mechanicLatitude,
    mechanicLongitude,
  ]);

  return (
    <View style={styles.scheduledBooking}>
      <Text style={[styles.bookingsHeading, { color: colors.text }]}>
        My Bookings
      </Text>
      <View style={styles.bookingStatusBar}>
        <View style={styles.statusDot} />
        <Text style={styles.bookingStatusText}>{progressStatusLabel}</Text>
      </View>

      {isTrackingActive ? (
        <View
          style={[
            styles.bookingMapPreview,
          ]}
        >
          <WebView
            ref={mapRef}
            source={{ html: mapHtml }}
            style={styles.bookingLeafletMap}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            nestedScrollEnabled={false}
          />
          <View style={styles.bookingMapControls}>
            <TouchableOpacity
              accessibilityLabel="Recenter booking map"
              style={styles.mapControl}
              onPress={() =>
                mapRef.current?.injectJavaScript(
                  "map.setView(mapCenter, 15, { animate: true }); true;",
                )
              }
            >
              <Ionicons name="locate-outline" size={24} color="#172B66" />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={
                isMapFullscreen
                  ? "Exit full screen booking map"
                  : "Open full screen booking map"
              }
              style={styles.mapControl}
              onPress={() => setIsMapFullscreen((value) => !value)}
            >
              <Ionicons
                name={isMapFullscreen ? "contract-outline" : "scan-outline"}
                size={24}
                color="#172B66"
              />
            </TouchableOpacity>
          </View>
          <View style={styles.bookingMapLabel}>
            <Ionicons name="navigate-outline" size={18} color="#18A957" />
            <Text style={styles.bookingMapLabelText}>
              Real-Time Mechanic Tracking
            </Text>
          </View>
        </View>
      ) : null}

      <Modal
        visible={isMapFullscreen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsMapFullscreen(false)}
      >
        <View style={styles.fullscreenMapContainer}>
          <WebView
            ref={mapRef}
            source={{ html: mapHtml }}
            style={styles.fullscreenBookingMap}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
          />
          <TouchableOpacity
            accessibilityLabel="Close full screen booking map"
            style={styles.fullscreenCloseButton}
            onPress={() => setIsMapFullscreen(false)}
          >
            <Ionicons name="close" size={28} color="#172B66" />
          </TouchableOpacity>
          <View style={styles.fullscreenMapControls}>
            <TouchableOpacity
              accessibilityLabel="Recenter full screen booking map"
              style={styles.mapControl}
              onPress={() =>
                mapRef.current?.injectJavaScript(
                  "map.setView(mapCenter, 15, { animate: true }); true;",
                )
              }
            >
              <Ionicons name="locate-outline" size={24} color="#172B66" />
            </TouchableOpacity>
          </View>
          <View style={styles.fullscreenMapLabel}>
            <Ionicons name="navigate-outline" size={18} color="#18A957" />
            <Text style={styles.bookingMapLabelText}>
              Real-Time Mechanic Tracking
            </Text>
          </View>
        </View>
      </Modal>

      {!isAwaitingMechanic ? (
        <View
          style={[styles.mechanicBookingCard, { backgroundColor: colors.card }]}
        >
        <View style={styles.mechanicBookingHeader}>
          <ProfileAvatar
            uri={request.mechanic?.avatarUrl}
            name={request.mechanic?.name}
            size={55}
            backgroundColor="#7A8794"
          />
          <View style={styles.mechanicBookingIdentity}>
            <Text style={[styles.mechanicBookingName, { color: "#2C2F35" }]}>
              {isAwaitingMechanic
                ? "Mechanic request sent"
                : request.mechanic?.name || request.mechanic_name || "Mechanic assigned"}
            </Text>
            <View style={styles.mechanicRatingRow}>
              <Text style={styles.ratingStar}>★</Text>
              <Text style={styles.ratingValue}>
                {Number(request.mechanic?.rating ?? 5).toFixed(1)}
              </Text>
              {request.mechanic?.servicesCount !== undefined ? (
                <Text style={styles.servicesValue}>
                  · {request.mechanic.servicesCount} services
                </Text>
              ) : null}
            </View>
            <Text style={styles.mechanicVehicleText}>
              {request.vehicle_type || "Honda Click 125"}{" "}
              <Text style={styles.mechanicPlateText}>
                {request.plate_number || "884-NK"}
              </Text>
            </Text>
          </View>
          <View style={styles.moderateBadge}>
            <Text style={styles.moderateBadgeText}>
              {isAwaitingMechanic ? "WAITING" : "SCHEDULED"}
            </Text>
          </View>
        </View>
        <View style={styles.vehicleSummary}>
          <Ionicons name="construct-outline" size={20} color="#F08A00" />
          <Text style={styles.vehicleSummaryText}>
            {isAwaitingMechanic
              ? "Waiting for mechanic acceptance"
              : "Mechanic"}
          </Text>
        </View>
        <View style={styles.bookingActions}>
          <TouchableOpacity
            style={styles.callMechanicButton}
            onPress={() => {
              const phone = request.mechanic?.mobileNumber;
              if (!phone) {
                Alert.alert("Number unavailable", "This mechanic has not added a contact number.");
                return;
              }
              void Linking.openURL(`tel:${phone}`);
            }}
          >
            <Ionicons name="call-outline" size={20} color="#FFFFFF" />
            <Text style={styles.callMechanicText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.squareBookingButton}
            onPress={() =>
              router.push({
                pathname: "/messages",
                params: { serviceRequestId: String(request.id) },
              })
            }
          >
            <Ionicons name="chatbox-outline" size={26} color="#172B66" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.squareBookingButton}
            onPress={() => onCancel(String(request.id))}
            accessibilityLabel="Open booking options"
          >
            <Ionicons name="ellipsis-vertical" size={26} color="#172B66" />
          </TouchableOpacity>
        </View>
      </View>
      ) : null}

      <View style={[styles.progressCard, { backgroundColor: colors.card }]}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressTitle, { color: colors.text }]}>
            Service Progress
          </Text>
          <Text style={styles.progressStep}>STEP {currentStep} OF 4</Text>
        </View>
        {[
          [
            isAwaitingMechanic ? "Waiting for Acceptance" : "Request Confirmed",
            isAwaitingMechanic
              ? "Your request was sent to the mechanic."
              : "Mechanic assigned and parts prepared.",
            "✓",
            "#18A957",
          ],
          ["Mechanic on the way", "Now on the way!", "⌃", "#C44A00"],
          [
            "Mechanic in service",
            "Free 15-point electronic stator and battery health test.",
            "≡",
            "#A8B0C0",
          ],
          [
            "Repair & Cash Settlement",
            "Testing, digital receipt & 30-day warranty release.",
            "♢",
            "#A8B0C0",
          ],
        ].map(([title, subtitle, icon, color], index) => (
          <View key={title} style={styles.progressRow}>
            <View
              style={[
                styles.progressIcon,
                {
                  backgroundColor:
                    index + 1 < currentStep
                      ? "#18A957"
                      : index === 0 &&
                          normalizedStatus === "accepted"
                        ? "#18A957"
                      : index + 1 === currentStep
                        ? "#C44A00"
                        : "#A8B0C0",
                },
              ]}
            >
              <Text style={styles.progressIconText}>{icon}</Text>
            </View>
            <View style={styles.progressCopy}>
              <Text
                style={[
                  styles.progressRowTitle,
                  {
                    color:
                      index + 1 === currentStep
                      ? normalizedStatus === "accepted" && index === 0
                        ? "#18A957"
                        : "#C44A00"
                      : index + 1 < currentStep
                        ? colors.text
                        : "#7D8492",
                  },
                ]}
              >
                {title}
              </Text>
              <Text
                style={[
                  styles.progressRowSubtitle,
                  { color: colors.textMuted },
                ]}
              >
                {subtitle}
              </Text>
            </View>
            <Text
              style={[
                styles.progressTime,
                { color: index < 2 ? colors.textMuted : "#A8B0C0" },
              ]}
            >
              {index + 1 < currentStep
                ? "Done"
                : index + 1 === currentStep
                  ? progressStatusLabel
                  : "Pending"}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.referenceCard, { backgroundColor: colors.card }]}>
        <Text style={styles.referenceEyebrow}>BOOKING REFERENCE</Text>
        <Text style={[styles.referenceId, { color: colors.text }]}>
          #{String(request.id).slice(0, 8).toUpperCase()}
        </Text>
        <View style={styles.referenceRow}>
          <Text style={[styles.referenceLabel, { color: colors.textMuted }]}>
            Serviced Vehicle
          </Text>
          <Text style={[styles.referenceValue, { color: colors.text }]}>
            {request.vehicle_type || "Vehicle"}
          </Text>
        </View>
        <View style={styles.referenceRow}>
          <Text style={[styles.referenceLabel, { color: colors.textMuted }]}>
            Location
          </Text>
          <Text style={[styles.referenceValue, { color: colors.text }]}>
            {bookingAddress}
          </Text>
        </View>
        <View style={styles.referenceRow}>
          <Text style={[styles.referenceLabel, { color: colors.textMuted }]}>
            Payment Method
          </Text>
          <Text style={[styles.referenceValue, { color: colors.text }]}>
            Cash
          </Text>
        </View>
        <View style={styles.estimatedFee}>
          <View>
            <Text style={styles.estimatedFeeLabel}>ESTIMATED SERVICE FEE</Text>
            <Text
              style={[
                styles.estimatedFeeDescription,
                { color: colors.textMuted },
              ]}
            >
              Dispatch + Standard Labor
            </Text>
          </View>
          <Text style={styles.estimatedFeeAmount}>
            ₱{payableTotal.toLocaleString("en-PH", {
              minimumFractionDigits: 2,
            })}
          </Text>
        </View>
        {additionalCharges.length > 0 ? (
          <View style={styles.additionalChargesBox}>
            <Text style={styles.additionalChargesTitle}>Additional repair charges</Text>
            {additionalCharges.map((charge: any) => (
              <View key={charge.id} style={styles.additionalChargeRow}>
                <View style={styles.additionalChargeCopy}>
                  <Text style={styles.additionalChargeDescription}>{charge.description}</Text>
                  <Text style={styles.additionalChargeAmount}>
                    ₱{Number(charge.amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                {charge.status === "pending" ? (
                  <View style={styles.additionalChargeActions}>
                    <TouchableOpacity
                      style={styles.rejectChargeButton}
                      onPress={() => void updateChargeStatus(charge.id, "rejected")}
                      disabled={updatingChargeId === charge.id}
                    >
                      <Text style={styles.rejectChargeText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveChargeButton}
                      onPress={() => void updateChargeStatus(charge.id, "approved")}
                      disabled={updatingChargeId === charge.id}
                    >
                      <Text style={styles.approveChargeText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={charge.status === "approved" ? styles.approvedCharge : styles.rejectedCharge}>
                    {charge.status === "approved" ? "Approved" : "Declined"}
                  </Text>
                )}
              </View>
            ))}
            <View style={styles.liveTotalRow}>
              <Text style={styles.liveTotalLabel}>Current payable total</Text>
              <Text style={styles.liveTotalValue}>
                ₱{payableTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function MotoristActivityScreen() {
  const { session } = useAuth();
  const { colors } = useAppTheme();

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptanceNotice, setAcceptanceNotice] = useState<string | null>(null);
  const [cancellationNotice, setCancellationNotice] = useState<string | null>(
    null,
  );
  const [cancelSuccessVisible, setCancelSuccessVisible] = useState(false);
  const previousStatuses = useRef(new Map<string, string>());
  const hasLoadedRequests = useRef(false);

  const fetchMyOrders = useCallback(async () => {
    if (!session?.user.id) return;
    const { data, error } = await supabase
      .from("service_requests")
      .select("*")
      .eq("motorist_id", session.user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mechanicIds = [
        ...new Set(
          data
            .map((request) => request.mechanic_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const mechanicProfiles = new Map<
        string,
        {
          name: string;
          mobileNumber: string | null;
          avatarUrl: string | null;
          rating: number;
          servicesCount: number | undefined;
        }
      >();

      await Promise.all(
        mechanicIds.map(async (mechanicId) => {
          const storedCount = await SecureStore.getItemAsync(
            mechanicServicesCountKey(mechanicId),
          );
          const [{ data: profile }, { count: servicesCount }] = await Promise.all([
            supabase
              .from("profiles")
              .select("full_name,mobile_number,avatar_path,average_rating")
              .eq("id", mechanicId)
              .maybeSingle(),
            supabase
              .from("service_requests")
              .select("id", { count: "exact", head: true })
              .eq("mechanic_id", mechanicId)
              .in("status", ["completed", "closed", "done", "resolved"]),
          ]);

          let avatarUrl: string | null = null;
          if (profile?.avatar_path) {
            avatarUrl = mechanicAvatarUrlCache.get(profile.avatar_path) ?? null;
            if (!avatarUrl) {
              const { data: signedAvatar } = await supabase.storage
                .from("mechanic-avatars")
                .createSignedUrl(profile.avatar_path, 60 * 60);
              avatarUrl = signedAvatar?.signedUrl ?? null;
              if (avatarUrl) {
                mechanicAvatarUrlCache.set(profile.avatar_path, avatarUrl);
              }
            }
          }

          mechanicProfiles.set(mechanicId, {
            name: profile?.full_name || "Mechanic assigned",
            mobileNumber: profile?.mobile_number || null,
            avatarUrl,
            rating: Number(profile?.average_rating ?? 5),
            servicesCount:
              servicesCount ??
              mechanicServicesCountCache.get(mechanicId) ??
              (storedCount === null ? undefined : Number(storedCount)),
          });
          if (servicesCount !== null) {
            mechanicServicesCountCache.set(mechanicId, servicesCount);
            await SecureStore.setItemAsync(
              mechanicServicesCountKey(mechanicId),
              String(servicesCount),
            );
          }
        }),
      );

      const enrichedRequests = data.map((request) => ({
          ...request,
          mechanic: request.mechanic_id
            ? mechanicProfiles.get(request.mechanic_id) ?? null
            : null,
        }));
      if (hasLoadedRequests.current) {
        const newlyAccepted = enrichedRequests.find((request) => {
          const previousStatus = previousStatuses.current.get(request.id);
          return previousStatus && ["pending", "scheduled"].includes(previousStatus) &&
            String(request.status).toLowerCase() === "accepted";
        });
        if (newlyAccepted) {
          setAcceptanceNotice(
            `${newlyAccepted.mechanic?.name || "Your mechanic"} accepted your booking.`,
          );
        }
        const newlyCancelled = enrichedRequests.find((request) => {
          const previousStatus = previousStatuses.current.get(request.id);
          return (
            previousStatus &&
            ["pending", "scheduled", "accepted", "in_transit", "arrived", "in_progress"].includes(
              previousStatus,
            ) &&
            ["cancelled", "canceled"].includes(
              String(request.status).toLowerCase(),
            ) &&
            request.cancelled_by === "mechanic"
          );
        });
        if (newlyCancelled) {
          setCancellationNotice(
            `${newlyCancelled.mechanic?.name || "Your mechanic"} cancelled this booking.`,
          );
        }
      }
      previousStatuses.current = new Map(
        enrichedRequests.map((request) => [request.id, String(request.status).toLowerCase()]),
      );
      hasLoadedRequests.current = true;
      setRequests(enrichedRequests);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (!acceptanceNotice) return;
    const timeout = setTimeout(() => setAcceptanceNotice(null), 7000);
    return () => clearTimeout(timeout);
  }, [acceptanceNotice]);

  useEffect(() => {
    if (!cancellationNotice) return;
    const timeout = setTimeout(() => setCancellationNotice(null), 7000);
    return () => clearTimeout(timeout);
  }, [cancellationNotice]);

  useEffect(() => {
    if (!session?.user.id) return;
    const channel = supabase
      .channel(`motorist_booking_status_${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_requests",
          filter: `motorist_id=eq.${session.user.id}`,
        },
        (payload) => {
          const updatedRequest = payload.new as Record<string, unknown>;
          setRequests((currentRequests) =>
            currentRequests.map((request) =>
              String(request.id) === String(updatedRequest.id)
                ? { ...request, ...updatedRequest }
                : request,
            ),
          );
          const oldStatus = String(
            payload.old.status ?? previousStatuses.current.get(String(payload.new.id)) ?? "",
          ).toLowerCase();
          const newStatus = String(payload.new.status ?? "").toLowerCase();
          if (["pending", "scheduled"].includes(oldStatus) && newStatus === "accepted") {
            setAcceptanceNotice("Your mechanic accepted your booking.");
            void fetchMyOrders();
          } else if (
            ["pending", "scheduled", "accepted", "in_transit", "arrived", "in_progress"].includes(
              oldStatus,
            ) &&
            ["cancelled", "canceled"].includes(newStatus) &&
            payload.new.cancelled_by === "mechanic"
          ) {
            setCancellationNotice("Your mechanic cancelled this booking.");
            void fetchMyOrders();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchMyOrders, session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      void fetchMyOrders();
      const interval = setInterval(() => void fetchMyOrders(), 5000);
      return () => clearInterval(interval);
    }, [fetchMyOrders]),
  );

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [enteringOtherReason, setEnteringOtherReason] = useState(false);
  const [otherCancelReason, setOtherCancelReason] = useState("");
  const [confirmationReason, setConfirmationReason] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancel = (id: string) => {
    setCancelBookingId(id);
    setCancelReason("");
    setEnteringOtherReason(false);
    setOtherCancelReason("");
    setCancelModalVisible(true);
  };

  const confirmCancel = async (selectedReason = cancelReason) => {
    if (!selectedReason) {
      Alert.alert("Reason Required", "Please select a reason for cancelling.");
      return;
    }

    setIsCancelling(true);
    const { error } = await supabase
      .from("service_requests")
      .update({
        status: "cancelled",
        cancelled_by: "motorist",
        cancellation_reason: selectedReason,
      })
      .eq("id", cancelBookingId ?? "");

    if (error) {
      Alert.alert("Unable to cancel booking", error.message);
    } else if (selectedReason === "Issue was resolved locally" || selectedReason === "Other") {
      Alert.alert(
        "Warning Recorded",
        "Cancelling because the issue was resolved locally wastes the dispatched mechanic's time and fuel. Repeated cancellations will result in a temporary account suspension.",
      );
    } else {
      setCancelSuccessVisible(true);
    }

    setCancelModalVisible(false);
    setConfirmationReason(null);
    setCancelBookingId(null);
    setCancelReason("");
    setEnteringOtherReason(false);
    setOtherCancelReason("");
    setIsCancelling(false);
    await fetchMyOrders();
  };

  const openCancellationConfirmation = (reason: string) => {
    setCancelReason(reason);
    setConfirmationReason(reason);
  };

  const filteredRequests = requests.filter((req) =>
    ["pending", "scheduled", "accepted", "in_transit", "arrived", "in_progress"].includes(
      String(req.status ?? "").toLowerCase(),
    ),
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <MotoristHomeHeader />
      {acceptanceNotice ? (
        <View style={[styles.acceptanceNotice, { backgroundColor: colors.card, borderColor: "#B7E4C7" }]}>
          <View style={styles.acceptanceNoticeIcon}>
            <Ionicons name="checkmark" size={19} color="#FFFFFF" />
          </View>
          <View style={styles.acceptanceNoticeCopy}>
            <Text style={[styles.acceptanceNoticeTitle, { color: colors.text }]}>Booking accepted</Text>
            <Text style={[styles.acceptanceNoticeMessage, { color: colors.textMuted }]}>{acceptanceNotice}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setAcceptanceNotice(null)}
            accessibilityLabel="Dismiss booking accepted notification"
            style={styles.acceptanceNoticeClose}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}
      {cancellationNotice ? (
        <View
          style={[
            styles.acceptanceNotice,
            { backgroundColor: colors.card, borderColor: "#F3B5B5" },
          ]}
        >
          <View style={styles.cancellationNoticeIcon}>
            <Ionicons name="close" size={19} color="#FFFFFF" />
          </View>
          <View style={styles.acceptanceNoticeCopy}>
            <Text style={[styles.acceptanceNoticeTitle, { color: colors.text }]}>
              Booking cancelled
            </Text>
            <Text
              style={[
                styles.acceptanceNoticeMessage,
                { color: colors.textMuted },
              ]}
            >
              {cancellationNotice}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setCancellationNotice(null)}
            accessibilityLabel="Dismiss booking cancellation notification"
            style={styles.acceptanceNoticeClose}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}
      <Modal
        visible={cancelSuccessVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCancelSuccessVisible(false)}
      >
        <View style={styles.cancelSuccessOverlay}>
          <View style={[styles.cancelSuccessCard, { backgroundColor: colors.card }]}>
            <View style={styles.cancelSuccessIcon}>
              <Ionicons name="checkmark" size={32} color="#FFFFFF" />
            </View>
            <Text style={[styles.cancelSuccessTitle, { color: colors.text }]}>
              Booking Cancelled
            </Text>
            <Text style={[styles.cancelSuccessMessage, { color: colors.textMuted }]}>
              Your service request has been cancelled successfully.
            </Text>
            <TouchableOpacity
              style={styles.cancelSuccessButton}
              onPress={() => setCancelSuccessVisible(false)}
            >
              <Text style={styles.cancelSuccessButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        alwaysBounceVertical={false}
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 40 }}
          />
        ) : filteredRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={54} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.text }]}>
              No active bookings.
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              You don&apos;t have any active bookings right now.
            </Text>
          </View>
        ) : (
          filteredRequests.map((req) => {
            const requestType = String(req.request_type ?? "").toLowerCase();
            const requestStatus = String(req.status ?? "").toLowerCase();
            const showScheduledStyle =
              Boolean(req.mechanic_id) &&
              (requestType === "scheduled" ||
                requestType === "emergency") &&
              (requestStatus === "scheduled" ||
                ["accepted", "in_transit", "arrived", "in_progress"].includes(
                  requestStatus,
                ));
            return showScheduledStyle ? (
              <ScheduledBookingCard
                key={req.id}
                request={req}
                colors={colors}
                onCancel={handleCancel}
              />
            ) : (
              <View
                key={req.id}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.serviceType, { color: colors.text }]}>
                    {req.request_type === "emergency"
                      ? "🚨 Emergency SOS"
                      : "📅 Standard Service"}
                  </Text>
                  <Text style={[styles.status, { color: colors.primary }]}>
                    {req.status.toUpperCase()}
                  </Text>
                </View>

                <Text
                  style={[styles.issue, { color: colors.textMuted }]}
                  numberOfLines={2}
                >
                  {req.vehicle_issue || "No description provided."}
                </Text>

                <Text style={[styles.date, { color: colors.textMuted }]}>
                  Requested on: {new Date(req.created_at).toLocaleDateString()}
                </Text>

                {/* NEW: Cancel Button for Pending Requests */}
                {String(req.status ?? "").toLowerCase() === "pending" && (
                  <TouchableOpacity
                    style={styles.cancelListButton}
                    onPress={() => handleCancel(req.id)}
                  >
                    <Text style={styles.cancelListButtonText}>
                      Cancel Request
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
      <Modal
        visible={cancelModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isCancelling) {
            setCancelModalVisible(false);
            setEnteringOtherReason(false);
          }
        }}
      >
        <View style={styles.issueModalOverlay}>
          <View style={[styles.issueModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.issueModalTitle, { color: colors.text }]}>Report booking issue</Text>
            <Text style={[styles.issueModalHint, { color: colors.textMuted }]}>
              {enteringOtherReason
                ? "Please explain the issue before continuing."
                : "Select the reason so the mechanic understands the concern."}
            </Text>
            {enteringOtherReason ? (
              <>
                <TextInput
                  value={otherCancelReason}
                  onChangeText={setOtherCancelReason}
                  placeholder="Enter reason"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.otherIssueInput, { borderColor: colors.border, color: colors.text }]}
                  multiline
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.submitIssueButton}
                  onPress={() => {
                    const reason = otherCancelReason.trim();
                    if (!reason) {
                      Alert.alert("Reason Required", "Please enter a reason before continuing.");
                      return;
                    }
                    openCancellationConfirmation(reason);
                  }}
                  disabled={isCancelling}
                >
                  <Text style={styles.submitIssueText}>Continue</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.issueOptions}>
                {CANCELLATION_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.issueOption, { borderColor: colors.border }]}
                    onPress={() => {
                      if (reason === "Other") {
                        setEnteringOtherReason(true);
                        return;
                      }
                      openCancellationConfirmation(reason);
                    }}
                    disabled={isCancelling}
                  >
                    <Text style={[styles.issueOptionText, { color: colors.text }]}>{reason}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#EF4444" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={[styles.issueCancelButton, { borderColor: colors.border }]}
              onPress={() => {
                if (enteringOtherReason) {
                  setEnteringOtherReason(false);
                  setOtherCancelReason("");
                } else {
                  setCancelModalVisible(false);
                }
              }}
              disabled={isCancelling}
            >
              <Text style={[styles.issueCancelText, { color: colors.textMuted }]}>
                {enteringOtherReason ? "Back" : "Cancel"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={confirmationReason !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isCancelling) setConfirmationReason(null);
        }}
      >
        <View style={styles.confirmationOverlay}>
          <View style={[styles.confirmationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.confirmationIcon}>
              <Ionicons name="alert-circle-outline" size={34} color="#EF4444" />
            </View>
            <Text style={[styles.confirmationTitle, { color: colors.text }]}>
              Confirm Cancellation
            </Text>
            <Text style={[styles.confirmationMessage, { color: colors.textMuted }]}>
              Are you sure you want to cancel this booking?
            </Text>
            <View style={[styles.selectedReasonBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[styles.selectedReasonLabel, { color: colors.textMuted }]}>
                Selected reason
              </Text>
              <Text style={[styles.selectedReasonValue, { color: colors.text }]}>
                {confirmationReason}
              </Text>
            </View>
            <Text style={[styles.confirmationWarning, { color: colors.textMuted }]}>
              This action cannot be undone.
            </Text>
            <View style={styles.confirmationActions}>
              <TouchableOpacity
                style={[styles.keepBookingButton, { borderColor: colors.border }]}
                onPress={() => setConfirmationReason(null)}
                disabled={isCancelling}
              >
                <Text style={[styles.keepBookingText, { color: colors.text }]}>Keep Booking</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.finalCancelButton, isCancelling && { opacity: 0.7 }]}
                onPress={() => void confirmCancel(confirmationReason ?? "")}
                disabled={isCancelling}
              >
                <Text style={styles.finalCancelText}>
                  {isCancelling ? "Cancelling..." : "Confirm Cancel"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  acceptanceNotice: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  acceptanceNoticeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#18A957",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cancellationNoticeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#D64545",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  acceptanceNoticeCopy: { flex: 1 },
  acceptanceNoticeTitle: { fontSize: normalizeText(16), fontWeight: "800" },
  acceptanceNoticeMessage: { fontSize: normalizeText(14), lineHeight: normalizeText(20), marginTop: 2 },
  acceptanceNoticeClose: { padding: 4, marginLeft: 8 },
  cancelSuccessOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  cancelSuccessCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 22,
    padding: 26,
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  cancelSuccessIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#18A957",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  cancelSuccessTitle: { fontSize: normalizeText(22), fontWeight: "800", marginBottom: 8 },
  cancelSuccessMessage: {
    fontSize: normalizeText(16),
    lineHeight: normalizeText(24),
    textAlign: "center",
    marginBottom: 24,
  },
  cancelSuccessButton: {
    width: "100%",
    borderRadius: 12,
    backgroundColor: "#172B66",
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelSuccessButtonText: { color: "#FFFFFF", fontSize: normalizeText(17), fontWeight: "800" },
  
  content: { padding: 20 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    padding: 24,
  },
  emptyText: { fontSize: normalizeText(20), fontWeight: "700", marginTop: 16 },
  emptySub: { fontSize: normalizeText(16), textAlign: "center", marginTop: 8, lineHeight: normalizeText(24) },

  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  serviceType: { fontSize: normalizeText(17), fontWeight: "800" },
  status: { fontSize: normalizeText(13), fontWeight: "800", letterSpacing: 0.5 },
  issue: { fontSize: normalizeText(16), lineHeight: normalizeText(24), marginBottom: 12 },

  receiptBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
    borderStyle: "dashed",
  },
  receiptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  receiptTitle: { fontSize: normalizeText(16), fontWeight: "700" },
  receiptPrice: { fontSize: normalizeText(18), fontWeight: "900", color: "#10b981" },
  receiptNotes: { fontSize: normalizeText(15), fontStyle: "italic", marginTop: 4 },
  additionalChargesBox: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#FFF9ED", borderWidth: 1, borderColor: "#F2D08A" },
  additionalChargesTitle: { color: "#8A5A00", fontSize: normalizeText(15), fontWeight: "800", marginBottom: 8 },
  additionalChargeRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#F2D08A" },
  additionalChargeCopy: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  additionalChargeDescription: { flex: 1, color: "#34383F", fontSize: normalizeText(15), fontWeight: "700" },
  additionalChargeAmount: { color: "#34383F", fontSize: normalizeText(15), fontWeight: "800" },
  additionalChargeActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  rejectChargeButton: { flex: 1, minHeight: 38, borderWidth: 1, borderColor: "#D98B8B", borderRadius: 7, alignItems: "center", justifyContent: "center" },
  rejectChargeText: { color: "#B33A3A", fontSize: normalizeText(14), fontWeight: "800" },
  approveChargeButton: { flex: 1, minHeight: 38, borderRadius: 7, backgroundColor: "#18A957", alignItems: "center", justifyContent: "center" },
  approveChargeText: { color: "#FFFFFF", fontSize: normalizeText(14), fontWeight: "800" },
  approvedCharge: { color: "#18A957", fontSize: normalizeText(14), fontWeight: "800", marginTop: 6 },
  rejectedCharge: { color: "#B33A3A", fontSize: normalizeText(14), fontWeight: "800", marginTop: 6 },
  liveTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#F2D08A" },
  liveTotalLabel: { color: "#34383F", fontSize: normalizeText(15), fontWeight: "800" },
  liveTotalValue: { color: "#2450D8", fontSize: normalizeText(18), fontWeight: "900" },

  date: { fontSize: normalizeText(14), fontWeight: "600" },

  cancelListButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  cancelListButtonText: { color: "#EF4444", fontWeight: "bold", fontSize: normalizeText(16) },
  issueModalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  issueModalCard: { padding: 24, borderWidth: 1, borderRadius: 18 },
  issueModalTitle: { fontSize: normalizeText(22), fontWeight: "800" },
  issueModalHint: { fontSize: normalizeText(15), lineHeight: normalizeText(22), marginTop: 4, marginBottom: 16 },
  issueOptions: { gap: 6 },
  otherIssueInput: {
    minHeight: 110,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: normalizeText(15),
    textAlignVertical: "top",
  },
  submitIssueButton: {
    minHeight: 48,
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  submitIssueText: { color: "#FFFFFF", fontSize: normalizeText(16), fontWeight: "800" },
  issueOption: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  issueOptionText: { flex: 1, fontSize: normalizeText(16), fontWeight: "700" },
  issueCancelButton: {
    minHeight: 48,
    marginTop: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  issueCancelText: { fontSize: normalizeText(16), fontWeight: "800" },
  confirmationOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  confirmationCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 22,
    elevation: 12,
  },
  confirmationIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    marginBottom: 14,
  },
  confirmationTitle: {
    textAlign: "center",
    fontSize: normalizeText(23),
    fontWeight: "800",
  },
  confirmationMessage: {
    textAlign: "center",
    fontSize: normalizeText(16),
    lineHeight: normalizeText(24),
    marginTop: 8,
  },
  selectedReasonBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    marginTop: 18,
  },
  selectedReasonLabel: {
    fontSize: normalizeText(13),
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectedReasonValue: {
    fontSize: normalizeText(16),
    fontWeight: "700",
    lineHeight: normalizeText(22),
    marginTop: 4,
  },
  confirmationWarning: {
    textAlign: "center",
    fontSize: normalizeText(14),
    marginTop: 14,
  },
  confirmationActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  keepBookingButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  keepBookingText: { fontSize: normalizeText(15), fontWeight: "800" },
  finalCancelButton: {
    flex: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    backgroundColor: "#EF4444",
  },
  finalCancelText: { color: "#FFFFFF", fontSize: normalizeText(15), fontWeight: "800" },

  scheduledBooking: { marginBottom: 22 },
  bookingsHeading: {
    width: 358,
    maxWidth: "100%",
    alignSelf: "center",
    color: "#131B2E",
    fontSize: normalizeText(22),
    lineHeight: normalizeText(34),
    letterSpacing: -0.24,
    fontWeight: "700",
    marginTop: -8,
    marginBottom: 16,
  },
  bookingStatusBar: {
    width: 358,
    maxWidth: "100%",
    alignSelf: "center",
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E2E8FF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#F08A00",
    marginRight: 12,
  },
  bookingStatusText: {
    color: "#131B2E",
    fontSize: normalizeText(14),
    lineHeight: normalizeText(20),
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  bookingMapPreview: {
    width: 358,
    maxWidth: "100%",
    alignSelf: "center",
    height: 288,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#C6D6D8",
    position: "relative",
    marginBottom: 18,
  },
  bookingLeafletMap: { ...StyleSheet.absoluteFill },
  fullscreenMapContainer: {
    flex: 1,
    backgroundColor: "#C6D6D8",
  },
  fullscreenBookingMap: {
    ...StyleSheet.absoluteFill,
  },
  fullscreenCloseButton: {
    position: "absolute",
    top: 54,
    right: 18,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 5,
  },
  fullscreenMapControls: {
    position: "absolute",
    right: 18,
    top: 112,
    gap: 8,
  },
  fullscreenMapLabel: {
    position: "absolute",
    left: 18,
    bottom: 28,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  mapControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  bookingMapControls: {
    position: "absolute",
    right: 12,
    top: 12,
    gap: 8,
  },
  bookingMapLabel: {
    position: "absolute",
    left: 16,
    bottom: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  bookingMapLabelText: { color: "#172B66", fontSize: normalizeText(15), fontWeight: "800" },
  mechanicBookingCard: {
    width: 358,
    maxWidth: "100%",
    alignSelf: "center",
    minHeight: 180,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 22,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  mechanicBookingHeader: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  mechanicBookingIdentity: { flex: 1, marginLeft: 12, minWidth: 0 },
  mechanicBookingName: { fontSize: normalizeText(19), lineHeight: normalizeText(26), fontWeight: "600" },
  mechanicRatingRow: { height: 18, flexDirection: "row", alignItems: "center" },
  ratingStar: { color: "#D97706", fontSize: normalizeText(19), lineHeight: normalizeText(20) },
  ratingValue: {
    color: "#D97706",
    fontSize: normalizeText(12),
    lineHeight: normalizeText(20),
    fontWeight: "700",
    marginLeft: 4,
  },
  servicesValue: {
    color: "#2C2F35",
    fontSize: normalizeText(14),
    lineHeight: normalizeText(20),
    fontWeight: "500",
    marginLeft: 7,
  },
  mechanicVehicleText: {
    color: "#2C2F35",
    fontSize: normalizeText(14),
    lineHeight: normalizeText(20),
    fontWeight: "400",
  },
  mechanicPlateText: {
    backgroundColor: "#E8ECFF",
    fontSize: normalizeText(12),
    lineHeight: normalizeText(18),
    fontWeight: "700",
    letterSpacing: 0.4,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  moderateBadge: {
    backgroundColor: "#DCE7FF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  moderateBadgeText: {
    color: "#0037B0",
    fontSize: normalizeText(12),
    lineHeight: normalizeText(18),
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  vehicleSummary: {
    width: "100%",
    minHeight: 36,
    backgroundColor: "#EEF0FF",
    borderRadius: 10,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 10,
  },
  vehicleSummaryText: {
    color: "#29488F",
    fontSize: normalizeText(17),
    fontWeight: "700",
    flex: 1,
  },
  bookingActions: { minHeight: 52, flexDirection: "row", gap: 8 },
  callMechanicButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#29458F",
    borderWidth: 2,
    borderColor: "#101B36",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  callMechanicText: { color: "#FFFFFF", fontSize: normalizeText(18), fontWeight: "600" },
  squareBookingButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#E8ECFF",
    alignItems: "center",
    justifyContent: "center",
  },
  progressCard: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 22,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 7,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  progressTitle: { fontSize: normalizeText(22), fontWeight: "500" },
  progressStep: { color: "#D87500", fontSize: normalizeText(15), fontWeight: "800" },
  progressRow: {
    flexDirection: "row",
    minHeight: 68,
    alignItems: "flex-start",
  },
  progressIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  progressIconText: { color: "#FFFFFF", fontSize: normalizeText(19), fontWeight: "800" },
  progressCopy: { flex: 1 },
  progressRowTitle: { fontSize: normalizeText(17), fontWeight: "800", marginTop: 3 },
  progressRowSubtitle: { fontSize: normalizeText(15), lineHeight: normalizeText(22), marginTop: 3 },
  progressTime: { fontSize: normalizeText(15), marginTop: 4, marginLeft: 6 },
  referenceCard: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 7,
  },
  referenceEyebrow: {
    color: "#565C6D",
    fontSize: normalizeText(14),
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 5,
  },
  referenceId: { fontSize: normalizeText(26), fontWeight: "800", marginBottom: 20 },
  referenceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    gap: 12,
  },
  referenceLabel: { fontSize: normalizeText(16), fontWeight: "700" },
  referenceValue: {
    fontSize: normalizeText(16),
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
  },
  estimatedFee: {
    backgroundColor: "#E8ECFF",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  estimatedFeeLabel: {
    color: "#565C6D",
    fontSize: normalizeText(13),
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  estimatedFeeDescription: { fontSize: normalizeText(15), marginTop: 3 },
  estimatedFeeAmount: { color: "#29458F", fontSize: normalizeText(21), fontWeight: "800" },
});