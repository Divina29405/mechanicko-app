import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";

export default function GoogleAuthCallbackScreen() {
  const callbackUrl = Linking.useLinkingURL();
  const router = useRouter();
  const { completeGoogleSignInFromUrl } = useAuth();
  const handledUrl = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callbackUrl?.includes("auth/callback") || handledUrl.current === callbackUrl) {
      return;
    }

    handledUrl.current = callbackUrl;
    let active = true;
    void completeGoogleSignInFromUrl(callbackUrl).then((result) => {
      if (!active) return;
      if (result.error) {
        setError(result.error);
        return;
      }
      router.replace({
        pathname: "/(app)/motorist-profile",
        params: { setupVehicle: "1" },
      });
    });

    return () => {
      active = false;
    };
  }, [callbackUrl, completeGoogleSignInFromUrl, router]);

  return (
    <View style={styles.container}>
      {error ? null : <ActivityIndicator size="large" color="#0037B0" />}
      <Text style={styles.title}>
        {error ? "Google sign-in couldn't finish" : "Finishing Google sign-in"}
      </Text>
      {error ? <Text style={styles.message}>{error}</Text> : null}
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/login")}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Back to login</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
  },
  title: {
    marginTop: 16,
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    marginTop: 12,
    color: "#475569",
    fontSize: 15,
    textAlign: "center",
  },
  button: {
    marginTop: 20,
    borderRadius: 10,
    backgroundColor: "#0037B0",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
