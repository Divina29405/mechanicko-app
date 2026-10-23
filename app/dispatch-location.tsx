import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const DEFAULT_LOCATION = {
  latitude: 14.5995,
  longitude: 120.9842,
  address: "153 M. Naval St. / Sampaloc, Manila",
};

const MAP_HTML = `
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    html, body, #map { height: 100%; margin: 0; }
    #map { background: #dcecf4; }
    .pin { width: 32px; height: 32px; border-radius: 16px; background: #24439a; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.25); color: #fff; display: flex; align-items: center; justify-content: center; font: 700 16px Arial; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var initial = [${DEFAULT_LOCATION.latitude}, ${DEFAULT_LOCATION.longitude}];
    var map = L.map('map').setView(initial, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    var marker = L.marker(initial, {
      icon: L.divIcon({ html: '<div class="pin">⌂</div>', className: '', iconSize: [32, 32], iconAnchor: [16, 16] })
    }).addTo(map);
    var circle = L.circle(initial, { radius: 10000, color: '#24439a', fillColor: '#24439a', fillOpacity: .12, weight: 2 }).addTo(map);
    window.setLocation = function(lat, lng) {
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
      map.setView([lat, lng], map.getZoom());
    };
    function selectPoint(lat, lng) {
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'LOCATION_SELECTED',
        latitude: lat,
        longitude: lng,
        address: 'Pinned dispatch location (' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ')'
      }));
    }
    map.on('click', function(event) { selectPoint(event.latlng.lat, event.latlng.lng); });
    window.setRadius = function(km) {
      circle.setRadius(km * 1000);
    };
  </script>
</body>
</html>`;

const radiusOptions = [
  { value: 5, title: "5 km", subtitle: "Fastest response", detail: "(~8 min)" },
  {
    value: 10,
    title: "10 km",
    subtitle: "Optimal daily job leads",
    detail: "",
  },
  { value: 15, title: "15 km", subtitle: "Extended travel rate", detail: "" },
];

type NominatimResult = {
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
  };
};

function formatNominatimAddress(result: NominatimResult) {
  const address = result.address;
  if (!address) return result.display_name;

  const street = [address.house_number, address.road].filter(Boolean).join(" ");
  const city = address.city ?? address.town ?? address.village;
  const parts = [street, address.neighbourhood, address.suburb, city].filter(
    (part): part is string => Boolean(part),
  );
  const uniqueParts = parts.filter(
    (part, index) => parts.findIndex((item) => item === part) === index,
  );

  return uniqueParts.join(", ") || result.display_name;
}

export default function DispatchLocationScreen() {
  const almostDoneTitleProgress = useSharedValue(0);
  const almostDoneTextProgress = useSharedValue(0);
  const { role, back } = useLocalSearchParams<{
    role?: string;
    back?: string;
  }>();
  const [radius, setRadius] = useState(10);
  const [address, setAddress] = useState(DEFAULT_LOCATION.address);
  const [coordinates, setCoordinates] = useState({
    latitude: DEFAULT_LOCATION.latitude,
    longitude: DEFAULT_LOCATION.longitude,
  });
  const [zones, setZones] = useState<string[]>([]);
  const [standby, setStandby] = useState(true);
  const [isAddingZone, setIsAddingZone] = useState(false);
  const [zoneDraft, setZoneDraft] = useState("");
  const [zoneError, setZoneError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAlmostDone, setShowAlmostDone] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const mapRef = useRef<WebView | null>(null);
  const expandedMapRef = useRef<WebView | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodeRequestRef = useRef(0);

  useEffect(() => {
    if (!showAlmostDone) {
      almostDoneTitleProgress.value = 0;
      almostDoneTextProgress.value = 0;
      return;
    }

    almostDoneTitleProgress.value = withTiming(1, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
    almostDoneTextProgress.value = withDelay(
      260,
      withTiming(1, {
        duration: 850,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [almostDoneTextProgress, almostDoneTitleProgress, showAlmostDone]);

  const almostDoneTitleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: almostDoneTitleProgress.value,
    transform: [{ translateY: 28 * (1 - almostDoneTitleProgress.value) }],
  }));
  const almostDoneTextAnimatedStyle = useAnimatedStyle(() => ({
    opacity: almostDoneTextProgress.value,
    transform: [{ translateY: 22 * (1 - almostDoneTextProgress.value) }],
  }));

  const updateRadius = (value: number) => {
    setRadius(value);
    mapRef.current?.injectJavaScript(`window.setRadius(${value}); true;`);
    expandedMapRef.current?.injectJavaScript(
      `window.setRadius(${value}); true;`,
    );
  };

  const removeZone = (zone: string) => {
    setZones((current) => current.filter((item) => item !== zone));
  };

  const addZone = () => {
    const newZone = zoneDraft.trim();
    if (!newZone) {
      setZoneError("Enter a coverage zone first.");
      return;
    }
    if (zones.some((zone) => zone.toLowerCase() === newZone.toLowerCase())) {
      setZoneError("This coverage zone is already selected.");
      return;
    }

    setZones((current) => [...current, newZone]);
    setZoneDraft("");
    setZoneError("");
    setIsAddingZone(false);
  };

  const reverseGeocode = (latitude: number, longitude: number) => {
    if (geocodeTimerRef.current) {
      clearTimeout(geocodeTimerRef.current);
    }

    const requestId = geocodeRequestRef.current + 1;
    geocodeRequestRef.current = requestId;
    setAddress("Finding the selected address...");

    geocodeTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            {
              headers: {
                Accept: "application/json",
                "Accept-Language": "en",
                "User-Agent": "MechanikoApp/1.0 dispatch-location",
              },
            },
          );
          if (!response.ok) {
            throw new Error(`Nominatim request failed with ${response.status}`);
          }

          const result = (await response.json()) as NominatimResult;
          if (requestId !== geocodeRequestRef.current) return;
          const formattedAddress = formatNominatimAddress(result);
          if (!formattedAddress) {
            throw new Error("Nominatim returned no display name");
          }

          setAddress(formattedAddress);
        } catch {
          if (requestId === geocodeRequestRef.current) {
            setAddress(
              `Address unavailable (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
            );
          }
        }
      })();
    }, 700);
  };

  const handleMapMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        address?: string;
        latitude?: number;
        longitude?: number;
      };
      if (
        data.type === "LOCATION_SELECTED" &&
        typeof data.latitude === "number" &&
        typeof data.longitude === "number"
      ) {
        if (
          typeof data.latitude === "number" &&
          typeof data.longitude === "number"
        ) {
          setCoordinates({
            latitude: data.latitude,
            longitude: data.longitude,
          });
          const locationScript = `window.setLocation(${data.latitude}, ${data.longitude}); true;`;
          mapRef.current?.injectJavaScript(locationScript);
          expandedMapRef.current?.injectJavaScript(locationScript);
          reverseGeocode(data.latitude, data.longitude);
        }
      }
    } catch {
      // Ignore malformed map messages.
    }
  };

  const syncMapView = (map: WebView | null) => {
    map?.injectJavaScript(
      `window.setRadius(${radius}); window.setLocation(${coordinates.latitude}, ${coordinates.longitude}); true;`,
    );
  };

  const saveAndContinue = async () => {
    setSaving(true);
    await SecureStore.setItemAsync(
      "pending_dispatch_location",
      JSON.stringify({ role, ...coordinates, address, radius, zones, standby }),
    );
    setSaving(false);
    setShowAlmostDone(true);
  };

  const mapAddress =
    address.length > 25 ? `${address.slice(0, 22).trimEnd()}...` : address;

  return (
    <>
      <Stack.Screen
        options={{
          animation: back === "1" ? "slide_from_left" : "slide_from_right",
        }}
      />
      <LinearGradient
        colors={["#F5F7FA", "#F5F7FA"]}
        style={styles.screen}
      >
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => {
                if (showAlmostDone) {
                  setShowAlmostDone(false);
                } else {
                  router.back();
                }
              }}
              hitSlop={12}
              accessibilityLabel="Go back"
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={25} color="#000000" />
            </Pressable>
          </View>

          <Modal
            visible={isMapExpanded}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={() => setIsMapExpanded(false)}
          >
            <View style={styles.expandedMapScreen}>
              <WebView
                ref={expandedMapRef}
                source={{ html: MAP_HTML }}
                style={styles.expandedMap}
                javaScriptEnabled
                onMessage={handleMapMessage}
                onLoadEnd={() => syncMapView(expandedMapRef.current)}
              />
              <Pressable
                style={styles.closeMapButton}
                onPress={() => setIsMapExpanded(false)}
                accessibilityLabel="Close full screen map"
              >
                <Ionicons name="close" size={24} color="#283247" />
              </Pressable>
              <View style={styles.expandedMapHint}>
                <Ionicons name="location-outline" size={17} color="#24439A" />
                <Text style={styles.expandedMapHintText}>
                  Tap anywhere on the map to set your dispatch pin
                </Text>
              </View>
            </View>
          </Modal>
          <View style={styles.sheet}>
            {showAlmostDone ? (
              <View style={styles.almostDone}>
                <Animated.Text
                  style={[styles.almostDoneTitle, almostDoneTitleAnimatedStyle]}
                >
                  You&apos;re almost done!
                </Animated.Text>
                <Animated.Text
                  style={[styles.almostDoneText, almostDoneTextAnimatedStyle]}
                >
                  You can now proceed to the next step.
                </Animated.Text>
                <View style={styles.almostDoneActions}>
                  <Pressable
                    style={styles.almostDoneBack}
                    onPress={() => setShowAlmostDone(false)}
                  >
                    <Text style={styles.almostDoneBackText}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={styles.almostDoneProceed}
                    onPress={() =>
                      router.push({
                        pathname: "/(auth)/quick-account-setup",
                        params: {
                          role: role ?? "mechanic",
                          completed: "3",
                        },
                      })
                    }
                  >
                    <Text style={styles.almostDoneProceedText}>Proceed</Text>
                    <Text style={styles.almostDoneArrow}>→</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior="padding"
                keyboardVerticalOffset={0}
              >
                <ScrollView
                  ref={scrollRef}
                  contentContainerStyle={styles.content}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  alwaysBounceVertical={false}
                  overScrollMode="never"
                  keyboardShouldPersistTaps="handled"
                >
              <Text style={styles.title}>
                Set your primary{"\n"}dispatch location
              </Text>
              <Text style={styles.subtitle}>
                Choose the base location and travel radius{"\n"}where you can
                accept services.
              </Text>

              <View style={styles.mapCard}>
                <WebView
                  ref={mapRef}
                  source={{ html: MAP_HTML }}
                  style={styles.map}
                  javaScriptEnabled
                  onMessage={handleMapMessage}
                  onLoadEnd={() => syncMapView(mapRef.current)}
                />
                <Pressable
                  style={styles.expandMapButton}
                  onPress={() => setIsMapExpanded(true)}
                  accessibilityLabel="Open map in full screen"
                >
                  <Ionicons name="expand-outline" size={20} color="#283247" />
                </Pressable>
                <View style={[styles.mapBadge, styles.mapBadgeTop]}>
                  <View style={styles.orangeDot} />
                  <Text style={styles.mapBadgeText}>Base: {mapAddress}</Text>
                </View>
                <View style={[styles.mapBadge, styles.mapBadgeSecond]}>
                  <View style={styles.blueDot} />
                  <Text style={styles.mapBadgeText}>
                    Coverage: {radius} km radius
                  </Text>
                </View>
                <View style={styles.activeZoneBadge}>
                  <Text style={styles.activeZoneText}>
                    ◎ {radius} km Active Zone
                  </Text>
                </View>
              </View>

              <View style={[styles.card, styles.baseWorkshopCard]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    BASE WORKSHOP / DISPATCH{"\n"}LOCATION
                  </Text>
                  <Text style={styles.verified}>Verified Pin</Text>
                </View>
                <View style={styles.locationBox}>
                  <View style={styles.locationIcon}>
                    <Ionicons name="briefcase" size={24} color="#FFFFFF" />
                  </View>
                  <Text style={styles.locationText}>{address}</Text>
                  <Pressable
                    style={styles.changePin}
                    onPress={() =>
                      scrollRef.current?.scrollTo({ y: 0, animated: true })
                    }
                  >
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color="#30343D"
                    />
                    <Text style={styles.changePinText}>Change Pin</Text>
                  </Pressable>
                </View>
              </View>

              <View style={[styles.card, styles.radiusCard]}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>
                      Travel & Dispatch Radius
                    </Text>
                    <Text style={styles.sectionDescription}>
                      Larger radius unlocks more{"\n"}dispatched jobs with
                      travel fee{"\n"}compensations.
                    </Text>
                  </View>
                  <Text style={styles.radiusPill}>{radius} km</Text>
                </View>
                <View style={styles.radiusGrid}>
                  {radiusOptions.map((option) => (
                    <Pressable
                      key={option.value}
                      onPress={() => updateRadius(option.value)}
                      style={[
                        styles.radiusOption,
                        radius === option.value && styles.radiusSelected,
                      ]}
                    >
                      <View style={styles.radiusOptionHeader}>
                        <Text style={styles.radiusTitle}>{option.title}</Text>
                        {option.value === 10 ? (
                          <Text style={styles.recommended}>RECOMMENDED</Text>
                        ) : null}
                      </View>
                      <Text style={styles.radiusSubtitle}>
                        {option.subtitle}
                      </Text>
                      <Text style={styles.radiusDetail}>{option.detail}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    Preferred Coverage Zones
                  </Text>
                  <Text style={styles.zoneCount}>{zones.length} selected</Text>
                </View>
                <View style={styles.zoneList}>
                  {zones.map((zone) => (
                    <View key={zone} style={styles.zoneChip}>
                      <Text style={styles.zoneText}>{zone}</Text>
                      <Pressable onPress={() => removeZone(zone)} hitSlop={8}>
                        <Ionicons name="trash" size={13} color="#EF4444" />
                      </Pressable>
                    </View>
                  ))}
                </View>
                <Pressable
                  style={styles.addZone}
                  onPress={() => {
                    setZoneError("");
                    setIsAddingZone(true);
                  }}
                >
                  <Text style={styles.addZoneText}>+ Add Zone</Text>
                </Pressable>
                {isAddingZone ? (
                  <View style={styles.addZoneForm}>
                    <TextInput
                      value={zoneDraft}
                      onChangeText={(value) => {
                        setZoneDraft(value);
                        if (zoneError) setZoneError("");
                      }}
                      placeholder="e.g. Makati Central"
                      placeholderTextColor="#8A93A5"
                      returnKeyType="done"
                      onSubmitEditing={addZone}
                      style={styles.zoneInput}
                    />
                    <View style={styles.zoneActions}>
                      <Pressable
                        style={styles.cancelZone}
                        onPress={() => {
                          setZoneDraft("");
                          setZoneError("");
                          setIsAddingZone(false);
                        }}
                      >
                        <Text style={styles.cancelZoneText}>Cancel</Text>
                      </Pressable>
                      <Pressable style={styles.confirmZone} onPress={addZone}>
                        <Text style={styles.confirmZoneText}>Add</Text>
                      </Pressable>
                    </View>
                    {zoneError ? (
                      <Text style={styles.zoneError}>{zoneError}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View style={styles.standbyCard}>
                <View style={styles.standbyIcon}>
                  <Ionicons name="star" size={23} color="#FFFFFF" />
                </View>
                <View style={styles.standbyCopy}>
                  <Text style={styles.standbyTitle}>
                    Roadside Emergency Standby
                  </Text>
                  <Text style={styles.standbyText}>
                    Accept roadside SOS emergencies on expressways and major
                    roads (R-10, EDSA, España).
                  </Text>
                </View>
                <Switch
                  value={standby}
                  onValueChange={setStandby}
                  trackColor={{ false: "#D1D5DB", true: "#F59E0B" }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <Pressable
                onPress={() => void saveAndContinue()}
                disabled={saving}
                style={[styles.saveButton, saving && styles.disabled]}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? "Saving..." : "Save Service Area & Continue"}
                </Text>
                <Text style={styles.saveArrow}>→</Text>
              </Pressable>
                <Text style={styles.footerText}>
                  You can adjust your service radius and dispatch availability
                  {"\n"}anytime in your Mechanic Settings.
                </Text>
                </ScrollView>
              </KeyboardAvoidingView>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  topBar: { height: 70 },
  backButton: { position: "absolute", top: 24, left: 18, zIndex: 2 },
  sheet: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  keyboardAvoidingView: { flex: 1 },
  almostDone: {
    flex: 1,
    minHeight: 430,
    justifyContent: "center",
    alignItems: "center",
  },
  almostDoneTitle: {
    width: 289,
    color: "#1E3A8A",
    fontSize: 24,
    lineHeight: 33,
    fontWeight: "800",
    textAlign: "center",
  },
  almostDoneText: {
    color: "#2C2F35",
    width: 291,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
    textAlign: "center",
  },
  almostDoneActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 44,
  },
  almostDoneBack: {
    minHeight: 36,
    minWidth: 86,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E5F0",
    alignItems: "center",
    justifyContent: "center",
  },
  almostDoneBackText: { color: "#4B5568", fontSize: 12, fontWeight: "700" },
  almostDoneProceed: {
    width: 145,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: "#24439A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#D97706",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  almostDoneProceedText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "600",
  },
  almostDoneArrow: { color: "#FFFFFF", fontSize: 16, marginLeft: 6 },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 36 },
  title: {
    color: "#30343D",
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "800",
    marginTop: 4,
  },
  subtitle: {
    color: "#444851",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    marginBottom: 16,
  },
  mapCard: {
    width: 340,
    height: 208,
    alignSelf: "center",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#DCECF4",
    elevation: 4,
    marginBottom: 16,
  },
  map: { flex: 1 },
  expandMapButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  expandedMapScreen: { flex: 1, backgroundColor: "#DCECF4" },
  expandedMap: { flex: 1 },
  closeMapButton: {
    position: "absolute",
    top: 56,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  expandedMapHint: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 28,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    elevation: 4,
  },
  expandedMapHintText: {
    flex: 1,
    color: "#283247",
    fontSize: 14,
    fontWeight: "700",
  },
  mapBadge: {
    position: "absolute",
    left: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
  },
  mapBadgeTop: { top: 16 },
  mapBadgeSecond: { top: 59 },
  orangeDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#F59E0B",
    marginRight: 7,
  },
  blueDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#24439A",
    marginRight: 7,
  },
  mapBadgeText: {
    flexShrink: 1,
    color: "#283247",
    fontSize: 13,
    fontWeight: "700",
  },
  activeZoneBadge: {
    position: "absolute",
    right: 14,
    bottom: 15,
    backgroundColor: "#E5EAFE",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  activeZoneText: { color: "#24439A", fontSize: 13, fontWeight: "800" },
  card: {
    width: 342,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E4E8F0",
  },
  baseWorkshopCard: { height: 155, padding: 16 },
  radiusCard: { height: 320, padding: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sectionTitle: {
    color: "#30343D",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  sectionDescription: {
    color: "#4C515B",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 5,
  },
  verified: {
    color: "#24439A",
    backgroundColor: "#EFF5FF",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: "800",
  },
  locationBox: {
    backgroundColor: "#F1F3FF",
    borderRadius: 14,
    padding: 10,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  locationIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
  },
  locationText: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: "#283247",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  changePin: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "#30343D",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  changePinText: { color: "#30343D", fontSize: 12, fontWeight: "800" },
  radiusPill: {
    color: "#24439A",
    backgroundColor: "#EFF5FF",
    borderWidth: 1,
    borderColor: "#A8C8FF",
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 9,
    fontWeight: "800",
  },
  radiusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  radiusOption: {
    width: "49%",
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDE2EE",
    backgroundColor: "#FAF9FF",
    padding: 11,
  },
  radiusSelected: {
    borderWidth: 2,
    borderColor: "#24439A",
    backgroundColor: "#F7FAFF",
  },
  radiusOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  radiusTitle: {
    color: "#2C2F35",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  recommended: {
    color: "#FFFFFF",
    backgroundColor: "#24439A",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 5,
    marginRight: 6,
    marginLeft: 4,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  radiusSubtitle: {
    color: "#2C2F35",
    fontSize: 11,
    lineHeight: 20,
  },
  radiusDetail: {
    color: "#2C2F35",
    fontSize: 11,
    lineHeight: 20,
    fontWeight: "500",
    marginTop: 0,
  },
  zoneCount: { color: "#667085", fontSize: 13 },
  zoneList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 18,
  },
  zoneChip: {
    borderWidth: 1,
    borderColor: "#A8C8FF",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#F7FAFF",
  },
  zoneText: { color: "#24439A", fontWeight: "800", fontSize: 13 },
  addZone: {
    alignSelf: "flex-start",
    marginTop: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#A8B5CE",
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  addZoneText: { color: "#24439A", fontSize: 13, fontWeight: "800" },
  addZoneForm: { marginTop: 10 },
  zoneInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#A8B5CE",
    borderRadius: 12,
    paddingHorizontal: 12,
    color: "#283247",
    fontSize: 14,
    backgroundColor: "#FFFFFF",
  },
  zoneActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  cancelZone: {
    borderWidth: 1,
    borderColor: "#A8B5CE",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelZoneText: { color: "#4C515B", fontSize: 13, fontWeight: "700" },
  confirmZone: {
    backgroundColor: "#24439A",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  confirmZoneText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  zoneError: { color: "#C2410C", fontSize: 12, marginTop: 6 },
  standbyCard: {
    backgroundColor: "#FFF9E9",
    borderWidth: 1,
    borderColor: "#FFD978",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 24,
  },
  standbyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#E88900",
    alignItems: "center",
    justifyContent: "center",
  },
  standbyCopy: { flex: 1 },
  standbyTitle: { color: "#30343D", fontSize: 16, fontWeight: "800" },
  standbyText: { color: "#69707C", fontSize: 13, lineHeight: 19, marginTop: 5 },
  saveButton: {
    minHeight: 58,
    backgroundColor: "#24439A",
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 4,
  },
  saveButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  saveArrow: { color: "#FFFFFF", fontSize: 25 },
  disabled: { opacity: 0.6 },
  footerText: {
    color: "#4C515B",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 20,
  },
});
