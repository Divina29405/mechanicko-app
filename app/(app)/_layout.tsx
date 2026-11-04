import { Redirect, Tabs, useSegments } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/layouts/Tabs.js";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { MechanicProvider } from "@/contexts/MechanicContext";
import { MechanicText as Text } from "@/components/mechanic/MechanicText";
import { MechanicThemeProvider, useAppTheme } from "@/contexts/ThemeContext";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { normalizeText } from "@/lib/typography";

function MechanicTabsContent() {
  const { colors, isDarkMode } = useAppTheme();
  const mechanicTabIcon = (lightIcon: number, darkIcon: number) => (
    <Image
      source={isDarkMode ? darkIcon : lightIcon}
      resizeMode="contain"
      style={styles.mechanicTabIcon}
    />
  );

  return (
    <Tabs
      tabBar={(props) => <MechanicTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: "none",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          width: "100%",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: () =>
            mechanicTabIcon(
              require("../../assets/images/mechanichome.png"),
              require("../../assets/images/mechanichomedmode.png"),
            ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",
          tabBarIcon: () =>
            mechanicTabIcon(
              require("../../assets/images/mechanicjobs.png"),
              require("../../assets/images/mechanicjobsdmode.png"),
            ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: () =>
            mechanicTabIcon(
              require("../../assets/images/mechanicearnings.png"),
              require("../../assets/images/mechanicearningsdmode.png"),
            ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Chat",
          tabBarIcon: () =>
            mechanicTabIcon(
              require("../../assets/images/mechanicchat.png"),
              require("../../assets/images/mechanicchatdmode.png"),
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: () =>
            mechanicTabIcon(
              require("../../assets/images/mechanicprofile.png"),
              require("../../assets/images/mechanicprofiledmode.png"),
            ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ tabBarButton: () => null }}
      />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="help-center" options={{ href: null }} />
      <Tabs.Screen name="saved-locations" options={{ href: null }} />
      <Tabs.Screen name="MotoristMap" options={{ href: null }} />
      <Tabs.Screen name="motorist-profile" options={{ href: null }} />
      <Tabs.Screen name="motorist-settings" options={{ href: null }} />
      <Tabs.Screen name="motorist-activity" options={{ href: null }} />
      <Tabs.Screen
        name="payment-methods"
        options={{ tabBarButton: () => null, animation: "none" }}
      />
      <Tabs.Screen name="emergency-checklist" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
    </Tabs>
  );
}

function MechanicTabs() {
  return (
    <MechanicThemeProvider>
      <MechanicStatusBar />
      <MechanicTabsContent />
    </MechanicThemeProvider>
  );
}

function MechanicStatusBar() {
  const { isDarkMode } = useAppTheme();
  return <StatusBar style={isDarkMode ? "light" : "dark"} />;
}

const MECHANIC_TAB_NAMES = ["index", "jobs", "earnings", "messages", "profile"];

function MechanicTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
}: BottomTabBarProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const visibleRoutes = MECHANIC_TAB_NAMES.flatMap((name) => {
    const route = state.routes.find((item) => item.name === name);
    return route ? [route] : [];
  });

  return (
    <View
      style={[
        styles.mechanicTabBar,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={styles.mechanicTabItems}>
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = state.routes[state.index]?.key === route.key;
          const color = focused ? colors.primary : colors.textMuted;
          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : options.title ?? route.name;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              testID={options.tabBarButtonTestID}
              onPress={() => {
                const event = emitter.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigateToTab(route.key);
                }
              }}
              onLongPress={() => {
                emitter.emit({ type: "tabLongPress", target: route.key });
              }}
              style={styles.mechanicTabItem}
            >
              {options.tabBarIcon?.({
                focused,
                color,
                size: 24,
              })}
              <Text
                numberOfLines={1}
                style={[styles.mechanicTabLabel, { color }]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function CustomerTabs() {
  const { colors, isDarkMode } = useAppTheme();
  const segments = useSegments();
  const currentRoute = String(segments[segments.length - 1]);
  const isEmergencyChecklist =
    currentRoute === "emergency-checklist";
  const isFullScreenRoute = ["motorist-settings", "payment-methods"].includes(
    currentRoute,
  );
  const motoristTabIcon = (source: number, size: number) => (
    <Image
      source={source}
      resizeMode="contain"
      style={[
        { width: size * 0.72, height: size * 0.72 },
        isDarkMode ? { tintColor: colors.text } : null,
      ]}
    />
  );

  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        animation: "none",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 15,
          height: 112,
          paddingTop: 6,
          paddingBottom: 8,
          display: isEmergencyChecklist || isFullScreenRoute ? "none" : "flex",
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
          width: "20%",
          height: 60,
          paddingTop: 2,
          paddingBottom: 0,
          justifyContent: "flex-start",
          alignSelf: "stretch",
          alignItems: "center",
        },
      }}
    >
      <Tabs.Screen
        name="MotoristMap"
        options={{
          title: "Home",
          tabBarIcon: ({ size }) =>
            motoristTabIcon(
              require("../../assets/images/motorist-home-transparent.png"),
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
              require("../../assets/images/motorist-booking-transparent.png"),
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
              require("../../assets/images/motorist-message-transparent.png"),
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
      <Tabs.Screen
        name="motorist-settings"
        options={{ tabBarButton: () => null, animation: "none", lazy: false }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="jobs" options={{ href: null }} />
      <Tabs.Screen name="earnings" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen
        name="notifications"
        options={{ tabBarButton: () => null }}
      />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="saved-locations" options={{ href: null }} />
      <Tabs.Screen
        name="payment-methods"
        options={{ tabBarButton: () => null, animation: "none" }}
      />
      <Tabs.Screen name="emergency-checklist" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
    </Tabs>
  );
}

export default function AppLayout() {
  const { session, loading, signedOutRole } = useAuth();
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
    return (
      <Redirect
        href={
          signedOutRole === "mechanic"
            ? "/(auth)/admin-login"
            : "/(auth)/login"
        }
      />
    );
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
    <MechanicProvider isMechanic={role === "mechanic"}>
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
  mechanicTabBar: {
    width: "100%",
    minHeight: 58,
    borderTopWidth: 1,
  },
  mechanicTabItems: {
    width: "88%",
    maxWidth: 350,
    minHeight: 57,
    alignSelf: "center",
    flexDirection: "row",
  },
  mechanicTabItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },
  mechanicTabIcon: {
    width: 28,
    height: 28,
  },
  mechanicTabLabel: {
    fontSize: normalizeText(12),
    fontWeight: "700",
    marginTop: 2,
  },
});