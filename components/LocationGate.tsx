import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useSegments } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
    ActivityIndicator,
    AppState,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/lib/theme";

async function checkLocationAccess() {
  const permission = await Location.getForegroundPermissionsAsync();
  let serviceEnabled = false;

  if (Platform.OS === "web") {
    serviceEnabled =
      typeof navigator !== "undefined" && "geolocation" in navigator
        ? await new Promise<boolean>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              () => resolve(true),
              () => resolve(false),
              { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 },
            );
          })
        : false;
  } else {
    serviceEnabled = await Location.hasServicesEnabledAsync();
  }

  return {
    permissionGranted: permission.status === "granted",
    serviceEnabled,
  };
}

async function openLocationSettings() {
  if (Platform.OS === "android") {
    try {
      await Linking.sendIntent("android.settings.LOCATION_SOURCE_SETTINGS");
      return;
    } catch {}
  }

  await Linking.openSettings();
}

export function LocationGate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  const segments = useSegments();
  const locationNotRequired = segments.some(
    (segment) =>
      segment === "admin-login" || segment === "(admin)" || segment === "admin",
  );
  const [locationStatus, setLocationStatus] = useState<
    "checking" | "granted" | "blocked"
  >("checking");
  const [locationMessage, setLocationMessage] = useState(
    "Checking your device location...",
  );

  useEffect(() => {
    if (loading || locationNotRequired) {
      return;
    }

    let active = true;
    let checkInProgress = false;

    async function ensureLocation() {
      if (checkInProgress) return;
      checkInProgress = true;

      try {
        let access = await checkLocationAccess();

        if (!active) return;

        if (access.permissionGranted && access.serviceEnabled) {
          setLocationStatus("granted");
          return;
        }

        setLocationStatus("blocked");

        if (!access.permissionGranted) {
          setLocationMessage(
            "Location permission is required. Allow it to continue.",
          );
          await Location.requestForegroundPermissionsAsync();
          if (!active) return;

          access = await checkLocationAccess();
          if (access.permissionGranted && access.serviceEnabled) {
            setLocationStatus("granted");
            return;
          }
        }

        if (!access.serviceEnabled) {
          setLocationMessage(
            "Your device location is off. Turn it on before continuing.",
          );
        }
      } catch {
        if (!active) return;
        setLocationStatus("blocked");
        setLocationMessage(
          "Location is required. Turn on device location before continuing.",
        );
      } finally {
        checkInProgress = false;
      }
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void ensureLocation();
      }
    });

    void ensureLocation();
    const monitor = setInterval(() => {
      if (AppState.currentState === "active") {
        void ensureLocation();
      }
    }, 1000);

    return () => {
      active = false;
      subscription.remove();
      clearInterval(monitor);
    };
  }, [loading, locationNotRequired]);

  if (loading || locationNotRequired) {
    return <>{children}</>;
  }

  if (locationStatus === "granted") {
    return <>{children}</>;
  }

  if (locationStatus === "checking") {
    return (
      <View style={styles.checkingScreen}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={[
        "#373327",
        "#686150",
        "#9E9786",
        "#DCDCDB",
        "#F3F3F5",
        "#F8F8FA",
      ]}
      locations={[0, 0.2, 0.38, 0.56, 0.72, 1]}
      style={styles.locationGate}
    >
      <SafeAreaView style={styles.locationSafeArea}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/");
            }
          }}
          style={styles.locationBackButton}
        >
          <Ionicons name="arrow-back" size={25} color="#FFFFFF" />
        </Pressable>
        <View style={styles.locationCard}>
          <View style={styles.warningIcon}>
            <Text style={styles.warningIconText}>!</Text>
          </View>
          <Text style={styles.locationTitle}>Location required</Text>
          <Text style={styles.locationText}>{locationMessage}</Text>

          <Pressable
            style={styles.primaryButton}
            onPress={() => void openLocationSettings()}
          >
            <Text style={styles.primaryButtonText}>Open device settings</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={async () => {
              setLocationStatus("checking");
              setLocationMessage("Checking your device location...");

              try {
                const access = await checkLocationAccess();
                if (access.permissionGranted && access.serviceEnabled) {
                  setLocationStatus("granted");
                  return;
                }

                setLocationStatus("blocked");
                setLocationMessage(
                  access.serviceEnabled
                    ? "Location permission is required. Allow it to continue."
                    : "Your device location is still off. Turn it on before continuing.",
                );
              } catch {
                setLocationStatus("blocked");
                setLocationMessage(
                  "Location is required. Turn on device location before continuing.",
                );
              }
            }}
          >
            <Text style={styles.secondaryButtonText}>Check again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  checkingScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  locationGate: {
    flex: 1,
  },
  locationSafeArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  locationBackButton: {
    position: "absolute",
    top: 24,
    left: 20,
    zIndex: 2,
  },
  locationCard: {
    width: "100%",
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 680,
    marginHorizontal: -24,
    marginTop: 54,
    paddingHorizontal: 24,
    paddingTop: 34,
  },
  warningIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#B9C4E5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  warningIconText: {
    color: "#24439A",
    fontSize: 24,
    fontWeight: "800",
  },
  locationTitle: {
    color: "#2C2F35",
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  locationText: {
    color: "#434655",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 34,
  },
  primaryButton: {
    backgroundColor: "#24439A",
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  secondaryButtonText: {
    color: "#24439A",
    fontSize: 14,
    fontWeight: "700",
  },
});
