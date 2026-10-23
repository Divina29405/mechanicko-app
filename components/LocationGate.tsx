import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";
import { useSegments } from "expo-router";
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
  try {
    if (Platform.OS === "android") {
      await Linking.sendIntent("android.settings.LOCATION_SOURCE_SETTINGS");
      return;
    }

    await Linking.openSettings();
  } catch (error) {
    console.warn(
      "Unable to open device location settings:",
      error instanceof Error ? error.message : error,
    );
  }
}

export function LocationGate({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  const segments = useSegments();
  const locationNotRequired = segments.some(
    (segment) =>
      segment === "(auth)" ||
      segment === "welcome" ||
      segment === "help" ||
      segment === "map-onboarding" ||
      segment === "help-when-needed" ||
      segment === "setup-complete" ||
      segment === "choose-service" ||
      segment === "quick-account-setup" ||
      segment === "add-primary-ride" ||
      segment === "dispatch-location" ||
      segment === "submit-application" ||
      segment === "admin-login" ||
      segment === "(admin)" ||
      segment === "admin",
  );
  const [locationStatus, setLocationStatus] = useState<
    "checking" | "granted" | "blocked"
  >("checking");
  const [locationMessage, setLocationMessage] = useState(
    "Checking your device location...",
  );

  useEffect(() => {
    if (loading || !session || locationNotRequired) {
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
  }, [loading, locationNotRequired, session]);

  if (loading || !session || locationNotRequired) {
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
        "#FFFFFF",
        "#FFFFFF",
      ]}
      locations={[0, 1]}
      style={styles.locationGate}
    >
      <SafeAreaView style={styles.locationSafeArea}>
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
    backgroundColor: "#FFFFFF",
  },
  locationSafeArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  locationCard: {
    width: "100%",
    backgroundColor: colors.bgElevated,
    borderRadius: 20,
    flex: 1,
    marginTop: 54,
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "#DCE3EF",
    shadowColor: "#17213D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
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
