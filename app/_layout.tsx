import { useFonts } from "expo-font";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { Stack } from "expo-router";
import * as Network from "expo-network";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { AppState, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { LocationGate } from "@/components/LocationGate";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider, useAppTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

function NetworkGate({ children }: { children: ReactNode }) {
  const networkState = Network.useNetworkState();
  const { colors } = useAppTheme();
  const [refreshedNetworkState, setRefreshedNetworkState] = useState<
    typeof networkState | null
  >(null);

  useEffect(() => {
    const refreshNetworkState = async () => {
      const nextState = await Network.getNetworkStateAsync();
      setRefreshedNetworkState(nextState);
    };
    const appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        void refreshNetworkState();
      }
    });
    const networkSubscription = Network.addNetworkStateListener((nextState) => {
      setRefreshedNetworkState(nextState);
    });

    return () => {
      appStateSubscription.remove();
      networkSubscription.remove();
    };
  }, []);

  const currentNetworkState = refreshedNetworkState ?? networkState;
  const isChecking = currentNetworkState.isConnected === undefined;
  const isOnline =
    currentNetworkState.isConnected === true &&
    currentNetworkState.isInternetReachable !== false;

  if (isChecking) {
    return <>{children}</>;
  }

  if (!isOnline) {
    return (
      <View style={[networkStyles.screen, { backgroundColor: colors.bg }]}>
        <View style={[networkStyles.iconCircle, { backgroundColor: 'rgba(255, 107, 0, 0.12)' }]}>
          <Ionicons name="cloud-offline-outline" size={42} color={colors.primary} />
        </View>
        <Text style={[networkStyles.title, { color: colors.text }]}>No internet connection</Text>
        <Text style={[networkStyles.message, { color: colors.textMuted }]}>
          Please turn on Wi-Fi or mobile data to use Mechaniko.
        </Text>
        <TouchableOpacity
          style={[networkStyles.retryButton, { backgroundColor: colors.primary }]}
          onPress={async () => {
            const nextState = await Network.getNetworkStateAsync();
            setRefreshedNetworkState(nextState);
          }}
        >
          <Text style={networkStyles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

function GlobalMotoristCancellationNotice() {
  const { session } = useAuth();
  const { colors } = useAppTheme();
  const [noticeRole, setNoticeRole] = useState<"motorist" | "mechanic" | null>(
    null,
  );

  useEffect(() => {
    if (!session?.user.id) return;

    const motoristChannel = supabase
      .channel(`global-motorist-cancellation-${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_requests",
          filter: `motorist_id=eq.${session.user.id}`,
        },
        (payload) => {
          const status = String(payload.new.status ?? "").toLowerCase();
          if (
            ["cancelled", "canceled"].includes(status) &&
            payload.new.cancelled_by === "mechanic"
          ) {
            setNoticeRole("motorist");
          }
        },
      )
      .subscribe();

    const mechanicChannel = supabase
      .channel(`global-mechanic-cancellation-${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_requests",
          filter: `mechanic_id=eq.${session.user.id}`,
        },
        (payload) => {
          const status = String(payload.new.status ?? "").toLowerCase();
          if (
            ["cancelled", "canceled"].includes(status) &&
            payload.new.cancelled_by === "motorist"
          ) {
            setNoticeRole("mechanic");
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(motoristChannel);
      void supabase.removeChannel(mechanicChannel);
    };
  }, [session?.user.id]);

  return (
    <Modal
      visible={noticeRole !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setNoticeRole(null)}
    >
      <View style={globalNoticeStyles.overlay}>
          <View
          style={[
            globalNoticeStyles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={globalNoticeStyles.icon}>
            <Ionicons name="close" size={32} color="#FFFFFF" />
          </View>
          <Text style={[globalNoticeStyles.title, { color: colors.text }]}>
            Booking cancelled
          </Text>
          <Text
            style={[globalNoticeStyles.message, { color: colors.textMuted }]}
          >
          {noticeRole === "mechanic"
            ? "The motorist cancelled this booking."
            : "Your mechanic cancelled this booking."}
          </Text>
          <Pressable
          style={globalNoticeStyles.button}
          onPress={() => setNoticeRole(null)}
          >
            <Text style={globalNoticeStyles.buttonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Separate component so we can use useAppTheme hook inside it
function RootLayoutNav() {
  const { colors, isDarkMode } = useAppTheme();

  return (
    <>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      <LocationGate>
        <NetworkGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: "none",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="(admin)" />
            <Stack.Screen name="admin" />
          </Stack>
          <GlobalMotoristCancellationNotice />
        </NetworkGate>
      </LocationGate>
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    PlusJakartaSans: PlusJakartaSans_400Regular,
    PlusJakartaSansBold: PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </ThemeProvider>
  );
}

const networkStyles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  iconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 16,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 300,
  },
  retryButton: {
    borderRadius: 10,
    minWidth: 130,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: "800",
  },
});

const globalNoticeStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    padding: 26,
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D64545",
    marginBottom: 14,
  },
  title: { fontSize: 21, fontWeight: "800", marginBottom: 8 },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 22,
  },
  button: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#172B66",
    borderRadius: 12,
    paddingVertical: 14,
  },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
