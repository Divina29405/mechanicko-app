import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Redirect, Tabs, Stack } from "expo-router"; // <-- Swapped Stack for Slot
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { MechanicProvider, useMechanic } from "@/contexts/MechanicContext";
import { colors, radii, spacing } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

function MechanicTabs() {
  const { unreadMessages } = useMechanic();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginBottom: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cash" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Chat",
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.sos,
            color: colors.white,
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
    </Tabs>
  );
}

async function checkLocationAccess() {
  const permission = await Location.getForegroundPermissionsAsync();
  const provider = await Location.getProviderStatusAsync();

  return {
    permissionGranted: permission.status === "granted",
    serviceEnabled: provider.locationServicesEnabled,
  };
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  
  const [role, setRole] = useState<string | null>(null);
  const [fetchingRole, setFetchingRole] = useState(true);

  const [locationStatus, setLocationStatus] = useState<
    "checking" | "granted" | "blocked"
  >("checking");
  const [locationMessage, setLocationMessage] = useState(
    "Checking your device location...",
  );

  useEffect(() => {
    async function fetchRole() {
      if (!session?.user?.id) {
        setFetchingRole(false);
        return;
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
        
      if (!error && data) {
        setRole(data.role);
      } else {
        setRole('motorist'); 
      }
      setFetchingRole(false);
    }
    
    fetchRole();
  }, [session]);

  useEffect(() => {
    let active = true;

    async function ensureLocation() {
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
      }
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void ensureLocation();
      }
    });

    void ensureLocation();

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  if (loading || fetchingRole) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (locationStatus !== "granted") {
    return (
      <View style={styles.locationGate}>
        <View style={styles.locationCard}>
          <View style={styles.warningIcon}>
            <Ionicons name="location" size={28} color={colors.amber} />
          </View>
          <Text style={styles.locationTitle}>Location required</Text>
          <Text style={styles.locationText}>{locationMessage}</Text>

          <Pressable
            style={styles.primaryButton}
            onPress={async () => {
              await Linking.openSettings();
            }}
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

  // --- DUAL ROLE ROUTING ---
  
  if (role === 'mechanic') {
    return (
      <MechanicProvider>
        <MechanicTabs />
      </MechanicProvider>
    );
  }
  // Motorist View
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="MotoristMap" />
      <Stack.Screen name="motorist-profile" />
      <Stack.Screen name="motorist-activity" />
      <Stack.Screen name="emergency-checklist" options={{ presentation: 'modal' }} />
      <Stack.Screen name="schedule" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  boot: {
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