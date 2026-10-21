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
import { ThemeProvider, useAppTheme } from "@/contexts/ThemeContext";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

function NetworkGate({ children }: { children: ReactNode }) {
  const networkState = Network.useNetworkState();
  const { colors } = useAppTheme();
  const isChecking = networkState.isConnected === undefined;
  const isOnline =
    networkState.isConnected === true &&
    networkState.isInternetReachable !== false;

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
          onPress={() => void Network.getNetworkStateAsync()}
        >
          <Text style={networkStyles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
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
    </>
  );
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
