import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as Network from "expo-network";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { LocationGate } from "@/components/LocationGate";
import { AuthProvider } from "@/contexts/AuthContext";
import { colors } from "@/lib/theme";
import { ThemeProvider } from "@/contexts/ThemeContext";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

function NetworkGate({ children }: { children: ReactNode }) {
  const networkState = Network.useNetworkState();
  const isChecking = networkState.isConnected === undefined;
  const isOnline =
    networkState.isConnected === true &&
    networkState.isInternetReachable !== false;

  if (isChecking) {
    return (
      <View style={networkStyles.screen}>
        <Ionicons name="wifi-outline" size={42} color={colors.amber} />
        <Text style={networkStyles.title}>Checking connection...</Text>
      </View>
    );
  }

  if (!isOnline) {
    return (
      <View style={networkStyles.screen}>
        <View style={networkStyles.iconCircle}>
          <Ionicons name="cloud-offline-outline" size={42} color={colors.amber} />
        </View>
        <Text style={networkStyles.title}>No internet connection</Text>
        <Text style={networkStyles.message}>
          Please turn on Wi-Fi or mobile data to use Mechaniko.
        </Text>
        <TouchableOpacity
          style={networkStyles.retryButton}
          onPress={() => void Network.getNetworkStateAsync()}
        >
          <Text style={networkStyles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
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
        <StatusBar style="auto" />
        <LocationGate>
          <NetworkGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: "slide_from_right",
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
              <Stack.Screen name="(admin)" />
              <Stack.Screen name="admin" />
            </Stack>
          </NetworkGate>
        </LocationGate>
      </AuthProvider>
    </ThemeProvider>
  );
}

const networkStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  iconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "rgba(240, 162, 2, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 16,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 300,
  },
  retryButton: {
    backgroundColor: colors.amber,
    borderRadius: 10,
    minWidth: 130,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  retryText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
});
