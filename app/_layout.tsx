import { useFonts } from "expo-font";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { Stack, useRouter } from "expo-router";
import * as Network from "expo-network";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { AppState, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { LocationGate } from "@/components/LocationGate";
import { GlobalMotoristRatingPrompt } from "@/components/GlobalMotoristRatingPrompt";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ThemeProvider, useAppTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { normalizeText } from "@/lib/typography";

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
  const router = useRouter();
  const [notice, setNotice] = useState<
    | { type: "cancelled"; role: "motorist" | "mechanic" }
    | { type: "revoked"; reason: string | null }
    | null
  >(null);

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
          if (status === "revoked" || status === "declined") {
            setNotice({
              type: "revoked",
              reason: String(payload.new.decline_reason ?? "").trim() || null,
            });
          } else if (
            ["cancelled", "canceled"].includes(status) &&
            payload.new.cancelled_by === "mechanic"
          ) {
            setNotice({ type: "cancelled", role: "motorist" });
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
            setNotice({ type: "cancelled", role: "mechanic" });
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
      visible={notice !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setNotice(null)}
    >
      <View style={globalNoticeStyles.overlay}>
          <View
          style={[
            globalNoticeStyles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={globalNoticeStyles.icon}>
            <Ionicons name="close" size={36} color="#FFFFFF" />
          </View>
          <Text style={[globalNoticeStyles.title, { color: colors.text }]}>
            {notice?.type === "revoked" ? "Booking declined" : "Booking cancelled"}
          </Text>
          <Text
            style={[globalNoticeStyles.message, { color: colors.textMuted }]}
          >
            {notice?.type === "revoked"
              ? `Your mechanic declined this booking.${notice.reason ? ` Reason: ${notice.reason}` : ""} It has been moved to Revoked.`
              : notice?.role === "mechanic"
                ? "The motorist cancelled this booking."
                : "Your mechanic cancelled this booking."}
          </Text>
          <Pressable
            style={globalNoticeStyles.button}
            onPress={() => {
              if (notice?.type === "revoked") {
                router.navigate({
                  pathname: "/help-center",
                  params: { filter: "revoked" },
                });
              }
              setNotice(null);
            }}
          >
            <Text style={globalNoticeStyles.buttonText}>
              {notice?.type === "revoked" ? "View Revoked" : "Done"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function GlobalMotoristBookingAcceptedNotice() {
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(timeout);
  }, [visible]);

  useEffect(() => {
    const motoristId = session?.user.id;
    if (!motoristId) return;

    let active = true;
    let initialStatusesLoaded = false;
    const waitingBookingIds = new Set<string>();
    const acceptedBeforeInitialLoad = new Set<string>();
    const showNoticeForWaitingBooking = (bookingId: string) => {
      if (waitingBookingIds.has(bookingId)) {
        setVisible(true);
        waitingBookingIds.delete(bookingId);
      } else if (!initialStatusesLoaded) {
        acceptedBeforeInitialLoad.add(bookingId);
      }
    };

    const channel = supabase
      .channel(`global-motorist-booking-accepted-${motoristId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
          filter: `motorist_id=eq.${motoristId}`,
        },
        (payload) => {
          const booking = payload.new as {
            id?: string;
            status?: string;
          };
          const bookingId = String(booking.id ?? "");
          if (!bookingId) return;

          const nextStatus = String(booking.status ?? "").toLowerCase();
          const previousStatus = String(
            (payload.old as { status?: string }).status ?? "",
          ).toLowerCase();
          const wasWaiting =
            waitingBookingIds.has(bookingId) ||
            ["pending", "scheduled"].includes(previousStatus);

          if (["pending", "scheduled"].includes(nextStatus)) {
            waitingBookingIds.add(bookingId);
          } else if (nextStatus === "accepted") {
            if (wasWaiting) {
              waitingBookingIds.delete(bookingId);
              setVisible(true);
            } else {
              showNoticeForWaitingBooking(bookingId);
            }
          } else {
            waitingBookingIds.delete(bookingId);
          }
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        void supabase
          .from("service_requests")
          .select("id")
          .eq("motorist_id", motoristId)
          .in("status", ["pending", "scheduled"])
          .then(({ data, error }) => {
            if (!active) return;
            if (error) {
              console.warn(
                "Could not load waiting bookings for acceptance notices:",
                error.message,
              );
            } else {
              data?.forEach((booking) => waitingBookingIds.add(booking.id));
            }
            initialStatusesLoaded = true;
            acceptedBeforeInitialLoad.forEach((bookingId) => {
              waitingBookingIds.delete(bookingId);
              setVisible(true);
            });
            acceptedBeforeInitialLoad.clear();
          });
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => setVisible(false)}
    >
      <View style={globalNoticeStyles.acceptedToastOverlay}>
        <View
          style={[
            globalNoticeStyles.acceptedCard,
            { backgroundColor: "#FFFFFF", borderColor: "#B7E4C7" },
          ]}
        >
          <View style={globalNoticeStyles.acceptedSuccessIcon}>
            <Ionicons name="checkmark" size={32} color="#FFFFFF" />
          </View>
          <View style={globalNoticeStyles.acceptedCopy}>
            <Text
              style={[
                globalNoticeStyles.acceptedTitle,
                { color: "#172B66" },
              ]}
            >
              Booking accepted
            </Text>
            <Text
              style={[
                globalNoticeStyles.acceptedMessage,
                { color: "#667085" },
              ]}
            >
              Your mechanic got the booking.
            </Text>
          </View>
          <Pressable
            style={globalNoticeStyles.acceptedButton}
            onPress={() => setVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss booking accepted notice"
          >
            <Text style={globalNoticeStyles.acceptedButtonText}>Done</Text>
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
          <GlobalMotoristBookingAcceptedNotice />
          <GlobalMotoristRatingPrompt />
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
        <NotificationProvider>
          <RootLayoutNav />
        </NotificationProvider>
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
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  title: {
    fontSize: normalizeText(23),
    fontWeight: "800",
    textAlign: "center",
    marginTop: 18,
  },
  message: {
    fontSize: normalizeText(16),
    lineHeight: normalizeText(24),
    textAlign: "center",
    marginTop: 10,
    maxWidth: 320,
  },
  retryButton: {
    borderRadius: 12,
    minWidth: 140,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 26,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: normalizeText(16),
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
    padding: 28,
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  acceptedCard: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    padding: 26,
    borderWidth: 1,
    borderRadius: 22,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    borderColor: "#B7E4C7",
  },
  acceptedToastOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D64545",
    marginBottom: 16,
  },
  title: { fontSize: normalizeText(23), fontWeight: "800", marginBottom: 10 },
  acceptedTitle: {
    fontSize: normalizeText(22),
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: normalizeText(16),
    lineHeight: normalizeText(24),
    textAlign: "center",
    marginBottom: 24,
  },
  acceptedMessage: {
    fontSize: normalizeText(16),
    lineHeight: normalizeText(24),
    textAlign: "center",
    marginBottom: 24,
  },
  acceptedSuccessIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#18A957",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  acceptedCopy: {
    alignItems: "center",
    width: "100%",
  },
  acceptedButton: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#172B66",
    borderRadius: 12,
    paddingVertical: 14,
  },
  acceptedButtonText: {
    color: "#FFFFFF",
    fontSize: normalizeText(16),
    fontWeight: "800",
  },
  button: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#172B66",
    borderRadius: 12,
    paddingVertical: 15,
  },
  buttonText: { color: "#FFFFFF", fontSize: normalizeText(16), fontWeight: "800" },
});