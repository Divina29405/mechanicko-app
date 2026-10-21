import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { MechanicProvider, useMechanic } from "@/contexts/MechanicContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

function MechanicTabs() {
  const { unreadMessages } = useMechanic();
  const { colors } = useAppTheme(); 

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "fade",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
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
            backgroundColor: '#EF4444',
            color: '#FFFFFF',
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
      <Tabs.Screen name="MotoristMap" options={{ href: null }} />
      <Tabs.Screen name="motorist-profile" options={{ href: null }} />
      <Tabs.Screen name="motorist-activity" options={{ href: null }} />
      <Tabs.Screen name="my-vehicles" options={{ href: null }} />
      <Tabs.Screen name="payment-methods" options={{ href: null }} />
      <Tabs.Screen name="emergency-checklist" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
    </Tabs>
  );
}

function CustomerTabs() {
  const { unreadMessages } = useMechanic();
  const { colors } = useAppTheme();
  const segments = useSegments();
  const isEmergencyChecklist = String(segments[segments.length - 1]) === 'emergency-checklist';

  return (
    <Tabs
      initialRouteName="MotoristMap"
      screenOptions={{
        headerShown: false,
        animation: "none",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          display: isEmergencyChecklist ? 'none' : 'flex',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginBottom: 6,
        },
      }}
    >
      <Tabs.Screen
        name="MotoristMap"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="motorist-activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pulse" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="help-center"
        options={{
          title: "Help Center",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="help-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#EF4444",
            color: "#FFFFFF",
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="motorist-profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
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
      <Tabs.Screen name="my-vehicles" options={{ href: null }} />
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
  const [fetchingRole, setFetchingRole] = useState(true);

  useEffect(() => {
    let active = true;
    setRole(null);
    setFetchingRole(true);

    async function fetchRole() {
      if (!session?.user?.id) {
        if (active) {
          setRole(null);
          setFetchingRole(false);
        }
        return;
      }

      if (!isSupabaseConfigured) {
        if (active) setRole("customer");
        if (active) setFetchingRole(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
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
      setFetchingRole(false);
    }

    void fetchRole();

    return () => {
      active = false;
    };
  }, [session]);

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
      {role === 'mechanic' ? (
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