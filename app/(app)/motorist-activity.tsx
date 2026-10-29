import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { setCachedActiveBooking } from "@/lib/activeBookingStore";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { MapWebView, type MapWebViewHandle } from "@/components/MapWebView";
import { MotoristHomeHeader } from "@/components/MotoristHomeHeader";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { normalizeText } from "@/lib/typography";
import { listVehicles } from "@/services/vehicleService";
import type { Vehicle } from "@/types/vehicle";
import { SafeAreaView } from "react-native-safe-area-context";

type BookingColors = {
  bg: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
};

type NearbyMechanic = {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number;
  reviewCount: number;
  distanceKm: number;
  distance: string;
  etaMinutes: number;
  isOnline: boolean;
  skills: string;
  services: { name: string; price: number; description?: string }[];
};

const mechanicAvatarUrlCache = new Map<string, string>();
const mechanicServicesCountCache = new Map<string, number>();
const motoristOrdersCache = new Map<string, any[]>();
const nearbyMechanicsCache = new Map<
  string,
  { mechanics: NearbyMechanic[]; cachedAt: number }
>();
const NEARBY_MECHANICS_CACHE_DURATION_MS = 2 * 60 * 1000;
const mechanicServicesCountKey = (mechanicId: string) =>
  `mechanic_services_count_${mechanicId}`;
const CANCELLATION_REASONS = [
  "Mechanic is taking too long",
  "Mechanic is unresponsive",
  "Pinned the wrong location/vehicle",
  "Issue was resolved locally",
  "Other",
];
const TRIP_STARTED_STATUSES = ["in_transit", "arrived", "in_progress", "ongoing"];

function hasMechanicStartedTrip(status: unknown) {
  return TRIP_STARTED_STATUSES.includes(String(status ?? "").trim().toLowerCase());
}

function ScheduledBookingCard({
  request,
  colors,
  unreadMessageCount,
  onCancel,
}: {
  request: any;
  colors: BookingColors;
  unreadMessageCount: number;
  onCancel: (id: string) => void;
}) {
  const mapRef = useRef<MapWebViewHandle | null>(null);
  const router = useRouter();
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [updatingChargeId, setUpdatingChargeId] = useState<string | null>(null);
  const [bookingAddress, setBookingAddress] = useState("Address unavailable");
  const normalizedStatus = String(request.status ?? "").toLowerCase();
  const isAwaitingMechanic = ["scheduled", "pending"].includes(
    normalizedStatus,
  );
  const isTrackingActive = [
    "in_transit",
    "arrived",
    "in_progress",
    "ongoing",
  ].includes(normalizedStatus);
  const currentStep =
    normalizedStatus === "in_progress" || normalizedStatus === "ongoing"
      ? 3
      : normalizedStatus === "completed"
        ? 4
        : normalizedStatus === "in_transit" || normalizedStatus === "arrived"
          ? 2
          : 1;
  const progressStatusLabel = isAwaitingMechanic
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
  const savedServiceBreakdown = Array.isArray(request.service_breakdown)
    ? request.service_breakdown
        .filter(
          (item: any) =>
            typeof (item?.service ?? item?.service_name ?? item?.name) ===
              "string" &&
            Number.isFinite(Number(item.price)),
        )
        .map((item: any) => ({
          service: item.service ?? item.service_name ?? item.name,
          price: Number(item.price),
        }))
    : [];
  const serviceNames = String(request.service_name ?? "")
    .split(",")
    .map((service: string) => service.trim())
    .filter(Boolean);
  const servicePrice = Number(request.service_price ?? 0);
  const mechanicPrices = Array.isArray(request.mechanic?.services)
    ? request.mechanic.services
    : [];
  const pricesByService = new Map<string, number>(
    mechanicPrices.flatMap((item: any): [string, number][] => {
      const name = String(item.service ?? item.service_name ?? item.name ?? "")
        .trim()
        .toLowerCase();
      const price = Number(String(item.price ?? item.amount ?? "").replace(/[^\d.]/g, ""));
      return name && Number.isFinite(price) ? [[name, price]] : [];
    }),
  );
  const currentServiceBreakdown = serviceNames.map((service: string) => ({
    service,
    price: pricesByService.get(service.toLowerCase()),
  }));
  const currentBreakdownTotal = currentServiceBreakdown.reduce(
    (total: number, item: { price: number | undefined }) =>
      total + (item.price ?? 0),
    0,
  );
  const canUseCurrentServicePrices =
    currentServiceBreakdown.length > 0 &&
    currentServiceBreakdown.every(
      (item: { price: number | undefined }) => item.price !== undefined,
    ) &&
    Math.abs(currentBreakdownTotal - servicePrice) < 0.01;
  const serviceBreakdown: { service: string; price: number | null }[] =
    savedServiceBreakdown.length > 0
      ? savedServiceBreakdown
      : canUseCurrentServicePrices
        ? currentServiceBreakdown.map(
            (item: { service: string; price: number | undefined }) => ({
              service: item.service,
              price: item.price ?? 0,
            }),
          )
        : serviceNames.map((service: string) => ({ service, price: null }));
  const showServiceSubtotal =
    savedServiceBreakdown.length === 0 && !canUseCurrentServicePrices;

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
                  String(candidate).toLowerCase() ===
                  String(value).toLowerCase(),
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
  const mechanicLogoUri =
    Image.resolveAssetSource(require("../../assets/images/mechaniclogo.png"))
      ?.uri ?? "";
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
          .mechanic-pin img { width: 100%; height: 100%; object-fit: contain; filter: brightness(0); }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var mapCenter = [${latitude}, ${longitude}];
          var map = L.map('map', { zoomControl: false, attributionControl: false }).setView(mapCenter, 15);
          var bookingTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
          window.refreshBookingMap = function(forceTileRedraw) {
            requestAnimationFrame(function() {
              map.invalidateSize({ pan: false, debounceMoveend: true });
              var tileContainer = bookingTileLayer.getContainer();
              var loadedTiles = tileContainer
                ? tileContainer.querySelectorAll('.leaflet-tile-loaded').length
                : 0;
              if (forceTileRedraw || !loadedTiles) {
                bookingTileLayer.redraw();
              }
            });
          };
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
          setTimeout(function () { window.refreshBookingMap(); }, 100);
        </script>
      </body>
    </html>
  `;

  useFocusEffect(
    useCallback(() => {
      if (!isTrackingActive) return undefined;
      const refreshMap = () =>
        mapRef.current?.injectJavaScript(
          "if (window.refreshBookingMap) { window.refreshBookingMap(true); } true;",
        );
      const firstRefresh = setTimeout(refreshMap, 250);
      const settledRefresh = setTimeout(refreshMap, 700);
      return () => {
        clearTimeout(firstRefresh);
        clearTimeout(settledRefresh);
      };
    }, [isTrackingActive]),
  );

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
        <View style={[styles.bookingMapPreview]}>
          <MapWebView
            ref={mapRef}
            source={{ html: mapHtml }}
            style={styles.bookingLeafletMap}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            nestedScrollEnabled={false}
            onLoadEnd={() =>
              mapRef.current?.injectJavaScript(
                "if (window.refreshBookingMap) { window.refreshBookingMap(true); } true;",
              )
            }
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
        </View>
      ) : null}

      <Modal
        visible={isMapFullscreen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsMapFullscreen(false)}
      >
        <View style={styles.fullscreenMapContainer}>
          <MapWebView
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
                  : request.mechanic?.name ||
                    request.mechanic_name ||
                    "Mechanic assigned"}
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
                {request.vehicle_type || "Honda Click 125"}
              </Text>
              <View style={styles.mechanicPlateBadge}>
                <Text style={styles.mechanicPlateText}>
                  {request.plate_number || "884-NK"}
                </Text>
              </View>
            </View>
            <View style={styles.moderateBadge}>
              <Text style={styles.moderateBadgeText}>
                {isAwaitingMechanic ? "WAITING" : "SCHEDULED"}
              </Text>
            </View>
          </View>
          <View style={styles.vehicleSummary}>
            <Image
              source={require("../../assets/images/mechanic1.png")}
              style={styles.mechanicSummaryIcon}
              resizeMode="contain"
            />
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
                  Alert.alert(
                    "Number unavailable",
                    "This mechanic has not added a contact number.",
                  );
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
              accessibilityRole="button"
              accessibilityLabel={
                unreadMessageCount > 0
                  ? `Open chat, ${unreadMessageCount} unread messages`
                  : "Open chat"
              }
              onPress={() =>
                router.push({
                  pathname: "/messages",
                  params: { serviceRequestId: String(request.id) },
                })
              }
            >
              <Ionicons name="chatbox-outline" size={26} color="#172B66" />
              {unreadMessageCount > 0 ? (
                <View style={styles.chatUnreadBadge}>
                  <Text style={styles.chatUnreadBadgeText}>
                    {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                  </Text>
                </View>
              ) : null}
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
          {
            title: isAwaitingMechanic
              ? "Waiting for Acceptance"
              : "Request Confirmed",
            subtitle: isAwaitingMechanic
              ? "Your request was sent to the mechanic."
              : "Mechanic assigned and parts prepared.",
            icon: null,
          },
          {
            title: "Mechanic on the way",
            subtitle: "Now on the way!",
            icon: require("../../assets/images/ontheway.png"),
          },
          {
            title: "Mechanic in service",
            subtitle:
              "Free 15-point electronic stator and battery health test.",
            icon: require("../../assets/images/inservice.png"),
          },
          {
            title: "Repair & Cash Settlement",
            subtitle: "Testing, digital receipt & 30-day warranty release.",
            icon: require("../../assets/images/settlement.png"),
          },
        ].map(({ title, subtitle, icon }, index) => (
          <View key={title} style={styles.progressRow}>
            <View
              style={[
                styles.progressIcon,
                {
                  backgroundColor:
                    index + 1 < currentStep
                      ? "#18A957"
                      : index === 0 && normalizedStatus === "accepted"
                        ? "#18A957"
                        : index + 1 === currentStep
                          ? "#C44A00"
                          : "#A8B0C0",
                },
              ]}
            >
              {icon ? (
                <Image
                  source={icon}
                  style={styles.progressStepImage}
                  resizeMode="contain"
                />
              ) : (
                <Text style={styles.progressIconText}>✓</Text>
              )}
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
                  ? isAwaitingMechanic && index === 0
                    ? "Waiting"
                    : progressStatusLabel
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
          <View style={styles.estimatedFeeHeader}>
            <View style={styles.estimatedFeeHeaderCopy}>
              <Text style={styles.estimatedFeeLabel}>ESTIMATED SERVICE FEE</Text>
              <Text
                style={[
                  styles.estimatedFeeDescription,
                  { color: colors.textMuted },
                ]}
              >
                Service and distance breakdown
              </Text>
            </View>
            <Text
              style={styles.estimatedFeeAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              ₱
              {payableTotal.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
              })}
            </Text>
          </View>
          <View style={styles.estimatedFeeBreakdown}>
            {serviceBreakdown.map((item, index) => (
              <View
                key={`${item.service}-${index}`}
                style={styles.estimatedFeeBreakdownRow}
              >
                <Text style={styles.estimatedFeeBreakdownLabel}>
                  {item.service}
                </Text>
                <Text style={styles.estimatedFeeBreakdownValue}>
                  {item.price === null
                    ? "Included"
                    : `₱${item.price.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}`}
                </Text>
              </View>
            ))}
            {showServiceSubtotal ? (
              <View style={styles.estimatedFeeBreakdownRow}>
                <Text style={styles.estimatedFeeBreakdownLabel}>
                  Services total
                </Text>
                <Text style={styles.estimatedFeeBreakdownValue}>
                  ₱{servicePrice.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </Text>
              </View>
            ) : null}
            {Number(request.delivery_fee ?? 0) > 0 ? (
              <View style={styles.estimatedFeeBreakdownRow}>
                <Text style={styles.estimatedFeeBreakdownLabel}>
                  Distance fee
                </Text>
                <Text style={styles.estimatedFeeBreakdownValue}>
                  ₱{Number(request.delivery_fee).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {additionalCharges.length > 0 ? (
          <View style={styles.additionalChargesBox}>
            <Text style={styles.additionalChargesTitle}>
              Additional repair charges
            </Text>
            {additionalCharges.map((charge: any) => (
              <View key={charge.id} style={styles.additionalChargeRow}>
                <View style={styles.additionalChargeCopy}>
                  <Text style={styles.additionalChargeDescription}>
                    {charge.description}
                  </Text>
                  <Text style={styles.additionalChargeAmount}>
                    ₱
                    {Number(charge.amount || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </Text>
                </View>
                {charge.status === "pending" ? (
                  <View style={styles.additionalChargeActions}>
                    <TouchableOpacity
                      style={styles.rejectChargeButton}
                      onPress={() =>
                        void updateChargeStatus(charge.id, "rejected")
                      }
                      disabled={updatingChargeId === charge.id}
                    >
                      <Text style={styles.rejectChargeText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveChargeButton}
                      onPress={() =>
                        void updateChargeStatus(charge.id, "approved")
                      }
                      disabled={updatingChargeId === charge.id}
                    >
                      <Text style={styles.approveChargeText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text
                    style={
                      charge.status === "approved"
                        ? styles.approvedCharge
                        : styles.rejectedCharge
                    }
                  >
                    {charge.status === "approved" ? "Approved" : "Declined"}
                  </Text>
                )}
              </View>
            ))}
            <View style={styles.liveTotalRow}>
              <Text style={styles.liveTotalLabel}>Current payable total</Text>
              <Text style={styles.liveTotalValue}>
                ₱
                {payableTotal.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}
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
  const motoristId = session?.user.id;

  const [requests, setRequests] = useState<any[]>(
    () => (motoristId ? motoristOrdersCache.get(motoristId) : undefined) ?? [],
  );
  const [unreadChatState, setUnreadChatState] = useState<{
    userId: string | undefined;
    requestIds: string;
    counts: Record<string, number>;
  }>({ userId: undefined, requestIds: "", counts: {} });
  const [loading, setLoading] = useState(
    () => Boolean(motoristId && !motoristOrdersCache.has(motoristId)),
  );
  const [cancellationNotice, setCancellationNotice] = useState<string | null>(
    null,
  );
  const [cancelSuccessVisible, setCancelSuccessVisible] = useState(false);
  const [warningRecordedVisible, setWarningRecordedVisible] = useState(false);
  const [bookingSubmittedVisible, setBookingSubmittedVisible] = useState(false);
  const [nearbyMechanics, setNearbyMechanics] = useState<NearbyMechanic[]>(
    () => (motoristId ? nearbyMechanicsCache.get(motoristId)?.mechanics : undefined) ?? [],
  );
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbySearch, setNearbySearch] = useState("");
  const [nearbyFilter, setNearbyFilter] = useState<"all" | "nearby">("all");
  const [showNearbyMechanics, setShowNearbyMechanics] = useState(false);
  const [servicesMechanic, setServicesMechanic] =
    useState<NearbyMechanic | null>(null);
  const [scheduleMechanic, setScheduleMechanic] =
    useState<NearbyMechanic | null>(null);
  const [scheduleServices, setScheduleServices] = useState<
    NearbyMechanic["services"]
  >([]);
  const [scheduleSelected, setScheduleSelected] = useState<
    NearbyMechanic["services"]
  >([]);
  const [scheduleVehicles, setScheduleVehicles] = useState<Vehicle[]>([]);
  const [scheduleVehicle, setScheduleVehicle] = useState<Vehicle | null>(null);
  const [scheduleVehiclePickerVisible, setScheduleVehiclePickerVisible] =
    useState(false);
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [scheduleDate, setScheduleDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date;
  });
  const [schedulePicker, setSchedulePicker] = useState<"date" | "time" | null>(
    null,
  );
  const updateScheduleDate = useCallback(
    (mode: "date" | "time", selectedValue: Date) => {
      setScheduleDate((currentDate) => {
        const nextDate = new Date(currentDate);
        if (mode === "date") {
          nextDate.setFullYear(
            selectedValue.getFullYear(),
            selectedValue.getMonth(),
            selectedValue.getDate(),
          );
        } else {
          nextDate.setHours(
            selectedValue.getHours(),
            selectedValue.getMinutes(),
            0,
            0,
          );
        }
        return nextDate;
      });
    },
    [],
  );
  const openSchedulePicker = useCallback(
    (mode: "date" | "time") => {
      if (Platform.OS === "android") {
        DateTimePickerAndroid.open({
          value: scheduleDate,
          mode,
          display: "default",
          minimumDate: mode === "date" ? new Date() : undefined,
          onValueChange: (_event, selectedValue) =>
            updateScheduleDate(mode, selectedValue),
        });
        return;
      }

      setSchedulePicker(mode);
    },
    [scheduleDate, updateScheduleDate],
  );
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const previousStatuses = useRef(new Map<string, string>());
  const loadedRequestsUserId = useRef<string | null>(null);
  const ordersFetchRequestId = useRef(0);
  const nearbyFetchInProgress = useRef(false);

  const fetchMyOrders = useCallback(async () => {
    if (!motoristId) return;
    const requestId = ++ordersFetchRequestId.current;
    const { data, error } = await supabase
      .from("service_requests")
      .select("*")
      .eq("motorist_id", motoristId)
      .order("created_at", { ascending: false });

    if (requestId !== ordersFetchRequestId.current) return;
    if (error) {
      console.warn("Could not refresh motorist bookings:", error.message);
      setLoading(false);
      return;
    }

    if (data) {
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
          services: any[];
        }
      >();

      await Promise.all(
        mechanicIds.map(async (mechanicId) => {
          const storedCount = await SecureStore.getItemAsync(
            mechanicServicesCountKey(mechanicId),
          );
          const [{ data: profile }, { count: servicesCount }] =
            await Promise.all([
              supabase
                .from("profiles")
                .select(
                  "full_name,mobile_number,avatar_path,average_rating,maintenance_pricing",
                )
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
            services: Array.isArray(profile?.maintenance_pricing)
              ? profile.maintenance_pricing
              : [],
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
      if (requestId !== ordersFetchRequestId.current) return;

      const enrichedRequests = data.map((request) => ({
        ...request,
        mechanic: request.mechanic_id
          ? (mechanicProfiles.get(request.mechanic_id) ?? null)
          : null,
      }));
      if (loadedRequestsUserId.current === motoristId) {
        const newlyCancelled = enrichedRequests.find((request) => {
          const previousStatus = previousStatuses.current.get(request.id);
          return (
            previousStatus &&
            [
              "pending",
              "scheduled",
              "accepted",
              "in_transit",
              "arrived",
              "in_progress",
            ].includes(previousStatus) &&
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
        enrichedRequests.map((request) => [
          request.id,
          String(request.status).toLowerCase(),
        ]),
      );
      loadedRequestsUserId.current = motoristId;
      motoristOrdersCache.set(motoristId, enrichedRequests);
      setRequests(enrichedRequests);
    }
    setLoading(false);
  }, [motoristId]);

  const fetchNearbyMechanics = useCallback(async () => {
    if (!motoristId || nearbyFetchInProgress.current) return;
    const cachedNearby = nearbyMechanicsCache.get(motoristId);
    if (cachedNearby) {
      setNearbyMechanics(cachedNearby.mechanics);
      if (
        Date.now() - cachedNearby.cachedAt <
        NEARBY_MECHANICS_CACHE_DURATION_MS
      ) {
        setNearbyLoading(false);
        return;
      }
    }

    nearbyFetchInProgress.current = true;
    if (!cachedNearby) setNearbyLoading(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== "granted") {
        if (!cachedNearby) setNearbyMechanics([]);
        return;
      }

      const location =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      const { data, error } = await supabase.rpc("get_nearby_mechanics", {
        p_latitude: location.coords.latitude,
        p_longitude: location.coords.longitude,
        p_radius_km: 15,
      });

      if (error) {
        console.warn("Nearby mechanics unavailable:", error.message);
        return;
      }

      const formattedMechanics = (data ?? []).map((mechanic: any) => {
        const distanceKm = Number(mechanic.distance_km) || 0;
        const services = Array.isArray(mechanic.maintenance_pricing)
          ? mechanic.maintenance_pricing
              .map((service: any) => ({
                name:
                  service.name ||
                  service.service_name ||
                  service.service ||
                  "Roadside service",
                price: Number(service.price ?? service.amount ?? 0),
                description: service.description || service.details || "",
              }))
              .filter((service: { name: string }) => service.name)
          : [];

        return {
          id: String(mechanic.id),
          name: mechanic.full_name || "Mechanic",
          avatarUrl: mechanic.avatar_path
            ? supabase.storage
                .from("mechanic-avatars")
                .getPublicUrl(mechanic.avatar_path).data.publicUrl
            : null,
          rating: Number(mechanic.average_rating) || 5,
          reviewCount: Number(mechanic.review_count) || 0,
          distanceKm,
          distance: `${distanceKm.toFixed(1)} km away from you`,
          etaMinutes: Math.max(4, Math.round(distanceKm * 8)),
          isOnline: mechanic.is_online !== false,
          skills: mechanic.skills || "Comprehensive roadside assistance",
          services,
        };
      });
      nearbyMechanicsCache.set(motoristId, {
        mechanics: formattedMechanics,
        cachedAt: Date.now(),
      });
      setNearbyMechanics(formattedMechanics);
    } catch (error) {
      console.warn("Unable to load nearby mechanics:", error);
    } finally {
      nearbyFetchInProgress.current = false;
      setNearbyLoading(false);
    }
  }, [motoristId]);

  const nearbyMechanicIds = nearbyMechanics
    .map((mechanic) => mechanic.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!session?.user.id || !nearbyMechanicIds) return;

    const channels = nearbyMechanicIds.split(",").map((mechanicId) =>
      supabase
        .channel(`motorist_activity_mechanic_availability_${session.user.id}_${mechanicId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${mechanicId}`,
          },
          (payload) => {
            if (typeof payload.new.is_online !== "boolean") return;
            const isOnline = payload.new.is_online;
            setNearbyMechanics((current) =>
              current.map((mechanic) =>
                mechanic.id === mechanicId ? { ...mechanic, isOnline } : mechanic,
              ),
            );
          },
        )
        .subscribe((status, error) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(
              "Nearby mechanic availability updates unavailable:",
              error?.message ?? status,
            );
          }
        }),
    );

    return () => {
      channels.forEach((channel) => void supabase.removeChannel(channel));
    };
  }, [nearbyMechanicIds, session?.user.id]);

  useEffect(() => {
    if (!cancellationNotice) return;
    const timeout = setTimeout(() => setCancellationNotice(null), 7000);
    return () => clearTimeout(timeout);
  }, [cancellationNotice]);

  useEffect(() => {
    if (!motoristId) return;
    const channel = supabase
      .channel(`motorist_booking_status_${motoristId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_requests",
          filter: `motorist_id=eq.${motoristId}`,
        },
        (payload) => {
          ordersFetchRequestId.current += 1;
          const updatedRequest = payload.new as Record<string, unknown>;
          setRequests((currentRequests) => {
            const updatedRequests = currentRequests.map((request) =>
              String(request.id) === String(updatedRequest.id)
                ? { ...request, ...updatedRequest }
                : request,
            );
            if (motoristId) {
              motoristOrdersCache.set(motoristId, updatedRequests);
            }
            return updatedRequests;
          });
          const oldStatus = String(
            payload.old.status ??
              previousStatuses.current.get(String(payload.new.id)) ??
              "",
          ).toLowerCase();
          const newStatus = String(payload.new.status ?? "").toLowerCase();
          if (
            ["pending", "scheduled"].includes(oldStatus) &&
            newStatus === "accepted"
          ) {
            void fetchMyOrders();
          } else if (
            [
              "pending",
              "scheduled",
              "accepted",
              "in_transit",
              "arrived",
              "in_progress",
            ].includes(oldStatus) &&
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
  }, [fetchMyOrders, motoristId]);

  useFocusEffect(
    useCallback(() => {
      if (!motoristId) {
        setLoading(false);
        return undefined;
      }

      const cachedOrders = motoristOrdersCache.get(motoristId) ?? [];
      const hasCachedActiveBooking = cachedOrders.some((request) =>
        [
          "pending",
          "scheduled",
          "accepted",
          "in_transit",
          "arrived",
          "in_progress",
          "ongoing",
        ].includes(String(request.status ?? "").toLowerCase()),
      );
      if (!hasCachedActiveBooking) setLoading(true);

      void fetchMyOrders();
      const interval = setInterval(() => void fetchMyOrders(), 5000);
      return () => clearInterval(interval);
    }, [fetchMyOrders, motoristId]),
  );

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [enteringOtherReason, setEnteringOtherReason] = useState(false);
  const [otherCancelReason, setOtherCancelReason] = useState("");
  const [reasonRequiredMessage, setReasonRequiredMessage] = useState<
    string | null
  >(null);
  const [confirmationReason, setConfirmationReason] = useState<string | null>(
    null,
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [unableToCancelMessage, setUnableToCancelMessage] = useState<string | null>(
    null,
  );

  const showUnableToCancel = (message: string) => {
    setCancelModalVisible(false);
    setConfirmationReason(null);
    setUnableToCancelMessage(message);
  };

  const handleCancel = async (id: string) => {
    const request = requests.find((item) => String(item.id) === id);
    if (hasMechanicStartedTrip(request?.status)) {
      showUnableToCancel(
        "The mechanic has already started the trip. For safety, this booking can no longer be cancelled.",
      );
      return;
    }

    const { data: latestRequest, error } = await supabase
      .from("service_requests")
      .select("status")
      .eq("id", id)
      .eq("motorist_id", session?.user.id ?? "")
      .maybeSingle();

    if (error) {
      showUnableToCancel(
        "We couldn't verify the booking status right now. Please try again in a moment.",
      );
      return;
    }
    if (!latestRequest) {
      showUnableToCancel(
        "This booking is no longer available. Refresh your bookings and try again.",
      );
      return;
    }
    if (hasMechanicStartedTrip(latestRequest.status)) {
      showUnableToCancel(
        "The mechanic has already started the trip. For safety, this booking can no longer be cancelled.",
      );
      return;
    }

    setCancelBookingId(id);
    setCancelReason("");
    setEnteringOtherReason(false);
    setOtherCancelReason("");
    setCancelModalVisible(true);
  };

  const confirmCancel = async (selectedReason = cancelReason) => {
    if (!selectedReason) {
      setReasonRequiredMessage("Please select a reason for cancelling.");
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
      if (error.message.toLowerCase().includes("already started the trip")) {
        showUnableToCancel(
          "The mechanic has already started the trip. For safety, this booking can no longer be cancelled.",
        );
      } else {
        Alert.alert("Unable to cancel booking", error.message);
      }
    } else if (
      session?.user.id
    ) {
      setCachedActiveBooking(session.user.id, null);
      if (
      selectedReason === "Issue was resolved locally" ||
      selectedReason === "Other"
      ) {
      setWarningRecordedVisible(true);
      } else {
      setCancelSuccessVisible(true);
      }
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
    [
      "pending",
      "scheduled",
      "accepted",
      "in_transit",
      "arrived",
      "in_progress",
      "ongoing",
    ].includes(String(req.status ?? "").toLowerCase()),
  );
  const visibleBookings = filteredRequests;
  const hasActiveRequests = filteredRequests.length > 0;
  const activeRequestIds = filteredRequests
    .map((request) => String(request.id))
    .sort()
    .join(",");
  const unreadChatCounts =
    unreadChatState.userId === motoristId &&
    unreadChatState.requestIds === activeRequestIds
      ? unreadChatState.counts
      : {};

  useEffect(() => {
    if (!motoristId || !activeRequestIds) return;

    let active = true;
    const requestIds = activeRequestIds.split(",");
    const refreshUnreadCounts = async () => {
      const { data, error } = await supabase
        .from("app_notifications")
        .select("service_request_id")
        .eq("user_id", motoristId)
        .eq("type", "chat_message")
        .is("read_at", null)
        .in("service_request_id", requestIds);
      if (!active) return;
      if (error) {
        console.warn("Could not load unread booking messages:", error.message);
        return;
      }

      const counts: Record<string, number> = {};
      data?.forEach((notification) => {
        const requestId = notification.service_request_id;
        if (requestId) counts[requestId] = (counts[requestId] ?? 0) + 1;
      });
      setUnreadChatState({
        userId: motoristId,
        requestIds: activeRequestIds,
        counts,
      });
    };

    void refreshUnreadCounts();
    const channel = supabase
      .channel(`motorist_booking_chat_badges_${motoristId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `user_id=eq.${motoristId}`,
        },
        () => void refreshUnreadCounts(),
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "Booking chat badge realtime connection failed:",
            error?.message ?? status,
          );
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [activeRequestIds, motoristId]);
  const visibleNearbyMechanics = useMemo(() => {
    const normalizedSearch = nearbySearch.trim().toLowerCase();
    return nearbyMechanics.filter((mechanic) => {
      const matchesSearch =
        !normalizedSearch ||
        mechanic.name.toLowerCase().includes(normalizedSearch) ||
        mechanic.skills.toLowerCase().includes(normalizedSearch) ||
        mechanic.services.some((service) =>
          service.name.toLowerCase().includes(normalizedSearch),
        );
      const matchesFilter = nearbyFilter === "all" || mechanic.distanceKm <= 5;
      return matchesSearch && matchesFilter;
    });
  }, [nearbyFilter, nearbyMechanics, nearbySearch]);

  useFocusEffect(
    useCallback(() => {
      if (!showNearbyMechanics || loading || hasActiveRequests)
        return;
      void fetchNearbyMechanics();
    }, [
      fetchNearbyMechanics,
      hasActiveRequests,
      loading,
      showNearbyMechanics,
    ]),
  );

  const openMechanicDetails = (mechanic: NearbyMechanic) => {
    setServicesMechanic(mechanic);
  };

  const openScheduleForm = async (mechanic: NearbyMechanic) => {
    if (!session?.user.id) return;
    const { data, error } = await listVehicles(session.user.id);
    if (error) {
      Alert.alert("Unable to load vehicles", error);
      return;
    }
    if (!data.length) {
      Alert.alert(
        "Vehicle required",
        "Please add a vehicle in Profile > My Garage before booking.",
      );
      return;
    }
    setScheduleVehicles(data);
    setScheduleVehicle(data.find((vehicle) => vehicle.is_primary) ?? data[0]);
    setScheduleVehiclePickerVisible(false);
    setScheduleMechanic(mechanic);
    setScheduleServices(mechanic.services);
    setScheduleSelected([]);
    setScheduleNotes("");
    setSchedulePicker(null);
  };

  const submitScheduleBooking = async () => {
    if (!session?.user.id || !scheduleMechanic || !scheduleVehicle) return;
    if (!scheduleSelected.length) {
      Alert.alert("Choose a service", "Select at least one service to continue.");
      return;
    }
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (permission.status !== "granted") {
      Alert.alert(
        "Location required",
        "Allow location access so the mechanic can navigate to your booking site.",
      );
      return;
    }
    setSubmittingSchedule(true);
    const { data: existingBooking, error: existingBookingError } =
      await supabase
        .from("service_requests")
        .select("id")
        .eq("motorist_id", session.user.id)
        .in("status", [
          "pending",
          "scheduled",
          "accepted",
          "in_transit",
          "arrived",
          "in_progress",
        ])
        .limit(1)
        .maybeSingle();
    if (existingBookingError || existingBooking) {
      setSubmittingSchedule(false);
      Alert.alert(
        existingBookingError ? "Booking unavailable" : "Booking in progress",
        existingBookingError
          ? existingBookingError.message
          : "You already have an ongoing booking. Please wait until it is completed.",
      );
      return;
    }
    const location =
      (await Location.getLastKnownPositionAsync()) ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));
    const servicePrice = scheduleSelected.reduce(
      (total, service) => total + Number(service.price || 0),
      0,
    );
    const serviceNames = scheduleSelected.map((service) => service.name).join(", ");
    const deliveryFee = 100 + Math.max(0, Math.ceil(scheduleMechanic.distanceKm) - 1) * 10;
    const { data: createdBooking, error } = await supabase
      .from("service_requests")
      .insert({
      motorist_id: session.user.id,
      mechanic_id: scheduleMechanic.id,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      status: "scheduled",
      request_type: "scheduled",
      scheduled_at: scheduleDate.toISOString(),
      vehicle_type: `${scheduleVehicle.make} ${scheduleVehicle.model}`.trim(),
      plate_number: scheduleVehicle.plate_number,
      service_name: serviceNames,
      service_price: servicePrice,
      service_breakdown: scheduleSelected.map((service) => ({
        service: service.name,
        price: Number(service.price) || 0,
      })),
      delivery_fee: deliveryFee,
      estimated_total: servicePrice + deliveryFee,
      vehicle_issue: scheduleNotes.trim()
        ? `${serviceNames}\nNotes: ${scheduleNotes.trim()}`
        : serviceNames,
      })
      .select("*")
      .single();
    setSubmittingSchedule(false);
    if (error) {
      Alert.alert("Booking failed", error.message);
      return;
    }
    if (createdBooking) {
      setCachedActiveBooking(session.user.id, createdBooking);
    }
    setScheduleMechanic(null);
    await fetchMyOrders();
    setBookingSubmittedVisible(true);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <MotoristHomeHeader />
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
            <Text
              style={[styles.acceptanceNoticeTitle, { color: colors.text }]}
            >
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
          <View
            style={[styles.cancelSuccessCard, { backgroundColor: colors.card }]}
          >
            <View style={styles.cancelSuccessIcon}>
              <Ionicons name="checkmark" size={32} color="#FFFFFF" />
            </View>
            <Text style={[styles.cancelSuccessTitle, { color: colors.text }]}>
              Booking Cancelled
            </Text>
            <Text
              style={[styles.cancelSuccessMessage, { color: colors.textMuted }]}
            >
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
      <Modal
        visible={warningRecordedVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setWarningRecordedVisible(false)}
      >
        <View style={styles.reasonRequiredOverlay}>
          <View
            style={[
              styles.reasonRequiredCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            accessibilityRole="alert"
          >
            <View style={styles.warningRecordedIcon}>
              <Ionicons name="warning-outline" size={25} color="#B76E00" />
            </View>
            <Text style={[styles.reasonRequiredTitle, { color: colors.text }]}>
              Warning Recorded
            </Text>
            <Text
              style={[
                styles.reasonRequiredMessage,
                { color: colors.textMuted },
              ]}
            >
              Cancelling because the issue was resolved locally wastes the
              dispatched mechanic&apos;s time and fuel. Repeated cancellations
              will result in a temporary account suspension.
            </Text>
            <TouchableOpacity
              style={styles.reasonRequiredButton}
              onPress={() => setWarningRecordedVisible(false)}
              accessibilityRole="button"
            >
              <Text style={styles.reasonRequiredButtonText}>Understood</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={bookingSubmittedVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBookingSubmittedVisible(false)}
      >
        <View style={styles.cancelSuccessOverlay}>
          <View
            style={[
              styles.cancelSuccessCard,
              { backgroundColor: colors.card },
            ]}
            accessibilityRole="alert"
          >
            <View style={styles.cancelSuccessIcon}>
              <Ionicons name="checkmark" size={32} color="#FFFFFF" />
            </View>
            <Text style={[styles.cancelSuccessTitle, { color: colors.text }]}>
              Booking Submitted
            </Text>
            <Text
              style={[
                styles.cancelSuccessMessage,
                { color: colors.textMuted },
              ]}
            >
              Your scheduled service request was sent.
            </Text>
            <TouchableOpacity
              style={styles.cancelSuccessButton}
              onPress={() => setBookingSubmittedVisible(false)}
              accessibilityRole="button"
            >
              <Text style={styles.cancelSuccessButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={servicesMechanic !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setServicesMechanic(null)}
      >
        <View
          style={[
            styles.servicesModalOverlay,
            { backgroundColor: colors.overlay },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setServicesMechanic(null)}
            accessibilityRole="button"
            accessibilityLabel="Close service offerings"
          />
          <SafeAreaView
            style={[styles.servicesSheet, { backgroundColor: colors.card }]}
            edges={[]}
          >
            <View style={[styles.servicesSheetHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                style={styles.servicesBackButton}
                onPress={() => setServicesMechanic(null)}
                accessibilityLabel="Back to mechanic services"
              >
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.servicesSheetTitleRow}>
                <Ionicons name="settings" size={14} color={colors.primary} />
                <Text style={[styles.servicesSheetTitle, { color: colors.primary }]}>
                  OFFERED SERVICES &amp; BASE PRICES
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.servicesCloseButton, { backgroundColor: colors.btnSecondary }]}
                onPress={() => setServicesMechanic(null)}
                accessibilityLabel="Close service offerings"
              >
                <Ionicons name="close" size={19} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.fullServicesList}
              contentContainerStyle={styles.fullServicesContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {servicesMechanic?.services.length ? (
                servicesMechanic.services.map((service, index) => (
                  <View
                    key={`${service.name}-${index}`}
                    style={[
                      styles.fullServiceItem,
                      { backgroundColor: colors.softCard },
                    ]}
                  >
                    <View style={styles.fullServiceName}>
                      <View style={[styles.serviceIconBox, { backgroundColor: colors.card }]}>
                        <Ionicons
                          name="construct-outline"
                          size={19}
                          color={colors.primary}
                        />
                      </View>
                      <View style={styles.serviceCopy}>
                        <Text
                          style={[styles.serviceName, { color: colors.text }]}
                        >
                          {service.name}
                        </Text>
                        <Text style={[styles.serviceDescription, { color: colors.textMuted }]}>
                          {service.description || "Available from this mechanic"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.servicePriceColumn}>
                      <Text
                        style={[styles.servicePrice, { color: colors.primary }]}
                      >
                        {service.price > 0
                          ? `₱${service.price.toLocaleString("en-PH")}`
                          : "Contact"}
                      </Text>
                      <Text style={[styles.baseRateLabel, { color: colors.textMuted }]}>Base rate</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={[styles.noServices, { color: colors.textMuted }]}>
                  No service offerings listed.
                </Text>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={scheduleMechanic !== null}
        animationType="slide"
        onRequestClose={() => setScheduleMechanic(null)}
      >
        <SafeAreaView
          style={[styles.scheduleScreen, { backgroundColor: colors.bg }]}
          edges={["top", "bottom"]}
        >
          <ScrollView
            contentContainerStyle={styles.scheduleContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.scheduleTitleRow}>
              <TouchableOpacity
                onPress={() => setScheduleMechanic(null)}
                style={styles.scheduleBackButton}
              >
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.scheduleTitle, { color: colors.text }]}>BOOKING FORM</Text>
            </View>

            <Text style={[styles.scheduleSectionTitle, { color: colors.text }]}>YOUR VEHICLE</Text>
            <TouchableOpacity
              style={[styles.scheduleVehicleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                setScheduleVehiclePickerVisible((visible) => !visible);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.scheduleVehicleIcon}>
                <Ionicons name="car" size={23} color="#24439A" />
              </View>
              <View style={styles.scheduleVehicleCopy}>
                <Text style={[styles.scheduleVehicleLabel, { color: colors.textMuted }]}>PRIMARY VEHICLE</Text>
                <Text style={[styles.scheduleVehicleName, { color: colors.text }]}>
                  {scheduleVehicle
                    ? `${scheduleVehicle.make} ${scheduleVehicle.model}`
                    : "Vehicle not set"}
                </Text>
                <Text style={[styles.scheduleVehiclePlate, { color: colors.textMuted }]}>
                  PLATE: {scheduleVehicle?.plate_number ?? "NOT SET"}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color="#24439A" />
            </TouchableOpacity>
            <View style={styles.scheduleHeading}>
              <Text style={[styles.scheduleSectionTitle, { color: colors.text }]}>CHOOSE A SERVICE</Text>
              <Text style={[styles.scheduleHint, { color: colors.textMuted }]}>Select one or more services</Text>
            </View>
            <View style={styles.scheduleGrid}>
              {scheduleServices.map((service, index) => {
                const selected = scheduleSelected.some(
                  (item) => item.name === service.name && item.price === service.price,
                );
                return (
                  <TouchableOpacity
                    key={`${service.name}-${index}`}
                    style={[
                      styles.scheduleServiceCard,
                      { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border },
                    ]}
                    onPress={() =>
                      setScheduleSelected((current) =>
                        selected
                          ? current.filter(
                              (item) =>
                                item.name !== service.name ||
                                item.price !== service.price,
                            )
                          : [...current, service],
                      )
                    }
                  >
                    <View style={styles.scheduleServiceTop}>
                      <View style={styles.scheduleServiceIcon}>
                        <Ionicons name="construct-outline" size={19} color="#24439A" />
                      </View>
                      <Ionicons
                        name={selected ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={selected ? "#24439A" : "#7D8295"}
                      />
                    </View>
                    <Text style={[styles.scheduleServiceName, { color: colors.text }]}>{service.name}</Text>
                    <Text style={[styles.scheduleServicePrice, { color: colors.primary }]}>
                      ₱{Number(service.price || 0).toLocaleString("en-PH")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.scheduleSectionTitle, { color: colors.text }]}>SCHEDULE YOUR VISIT</Text>
            <View style={styles.scheduleDateRow}>
              {(["date", "time"] as const).map((kind) => (
                <View style={styles.scheduleDateField} key={kind}>
                  <Text style={[styles.scheduleDateLabel, { color: colors.textMuted }]}>
                    {kind === "date" ? "Date" : "Time"}
                  </Text>
                  <TouchableOpacity
                    style={[styles.scheduleDateButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => openSchedulePicker(kind)}
                  >
                    <Ionicons
                      name={kind === "date" ? "calendar-outline" : "time-outline"}
                      size={20}
                      color="#24439A"
                    />
                    <Text style={[styles.scheduleDateText, { color: colors.text }]}>
                      {kind === "date"
                        ? scheduleDate.toLocaleDateString([], {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : scheduleDate.toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            {Platform.OS !== "android" && schedulePicker ? (
              <DateTimePicker
                value={scheduleDate}
                mode={schedulePicker}
                display="default"
                minimumDate={schedulePicker === "date" ? new Date() : undefined}
                onValueChange={(_event, value) => {
                  if (!value) return;
                  updateScheduleDate(schedulePicker, value);
                  setSchedulePicker(null);
                }}
                onDismiss={() => setSchedulePicker(null)}
              />
            ) : null}

            <Text style={[styles.scheduleSectionTitle, { color: colors.text }]}>ADDITIONAL NOTES</Text>
            <TextInput
              style={[styles.scheduleNotesInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              placeholder="Share anything the mechanic should know..."
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              value={scheduleNotes}
              onChangeText={setScheduleNotes}
            />
            <View style={[styles.scheduleEstimateCard, { backgroundColor: colors.softCard }]}>
              <View style={styles.scheduleEstimateHeader}>
                <Text style={[styles.scheduleEstimateTitle, { color: colors.text }]}>Service estimate</Text>
                <Text style={styles.scheduleEstimateBadge}>ESTIMATED</Text>
              </View>
              <View style={styles.scheduleEstimateRow}>
                <Text style={[styles.scheduleEstimateLabel, { color: colors.textMuted }]}>Services</Text>
                <Text style={[styles.scheduleEstimateValue, { color: colors.primary }]}>
                  ₱{scheduleSelected
                    .reduce((sum, service) => sum + Number(service.price || 0), 0)
                    .toLocaleString("en-PH")}
                </Text>
              </View>
              <View style={styles.scheduleEstimateRow}>
                <Text style={[styles.scheduleEstimateLabel, { color: colors.textMuted }]}>
                  Distance fee ({scheduleMechanic?.distance})
                </Text>
                <Text style={[styles.scheduleEstimateValue, { color: colors.primary }]}>
                  ₱{(scheduleMechanic
                    ? 100 + Math.max(0, Math.ceil(scheduleMechanic.distanceKm) - 1) * 10
                    : 100
                  ).toLocaleString("en-PH")}
                </Text>
              </View>
              <View style={styles.scheduleEstimateTotal}>
                <Text style={[styles.scheduleEstimateTotalLabel, { color: colors.text }]}>Estimated total</Text>
                <Text style={[styles.scheduleEstimateTotalValue, { color: colors.primary }]}>
                  ₱{(
                    scheduleSelected.reduce(
                      (sum, service) => sum + Number(service.price || 0),
                      0,
                    ) +
                    (scheduleMechanic
                      ? 100 + Math.max(0, Math.ceil(scheduleMechanic.distanceKm) - 1) * 10
                      : 100)
                  ).toLocaleString("en-PH")}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.scheduleSubmit, submittingSchedule && { opacity: 0.6 }]}
              onPress={() => void submitScheduleBooking()}
              disabled={submittingSchedule}
            >
              <Text style={styles.scheduleSubmitText}>
                {submittingSchedule ? "Booking..." : "Confirm booking"}
              </Text>
              <Ionicons name="arrow-forward-circle-outline" size={21} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={scheduleVehiclePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setScheduleVehiclePickerVisible(false)}
      >
        <View style={styles.scheduleVehiclePickerOverlay}>
          <View style={styles.scheduleVehiclePickerSheet}>
            <View style={styles.scheduleVehiclePickerHeader}>
              <View style={styles.scheduleVehiclePickerTitleRow}>
                <TouchableOpacity
                  onPress={() => setScheduleVehiclePickerVisible(false)}
                  style={styles.scheduleVehiclePickerBack}
                  accessibilityLabel="Back to booking form"
                >
                  <Ionicons name="arrow-back" size={23} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.scheduleVehiclePickerTitle}>
                  CHOOSE A VEHICLE
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setScheduleVehiclePickerVisible(false)}
                style={styles.scheduleVehiclePickerClose}
                accessibilityLabel="Close vehicle choices"
              >
                <Ionicons name="close" size={21} color="#536078" />
              </TouchableOpacity>
            </View>
            <Text style={styles.scheduleVehiclePickerSubtitle}>
              Select the vehicle for this booking
            </Text>
            <ScrollView
              contentContainerStyle={styles.scheduleVehiclePickerList}
              showsVerticalScrollIndicator={false}
            >
              {scheduleVehicles.map((vehicle) => {
                const selected = scheduleVehicle?.id === vehicle.id;
                return (
                  <TouchableOpacity
                    key={vehicle.id}
                    style={[
                      styles.scheduleVehicleOption,
                      selected && styles.scheduleVehicleOptionSelected,
                    ]}
                    onPress={() => {
                      setScheduleVehicle(vehicle);
                      setScheduleVehiclePickerVisible(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.scheduleVehicleOptionIcon}>
                      <Ionicons name="car" size={22} color="#24439A" />
                    </View>
                    <View style={styles.scheduleVehicleOptionCopy}>
                      <View style={styles.scheduleVehicleOptionMeta}>
                        <Text style={styles.scheduleVehicleOptionBadge}>
                          {vehicle.is_primary ? "GARAGE DEFAULT" : "GARAGE"}
                        </Text>
                        {vehicle.is_primary ? (
                          <Text style={styles.scheduleVehicleOptionDefault}>
                            Primary vehicle
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.scheduleVehicleOptionName}>
                        {vehicle.make} {vehicle.model}
                      </Text>
                      <Text style={styles.scheduleVehicleOptionPlate}>
                        PLATE: {vehicle.plate_number}
                      </Text>
                    </View>
                    <Ionicons
                      name={selected ? "checkmark-circle" : "ellipse-outline"}
                      size={23}
                      color={selected ? "#24439A" : "#7D8295"}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
        {visibleBookings.length === 0 ? (
          showNearbyMechanics ? (
            <View style={styles.nearbyBrowse}>
              <TouchableOpacity
                style={styles.nearbyBackButton}
                onPress={() => setShowNearbyMechanics(false)}
                accessibilityLabel="Back to bookings empty state"
              >
                <Ionicons name="arrow-back" size={19} color={colors.text} />
                <Text style={[styles.nearbyBackText, { color: colors.text }]}>
                  Back
                </Text>
              </TouchableOpacity>
              <Text style={[styles.nearbyBrowseTitle, { color: colors.text }]}>
                My Bookings
              </Text>
              <View
                style={[
                  styles.nearbySearchBox,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons name="search-outline" size={22} color="#536078" />
                <TextInput
                  value={nearbySearch}
                  onChangeText={setNearbySearch}
                  placeholder="Search for mechanic name, service offer"
                  placeholderTextColor="#7B8499"
                  style={[styles.nearbySearchInput, { color: colors.text }]}
                  returnKeyType="search"
                />
              </View>
              <View style={styles.nearbyFilterRow}>
                {(["all", "nearby"] as const).map((filter) => (
                  <Pressable
                    key={filter}
                    onPress={() => setNearbyFilter(filter)}
                    style={[
                      styles.nearbyFilterButton,
                      nearbyFilter === filter &&
                        styles.nearbyFilterButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.nearbyFilterText,
                        nearbyFilter === filter &&
                          styles.nearbyFilterTextActive,
                      ]}
                    >
                      {filter === "all" ? "All" : "Nearby"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {nearbyLoading && visibleNearbyMechanics.length === 0 ? (
                <ActivityIndicator
                  size="large"
                  color={colors.primary}
                  style={styles.nearbyLoader}
                />
              ) : visibleNearbyMechanics.length ? (
                visibleNearbyMechanics.map((mechanic) => (
                  <View
                    key={mechanic.id}
                    style={[
                      styles.nearbyMechanicCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.nearbyMechanicTopRow}>
                      <View style={styles.nearbyRating}>
                        <Ionicons name="star" size={17} color="#FF6B2C" />
                        <Text
                          style={[
                            styles.nearbyRatingText,
                            { color: colors.text },
                          ]}
                        >
                          {mechanic.rating.toFixed(1)}
                          {mechanic.reviewCount
                            ? ` (${mechanic.reviewCount})`
                            : ""}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.nearbyMechanicIdentity}>
                      <View style={styles.nearbyAvatarWrap}>
                        <ProfileAvatar
                          uri={mechanic.avatarUrl}
                          name={mechanic.name}
                          size={42}
                          backgroundColor="#E8ECFF"
                        />
                        <View
                          style={[
                            styles.nearbyOnlineDot,
                            {
                              backgroundColor: mechanic.isOnline
                                ? "#20C66B"
                                : "#98A2B3",
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.nearbyMechanicCopy}>
                        <Text
                          style={[
                            styles.nearbyMechanicName,
                            { color: colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {mechanic.name}
                        </Text>
                        <Text
                          style={[
                            styles.nearbyMechanicSkill,
                            { color: colors.textMuted },
                          ]}
                          numberOfLines={2}
                        >
                          {mechanic.skills}
                        </Text>
                        <View style={styles.nearbyLocationRow}>
                          <Ionicons
                            name="navigate-outline"
                            size={16}
                            color="#C44A00"
                          />
                          <Text style={styles.nearbyDistance}>
                            {mechanic.distance}
                          </Text>
                          <Ionicons
                            name="time-outline"
                            size={16}
                            color="#2450D8"
                          />
                          <Text style={styles.nearbyEta}>
                            ~{mechanic.etaMinutes} mins arrival
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.nearbyActions}>
                      <TouchableOpacity
                        onPress={() => openMechanicDetails(mechanic)}
                        style={styles.nearbyDetailsButton}
                      >
                        <Ionicons
                          name="list-outline"
                          size={20}
                          color="#172B66"
                        />
                        <Text style={styles.nearbyDetailsText}>
                          View Services
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void openScheduleForm(mechanic)}
                        style={styles.nearbyBookButton}
                      >
                        <Ionicons
                          name="person-add-outline"
                          size={21}
                          color="#FFFFFF"
                        />
                        <Text style={styles.nearbyBookText}>Book Now</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : null}
            </View>
          ) : (
            <View style={[styles.emptyState, styles.emptyBookingsState]}>
              {loading ? (
                <ActivityIndicator
                  size="large"
                  color={colors.primary}
                  style={styles.emptyBookingsLoading}
                  accessibilityLabel="Loading bookings"
                />
              ) : (
                <>
                  <Ionicons
                    name="receipt-outline"
                    size={54}
                    color={colors.border}
                  />
                  <Text style={[styles.emptyText, { color: colors.text }]}>
                    No active bookings.
                  </Text>
                  <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                    You don&apos;t have any active bookings right now.
                  </Text>
                  <TouchableOpacity
                    style={styles.viewMechanicsButton}
                    onPress={() => setShowNearbyMechanics(true)}
                  >
                    <Ionicons
                      name="people-outline"
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.viewMechanicsButtonText}>
                      View Mechanics Near You
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )
        ) : (
          visibleBookings.map((req) => {
            const requestType = String(req.request_type ?? "").toLowerCase();
            const requestStatus = String(req.status ?? "").toLowerCase();
            const isWaitingForMechanic = ["pending", "scheduled"].includes(
              requestStatus,
            );
            const showScheduledStyle =
              (requestType === "emergency" && isWaitingForMechanic) ||
              (Boolean(req.mechanic_id) &&
                (requestType === "scheduled" || requestType === "emergency") &&
                (requestStatus === "scheduled" ||
                  [
                    "accepted",
                    "in_transit",
                    "arrived",
                    "in_progress",
                    "ongoing",
                  ].includes(requestStatus)));
            return showScheduledStyle ? (
              <ScheduledBookingCard
                key={req.id}
                request={req}
                colors={colors}
                unreadMessageCount={unreadChatCounts[String(req.id)] ?? 0}
                onCancel={handleCancel}
              />
            ) : (
              <View
                key={req.id}
                style={
                  requestType === "emergency"
                    ? styles.emergencyRequest
                    : [
                        styles.card,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]
                }
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
          <View
            style={[
              styles.issueModalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.issueModalTitle, { color: colors.text }]}>
              Report booking issue
            </Text>
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
                  style={[
                    styles.otherIssueInput,
                    { borderColor: colors.border, color: colors.text },
                  ]}
                  multiline
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.submitIssueButton}
                  onPress={() => {
                    const reason = otherCancelReason.trim();
                    if (!reason) {
                      setReasonRequiredMessage(
                        "Please enter a reason before continuing.",
                      );
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
                    <Text
                      style={[styles.issueOptionText, { color: colors.text }]}
                    >
                      {reason}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color="#EF4444"
                    />
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
              <Text
                style={[styles.issueCancelText, { color: colors.textMuted }]}
              >
                {enteringOtherReason ? "Back" : "Cancel"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={unableToCancelMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setUnableToCancelMessage(null)}
      >
        <View style={styles.unableToCancelOverlay}>
          <View
            style={[
              styles.unableToCancelCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.unableToCancelHeader}>
              <View style={styles.unableToCancelIcon}>
                <Ionicons
                  name="lock-closed-outline"
                  size={25}
                  color="#C2413A"
                />
              </View>
              <Pressable
                style={[
                  styles.unableToCancelClose,
                  { backgroundColor: colors.bg },
                ]}
                onPress={() => setUnableToCancelMessage(null)}
                accessibilityRole="button"
                accessibilityLabel="Close message"
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.unableToCancelTitle, { color: colors.text }]}>
              Unable to cancel booking
            </Text>
            <Text
              style={[
                styles.unableToCancelDescription,
                { color: colors.textMuted },
              ]}
            >
              {unableToCancelMessage}
            </Text>
            <TouchableOpacity
              style={[
                styles.unableToCancelButton,
                { backgroundColor: colors.primary },
              ]}
              onPress={() => setUnableToCancelMessage(null)}
              accessibilityRole="button"
            >
              <Text style={styles.unableToCancelButtonText}>Understood</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={reasonRequiredMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReasonRequiredMessage(null)}
      >
        <View style={styles.reasonRequiredOverlay}>
          <View
            style={[
              styles.reasonRequiredCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            accessibilityRole="alert"
          >
            <Text style={[styles.reasonRequiredTitle, { color: colors.text }]}>
              Reason Required
            </Text>
            <Text
              style={[
                styles.reasonRequiredMessage,
                { color: colors.textMuted },
              ]}
            >
              {reasonRequiredMessage}
            </Text>
            <TouchableOpacity
              style={styles.reasonRequiredButton}
              onPress={() => setReasonRequiredMessage(null)}
              accessibilityRole="button"
            >
              <Text style={styles.reasonRequiredButtonText}>Understood</Text>
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
          <View
            style={[
              styles.confirmationCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.confirmationTitle, { color: colors.text }]}>
              Confirm Cancellation
            </Text>
            <Text
              style={[styles.confirmationMessage, { color: colors.textMuted }]}
            >
              Are you sure you want to cancel this booking?
            </Text>
            <View
              style={[
                styles.selectedReasonBox,
                { backgroundColor: colors.bg, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.selectedReasonLabel,
                  { color: colors.textMuted },
                ]}
              >
                Selected reason
              </Text>
              <Text
                style={[styles.selectedReasonValue, { color: colors.text }]}
              >
                {confirmationReason}
              </Text>
            </View>
            <Text
              style={[styles.confirmationWarning, { color: colors.textMuted }]}
            >
              This action cannot be undone.
            </Text>
            <View style={styles.confirmationActions}>
              <TouchableOpacity
                style={[
                  styles.keepBookingButton,
                  { borderColor: colors.border },
                ]}
                onPress={() => setConfirmationReason(null)}
                disabled={isCancelling}
              >
                <Text style={[styles.keepBookingText, { color: colors.text }]}>
                  Keep Booking
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.finalCancelButton,
                  isCancelling && { opacity: 0.7 },
                ]}
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
  acceptanceNoticeMessage: {
    fontSize: normalizeText(14),
    lineHeight: normalizeText(20),
    marginTop: 2,
  },
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
  cancelSuccessTitle: {
    fontSize: normalizeText(22),
    fontWeight: "800",
    marginBottom: 8,
  },
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
  cancelSuccessButtonText: {
    color: "#FFFFFF",
    fontSize: normalizeText(17),
    fontWeight: "800",
  },
  servicesModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(16, 27, 52, 0.18)",
  },
  servicesSheet: {
    width: 390,
    height: 500,
    maxWidth: "100%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    elevation: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  servicesSheetHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E6EAF5",
  },
  servicesSheetTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  servicesSheetTitle: {
    color: "#0037B0",
    fontSize: normalizeText(13),
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  servicesCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9EDFA",
  },
  servicesBackButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  fullServicesList: { flex: 1, marginTop: 0 },
  fullServicesContent: { paddingTop: 5, paddingBottom: 12 },
  fullServiceItem: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 10,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F0F2FA",
  },
  fullServiceName: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  serviceIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  serviceCopy: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-end",
    paddingBottom: 2,
  },
  serviceName: {
    flex: 1,
    fontSize: normalizeText(15),
    fontWeight: "600",
    textAlign: "left",
  },
  serviceDescription: {
    color: "#657085",
    fontSize: normalizeText(10),
    lineHeight: normalizeText(13),
    marginTop: 2,
    textAlign: "left",
  },
  servicePriceColumn: {
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 8,
  },
  servicePrice: { fontSize: normalizeText(15), fontWeight: "800" },
  baseRateLabel: {
    color: "#657085",
    fontSize: normalizeText(10),
    marginTop: 2,
  },
  noServices: { paddingVertical: 14, fontSize: normalizeText(14) },
  servicesModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  servicesModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  servicesModalTitleCopy: { flex: 1, minWidth: 0 },
  servicesModalTitle: { fontSize: normalizeText(21), fontWeight: "800" },
  servicesModalSubtitle: { fontSize: normalizeText(13), marginTop: 2 },
  servicesModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF0FF",
  },
  servicesModalMeta: {
    fontSize: normalizeText(12),
    marginTop: 12,
    marginBottom: 8,
  },
  servicesModalList: { marginBottom: 18 },
  servicesModalRow: {
    minHeight: 48,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  servicesModalService: {
    flex: 1,
    fontSize: normalizeText(14),
    fontWeight: "600",
  },
  servicesModalPrice: {
    color: "#0037B0",
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  servicesModalDone: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2450D8",
  },
  servicesModalDoneText: {
    color: "#FFFFFF",
    fontSize: normalizeText(14),
    fontWeight: "800",
  },

  content: { padding: 20 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    padding: 24,
  },
  emptyBookingsState: { marginTop: 170 },
  emptyBookingsLoading: { marginTop: 24 },
  emptyText: { fontSize: normalizeText(20), fontWeight: "700", marginTop: 16 },
  emptySub: {
    fontSize: normalizeText(16),
    textAlign: "center",
    marginTop: 8,
    lineHeight: normalizeText(24),
  },
  viewMechanicsButton: {
    marginTop: 22,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 13,
    backgroundColor: "#2450D8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 2,
  },
  viewMechanicsButtonText: {
    color: "#FFFFFF",
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  nearbyBrowse: { paddingBottom: 24 },
  nearbyBackButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 10,
    paddingVertical: 4,
  },
  nearbyBackText: { fontSize: normalizeText(14), fontWeight: "700" },
  nearbyBrowseTitle: {
    fontSize: normalizeText(23),
    fontWeight: "800",
    marginBottom: 12,
  },
  nearbySearchBox: {
    minHeight: 50,
    borderWidth: 1.5,
    borderRadius: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#2450D8",
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  nearbySearchInput: {
    flex: 1,
    marginLeft: 9,
    fontSize: normalizeText(13),
    minHeight: 42,
  },
  nearbyFilterRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 9,
    marginBottom: 14,
  },
  nearbyFilterButton: {
    minWidth: 122,
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#B7BED0",
    backgroundColor: "#EEF0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  nearbyFilterButtonActive: {
    borderColor: "#0037B0",
    backgroundColor: "#0037B0",
  },
  nearbyFilterText: {
    color: "#4F576A",
    fontSize: normalizeText(13),
    fontWeight: "800",
  },
  nearbyFilterTextActive: { color: "#FFFFFF" },
  nearbyLoader: { marginTop: 50 },
  nearbyMechanicCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    elevation: 3,
    shadowColor: "#172B66",
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  nearbyMechanicTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  nearbyRating: { flexDirection: "row", alignItems: "center", gap: 4 },
  nearbyRatingText: { fontSize: normalizeText(14), fontWeight: "800" },
  nearbyMechanicIdentity: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  nearbyAvatarWrap: { position: "relative" },
  nearbyOnlineDot: {
    position: "absolute",
    right: -1,
    bottom: 0,
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  nearbyMechanicCopy: { flex: 1, marginLeft: 10, minWidth: 0 },
  nearbyMechanicName: { fontSize: normalizeText(19), fontWeight: "800" },
  nearbyMechanicSkill: {
    fontSize: normalizeText(13),
    marginTop: 2,
    lineHeight: normalizeText(18),
  },
  nearbyLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 3,
    marginTop: 3,
  },
  nearbyDistance: {
    color: "#C44A00",
    fontSize: normalizeText(12),
    fontWeight: "700",
    marginRight: 5,
  },
  nearbyEta: {
    color: "#2450D8",
    fontSize: normalizeText(12),
    fontWeight: "700",
  },
  nearbyActions: { flexDirection: "row", gap: 6 },
  nearbyDetailsButton: {
    flex: 0.9,
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: "#F0F2FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  nearbyDetailsText: {
    color: "#172B66",
    fontSize: normalizeText(13),
    fontWeight: "800",
  },
  nearbyBookButton: {
    flex: 1.3,
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: "#2450D8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    elevation: 2,
  },
  nearbyBookText: {
    color: "#FFFFFF",
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  scheduleScreen: { flex: 1, backgroundColor: "#F8F8FC" },
  scheduleContent: { padding: 16, paddingBottom: 28 },
  scheduleTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  scheduleBackButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", marginRight: 10 },
  scheduleTitle: { color: "#30323D", fontSize: normalizeText(19), fontWeight: "900", letterSpacing: 0.5 },
  scheduleSectionTitle: { color: "#30323D", fontSize: normalizeText(13), fontWeight: "900", letterSpacing: 0.8, marginBottom: 8 },
  scheduleVehicleCard: { minHeight: 86, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", marginTop: 2, marginBottom: 24, borderWidth: 1, borderColor: "#E4E5EC" },
  scheduleVehicleIcon: { width: 54, height: 54, borderRadius: 12, backgroundColor: "#E8ECFF", alignItems: "center", justifyContent: "center", marginRight: 13 },
  scheduleVehicleCopy: { flex: 1 },
  scheduleVehicleLabel: { color: "#7D8295", fontSize: normalizeText(10), fontWeight: "900", letterSpacing: 0.6, marginBottom: 5 },
  scheduleVehicleName: { color: "#30323D", fontSize: normalizeText(18), fontWeight: "900" },
  scheduleVehiclePlate: { color: "#7D8295", fontSize: normalizeText(12), fontWeight: "700", letterSpacing: 0.7, marginTop: 3 },
  scheduleVehiclePickerOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 50, 0.45)", justifyContent: "flex-end" },
  scheduleVehiclePickerSheet: { maxHeight: "82%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === "ios" ? 30 : 20 },
  scheduleVehiclePickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scheduleVehiclePickerTitleRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  scheduleVehiclePickerBack: { width: 34, height: 34, alignItems: "center", justifyContent: "center", marginRight: 8 },
  scheduleVehiclePickerTitle: { color: "#30323D", fontSize: normalizeText(18), fontWeight: "900", letterSpacing: 0.5 },
  scheduleVehiclePickerClose: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F2F8" },
  scheduleVehiclePickerSubtitle: { color: "#7D8295", fontSize: normalizeText(13), marginTop: 4, marginLeft: 42, marginBottom: 16 },
  scheduleVehiclePickerList: { paddingBottom: 4 },
  scheduleVehicleOption: { minHeight: 88, borderWidth: 1, borderColor: "#E4E5EC", borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", marginBottom: 10 },
  scheduleVehicleOptionSelected: { backgroundColor: "#F0F3FF", borderColor: "#24439A", borderLeftWidth: 4 },
  scheduleVehicleOptionIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: "#E8ECFF", alignItems: "center", justifyContent: "center", marginRight: 12 },
  scheduleVehicleOptionCopy: { flex: 1 },
  scheduleVehicleOptionMeta: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 3 },
  scheduleVehicleOptionBadge: { color: "#24439A", fontSize: normalizeText(10), fontWeight: "900", letterSpacing: 0.6 },
  scheduleVehicleOptionDefault: { color: "#7D8295", fontSize: normalizeText(11) },
  scheduleVehicleOptionName: { color: "#30323D", fontSize: normalizeText(16), fontWeight: "900" },
  scheduleVehicleOptionPlate: { color: "#7D8295", fontSize: normalizeText(11), fontWeight: "700", letterSpacing: 0.7, marginTop: 3 },
  scheduleHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 },
  scheduleHint: { color: "#7D8295", fontSize: normalizeText(12), marginBottom: 8 },
  scheduleGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 22 },
  scheduleServiceCard: { width: "48.5%", minHeight: 132, backgroundColor: "#FFFFFF", borderRadius: 15, padding: 14, justifyContent: "space-between", borderWidth: 1, borderColor: "#E4E5EC", marginBottom: 10 },
  scheduleServiceSelected: { backgroundColor: "#FFFFFF", borderColor: "#E4E5EC", borderLeftColor: "#24439A", borderLeftWidth: 4 },
  scheduleServiceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  scheduleServiceIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#F0F2F8", alignItems: "center", justifyContent: "center" },
  scheduleServiceName: { color: "#30323D", fontSize: normalizeText(14), lineHeight: normalizeText(18), fontWeight: "800" },
  scheduleServicePrice: { color: "#24439A", fontSize: normalizeText(13), fontWeight: "900", marginTop: 6 },
  scheduleDateRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  scheduleDateField: { flex: 1 },
  scheduleDateLabel: { color: "#7D8295", fontSize: normalizeText(12), fontWeight: "800", marginBottom: 6 },
  scheduleDateButton: { minHeight: 48, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4E5EC", borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  scheduleDateText: { color: "#30323D", flex: 1, fontSize: normalizeText(14), fontWeight: "700" },
  scheduleNotesInput: { minHeight: 105, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4E5EC", borderRadius: 14, padding: 14, color: "#30323D", fontSize: normalizeText(14), lineHeight: normalizeText(20), marginBottom: 16 },
  scheduleEstimateCard: { backgroundColor: "#E0E6FF", borderRadius: 16, padding: 16, marginBottom: 14 },
  scheduleEstimateHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  scheduleEstimateTitle: { color: "#20263C", fontSize: normalizeText(15), fontWeight: "900" },
  scheduleEstimateBadge: { color: "#24439A", backgroundColor: "#C7D4FF", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 5, fontSize: normalizeText(10), fontWeight: "900" },
  scheduleEstimateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  scheduleEstimateLabel: { color: "#69718A", fontSize: normalizeText(12), flex: 1 },
  scheduleEstimateValue: { color: "#24439A", fontSize: normalizeText(21), fontWeight: "900" },
  scheduleEstimateTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#C7D4FF", marginTop: 7, paddingTop: 10 },
  scheduleEstimateTotalLabel: { color: "#20263C", fontSize: normalizeText(15), fontWeight: "900" },
  scheduleEstimateTotalValue: { color: "#24439A", fontSize: normalizeText(22), fontWeight: "900" },
  scheduleSubmit: { minHeight: 54, borderRadius: 15, backgroundColor: "#24439A", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  scheduleSubmitText: { color: "#FFFFFF", fontSize: normalizeText(15), fontWeight: "900" },

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
  emergencyRequest: { paddingVertical: 12, marginBottom: 16 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  serviceType: { fontSize: normalizeText(17), fontWeight: "800" },
  status: {
    fontSize: normalizeText(13),
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  issue: {
    fontSize: normalizeText(16),
    lineHeight: normalizeText(24),
    marginBottom: 12,
  },

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
  receiptPrice: {
    fontSize: normalizeText(18),
    fontWeight: "900",
    color: "#10b981",
  },
  receiptNotes: {
    fontSize: normalizeText(15),
    fontStyle: "italic",
    marginTop: 4,
  },
  additionalChargesBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF9ED",
    borderWidth: 1,
    borderColor: "#F2D08A",
  },
  additionalChargesTitle: {
    color: "#8A5A00",
    fontSize: normalizeText(15),
    fontWeight: "800",
    marginBottom: 8,
  },
  additionalChargeRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F2D08A",
  },
  additionalChargeCopy: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  additionalChargeDescription: {
    flex: 1,
    color: "#34383F",
    fontSize: normalizeText(15),
    fontWeight: "700",
  },
  additionalChargeAmount: {
    color: "#34383F",
    fontSize: normalizeText(15),
    fontWeight: "800",
  },
  additionalChargeActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  rejectChargeButton: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderColor: "#D98B8B",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectChargeText: {
    color: "#B33A3A",
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  approveChargeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 7,
    backgroundColor: "#18A957",
    alignItems: "center",
    justifyContent: "center",
  },
  approveChargeText: {
    color: "#FFFFFF",
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  approvedCharge: {
    color: "#18A957",
    fontSize: normalizeText(14),
    fontWeight: "800",
    marginTop: 6,
  },
  rejectedCharge: {
    color: "#B33A3A",
    fontSize: normalizeText(14),
    fontWeight: "800",
    marginTop: 6,
  },
  liveTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F2D08A",
  },
  liveTotalLabel: {
    color: "#34383F",
    fontSize: normalizeText(15),
    fontWeight: "800",
  },
  liveTotalValue: {
    color: "#2450D8",
    fontSize: normalizeText(18),
    fontWeight: "900",
  },

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
  cancelListButtonText: {
    color: "#EF4444",
    fontWeight: "bold",
    fontSize: normalizeText(16),
  },
  issueModalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  issueModalCard: { padding: 24, borderWidth: 1, borderRadius: 18 },
  unableToCancelOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(16, 24, 40, 0.58)",
  },
  unableToCancelCard: {
    padding: 22,
    borderWidth: 1,
    borderRadius: 22,
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 12,
  },
  unableToCancelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  unableToCancelIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(194, 65, 58, 0.12)",
  },
  unableToCancelClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  unableToCancelTitle: {
    fontSize: normalizeText(20),
    lineHeight: normalizeText(26),
    fontWeight: "800",
  },
  unableToCancelDescription: {
    fontSize: normalizeText(15),
    lineHeight: normalizeText(22),
    marginTop: 8,
  },
  unableToCancelButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
    borderRadius: 13,
  },
  unableToCancelButtonText: {
    color: "#FFFFFF",
    fontSize: normalizeText(15),
    fontWeight: "800",
  },
  issueModalTitle: { fontSize: normalizeText(22), fontWeight: "800" },
  issueModalHint: {
    fontSize: normalizeText(15),
    lineHeight: normalizeText(22),
    marginTop: 4,
    marginBottom: 16,
  },
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
  submitIssueText: {
    color: "#FFFFFF",
    fontSize: normalizeText(16),
    fontWeight: "800",
  },
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
    padding: 28,
    backgroundColor: "rgba(16, 24, 40, 0.58)",
  },
  confirmationCard: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  confirmationTitle: {
    textAlign: "center",
    fontSize: normalizeText(18),
    lineHeight: normalizeText(24),
    fontWeight: "800",
  },
  confirmationMessage: {
    textAlign: "center",
    fontSize: normalizeText(14),
    lineHeight: normalizeText(20),
    marginTop: 6,
  },
  selectedReasonBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 11,
    marginTop: 14,
  },
  selectedReasonLabel: {
    fontSize: normalizeText(11),
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectedReasonValue: {
    fontSize: normalizeText(14),
    fontWeight: "700",
    lineHeight: normalizeText(20),
    marginTop: 3,
  },
  confirmationWarning: {
    textAlign: "center",
    fontSize: normalizeText(12),
    marginTop: 10,
  },
  confirmationActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  keepBookingButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 6,
  },
  keepBookingText: { fontSize: normalizeText(14), fontWeight: "800" },
  finalCancelButton: {
    flex: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 6,
    backgroundColor: "#EF4444",
  },
  finalCancelText: {
    color: "#FFFFFF",
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  reasonRequiredOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(16, 24, 40, 0.58)",
  },
  reasonRequiredCard: {
    padding: 22,
    borderWidth: 1,
    borderRadius: 22,
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 12,
  },
  reasonRequiredTitle: {
    fontSize: normalizeText(20),
    lineHeight: normalizeText(26),
    fontWeight: "800",
  },
  warningRecordedIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF4D6",
    marginBottom: 14,
  },
  reasonRequiredMessage: {
    fontSize: normalizeText(15),
    lineHeight: normalizeText(22),
    marginTop: 8,
  },
  reasonRequiredButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
    borderRadius: 13,
    backgroundColor: "#2450D8",
  },
  reasonRequiredButtonText: {
    color: "#FFFFFF",
    fontSize: normalizeText(15),
    fontWeight: "800",
  },

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
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  mechanicBookingIdentity: { flex: 1, marginLeft: 12, minWidth: 0 },
  mechanicBookingName: {
    fontSize: normalizeText(19),
    lineHeight: normalizeText(26),
    fontWeight: "600",
  },
  mechanicRatingRow: { height: 18, flexDirection: "row", alignItems: "center" },
  ratingStar: {
    color: "#D97706",
    fontSize: normalizeText(19),
    lineHeight: normalizeText(20),
  },
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
  mechanicPlateBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E8ECFF",
    paddingHorizontal: 6,
    borderRadius: 4,
    marginTop: 2,
  },
  mechanicPlateText: {
    fontSize: normalizeText(12),
    lineHeight: normalizeText(18),
    fontWeight: "700",
    letterSpacing: 0.4,
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
  mechanicSummaryIcon: {
    width: 22,
    height: 22,
    tintColor: "#F08A00",
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
  callMechanicText: {
    color: "#FFFFFF",
    fontSize: normalizeText(18),
    fontWeight: "600",
  },
  squareBookingButton: {
    position: "relative",
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#E8ECFF",
    alignItems: "center",
    justifyContent: "center",
  },
  chatUnreadBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E53935",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  chatUnreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
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
  progressStep: {
    color: "#D87500",
    fontSize: normalizeText(15),
    fontWeight: "800",
  },
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
  progressIconText: {
    color: "#FFFFFF",
    fontSize: normalizeText(19),
    fontWeight: "800",
  },
  progressStepImage: {
    width: 23,
    height: 23,
    tintColor: "#FFFFFF",
  },
  progressCopy: { flex: 1 },
  progressRowTitle: {
    fontSize: normalizeText(17),
    fontWeight: "800",
    marginTop: 3,
  },
  progressRowSubtitle: {
    fontSize: normalizeText(15),
    lineHeight: normalizeText(22),
    marginTop: 3,
  },
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
  referenceId: {
    fontSize: normalizeText(26),
    fontWeight: "800",
    marginBottom: 20,
  },
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
    gap: 12,
    marginTop: 4,
  },
  estimatedFeeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  estimatedFeeHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  estimatedFeeLabel: {
    color: "#565C6D",
    fontSize: normalizeText(13),
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  estimatedFeeDescription: { fontSize: normalizeText(15), marginTop: 3 },
  estimatedFeeAmount: {
    color: "#29458F",
    flexShrink: 1,
    maxWidth: "48%",
    fontSize: normalizeText(20),
    fontWeight: "800",
    textAlign: "right",
  },
  estimatedFeeBreakdown: {
    borderTopWidth: 1,
    borderTopColor: "#C7D4FF",
    paddingTop: 8,
    gap: 5,
  },
  estimatedFeeBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  estimatedFeeBreakdownLabel: {
    flex: 1,
    color: "#565C6D",
    fontSize: normalizeText(14),
    fontWeight: "600",
  },
  estimatedFeeBreakdownValue: {
    color: "#29458F",
    fontSize: normalizeText(14),
    fontWeight: "700",
    textAlign: "right",
  },
});
