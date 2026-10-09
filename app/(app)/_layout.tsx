import { Ionicons } from "@expo/vector-icons";
import { Redirect, Stack, Tabs, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { MechanicProvider, useMechanic } from "@/contexts/MechanicContext";
import { colors } from "@/lib/theme";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

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
      <Tabs.Screen name="MotoristMap" options={{ href: null }} />
      <Tabs.Screen name="motorist-profile" options={{ href: null }} />
      <Tabs.Screen name="motorist-activity" options={{ href: null }} />
      <Tabs.Screen name="emergency-checklist" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
    </Tabs>
  );
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();

  const [role, setRole] = useState<string | null>(null);
  const [fetchingRole, setFetchingRole] = useState(true);

  useEffect(() => {
    let active = true;
    // Reset the navigator while the new account's role is being resolved.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <View style={styles.boot}>
        <ActivityIndicator color={colors.amber} />
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
        <Stack
          key="customer-navigator"
          initialRouteName="MotoristMap"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="MotoristMap" />
          <Stack.Screen name="motorist-profile" />
          <Stack.Screen name="motorist-activity" />
          <Stack.Screen
            name="emergency-checklist"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen name="schedule" options={{ presentation: "modal" }} />
        </Stack>
      )}
    </MechanicProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});