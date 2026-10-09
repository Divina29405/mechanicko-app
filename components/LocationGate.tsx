import * as Location from "expo-location";
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

import { useAuth } from "@/contexts/AuthContext";
import { colors, radii, spacing } from "@/lib/theme";

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
  const [locationStatus, setLocationStatus] = useState<
    "checking" | "granted" | "blocked"
  >("checking");
  const [locationMessage, setLocationMessage] = useState(
    "Checking your device location...",
  );

  useEffect(() => {
    if (loading) {
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
  }, [loading]);

  if (loading) {
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
    <View style={styles.locationGate}>
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
    </View>
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
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  locationCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  warningIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  warningIconText: {
    color: colors.amber,
    fontSize: 30,
    fontWeight: "800",
  },
  locationTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  locationText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.amber,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.amber,
    fontSize: 15,
    fontWeight: "700",
  },
});
