import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { MechanicProvider } from "@/contexts/MechanicContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { normalizeText } from "@/lib/typography";

function MechanicTabs() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "none",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: normalizeText(12),
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
            <Ionicons
              name="home"
              size={size}
              color={typeof color === "string" ? color : colors.primary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="calendar"
              size={size}
              color={typeof color === "string" ? color : colors.primary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="cash"
              size={size}
              color={typeof color === "string" ? color : colors.primary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="chatbubbles"
              size={size}
              color={typeof color === "string" ? color : colors.primary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="person"
              size={size}
              color={typeof color === "string" ? color : colors.primary}
            />
          ),
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="help-center" options={{ href: null }} />
      <Tabs.Screen name="saved-locations" options={{ href: null }} />
      <Tabs.Screen name="MotoristMap" options={{ href: null }} />
      <Tabs.Screen name="motorist-profile" options={{ href: null }} />
      <Tabs.Screen name="motorist-activity" options={{ href: null }} />
      <Tabs.Screen name="payment-methods" options={{ href: null }} />
      <Tabs.Screen name="emergency-checklist" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
    </Tabs>
  );
}

function CustomerTabs() {
  const { colors } = useAppTheme();
  const segments = useSegments();
  const isEmergencyChecklist =
    String(segments[segments.length - 1]) === "emergency-checklist";
  const motoristTabIcon = (source: number, size: number) => (
    <Image
      source={source}
      resizeMode="contain"
      style={{ width: size * 0.72, height: size * 0.72 }}
    />
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "none",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#F5F4FA",
          borderTopWidth: 15,
          height: 112,
          paddingTop: 6,
          paddingBottom: 8,
          display: isEmergencyChecklist ? "none" : "flex",
          justifyContent: "space-between",
          paddingHorizontal: 12,
        },
        tabBarLabelStyle: {
          fontSize: normalizeText(12),
          fontWeight: "700",
          marginBottom: 2,
          transform: [{ translateY: -6 }],
        },
        tabBarButton: ({ ref: _ref, ...props }) => (
          <Pressable {...props} android_ripple={{ color: "transparent" }} />
        ),
        tabBarIconStyle: {
          transform: [{ translateY: -6 }],
        },
        tabBarItemStyle: {
          flex: 0,
          width: 72,
          height: 60,
          paddingTop: 2,
          paddingBottom: 0,
          justifyContent: "flex-start",
          alignSelf: "flex-start",
        },
      }}
    >
      <Tabs.Screen
        name="MotoristMap"
        options={{
          title: "Home",
          tabBarIcon: ({ size }) =>
            motoristTabIcon(
              require("../../assets/images/motorist-home.jpg"),
              size,
            ),
        }}
      />
      <Tabs.Screen
        name="motorist-activity"
        options={{
          title: "Bookings",
          tabBarIcon: ({ size }) =>
            motoristTabIcon(
              require("../../assets/images/motorist-booking.jpg"),
              size,
            ),
        }}
      />
      <Tabs.Screen
        name="help-center"
        options={{
          title: "Activity",
          tabBarIcon: ({ size }) =>
            motoristTabIcon(
              require("../../assets/images/motorist-activity.png"),
              size,
            ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ size }) =>
            motoristTabIcon(
              require("../../assets/images/motorist-message.jpg"),
              size,
            ),
        }}
      />
      <Tabs.Screen
        name="motorist-profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ size }) =>
            motoristTabIcon(
              require("../../assets/images/motorist-profile.png"),
              size,
            ),
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="jobs" options={{ href: null }} />
      <Tabs.Screen name="earnings" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="saved-locations" options={{ href: null }} />
      <Tabs.Screen name="payment-methods" options={{ href: null }} />
      <Tabs.Screen name="emergency-checklist" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
    </Tabs>
  );
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const { colors } = useAppTheme();

  const [role, setRole] = useState<string | null>(null);
  const [roleSessionId, setRoleSessionId] = useState<string | null>(
    "__unresolved__",
  );

  useEffect(() => {
    let active = true;

    async function fetchRole() {
      if (!session?.user?.id) {
        if (active) {
          setRole(null);
          setRoleSessionId(null);
        }
        return;
      }

      if (!isSupabaseConfigured) {
        if (active) setRole("customer");
        if (active) setRoleSessionId(session.user.id);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (!error && data?.role) {
        const profileRole = data.role.toLowerCase();
        setRole(
          profileRole === "admin" || profileRole === "mechanic"
            ? profileRole
            : "customer",
        );
      } else {
        setRole("customer");
      }
      setRoleSessionId(session.user.id);
    }

    void fetchRole();

    return () => {
      active = false;
    };
  }, [session]);

  const fetchingRole =
    roleSessionId !== (session?.user?.id ?? null);

  if (loading || fetchingRole) {
    return (
      <View style={[styles.boot, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (role === "admin") {
    return <Redirect href="/admin" />;
  }

  const isCustomer = role !== "mechanic";
  const currentRoute = segments[segments.length - 1];
  if (
    isCustomer &&
    (!currentRoute ||
      String(currentRoute) === "(app)" ||
      String(currentRoute) === "index")
  ) {
    return <Redirect href="/MotoristMap" />;
  }

  return (
    <MechanicProvider>
      {role === "mechanic" ? (
        <MechanicTabs key="mechanic-navigator" />
      ) : (
        <CustomerTabs key="customer-navigator" />
      )}
    </MechanicProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});