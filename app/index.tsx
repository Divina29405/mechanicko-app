import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useAuth } from "@/contexts/AuthContext";
import { normalizeText } from "@/lib/typography";

const DEVICE_ONBOARDING_KEY = "mechaniko-device-onboarding-complete";

async function readDeviceOnboardingState() {
  if (Platform.OS === "web") {
    return typeof localStorage !== "undefined" &&
      localStorage.getItem(DEVICE_ONBOARDING_KEY) === "true";
  }
  return (await SecureStore.getItemAsync(DEVICE_ONBOARDING_KEY)) === "true";
}

async function markDeviceOnboardingComplete() {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DEVICE_ONBOARDING_KEY, "true");
    }
    return;
  }
  await SecureStore.setItemAsync(DEVICE_ONBOARDING_KEY, "true");
}

export default function Index() {
  const { session, loading } = useAuth();
  const [returningDevice, setReturningDevice] = useState<boolean | null>(null);
  const contentProgress = useSharedValue(0);
  const bootProgress = useSharedValue(0);
  const [bootPercent, setBootPercent] = useState(0);

  useEffect(() => {
    let active = true;
    void readDeviceOnboardingState().then((hasCompletedOnboarding) => {
      if (active) setReturningDevice(hasCompletedOnboarding);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    bootProgress.value = withTiming(1, {
      duration: 1600,
      easing: Easing.out(Easing.cubic),
    });
    const interval = setInterval(() => {
      setBootPercent((current) => {
        if (current >= 100) {
          clearInterval(interval);
          return 100;
        }
        return Math.min(current + 2, 100);
      });
    }, 32);

    return () => clearInterval(interval);
  }, [bootProgress]);

  useEffect(() => {
    contentProgress.value = withTiming(1, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [contentProgress]);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentProgress.value,
    transform: [{ translateY: 18 * (1 - contentProgress.value) }],
  }));
  const bootAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bootProgress.value,
    transform: [
      { scale: 0.86 + bootProgress.value * 0.14 },
      { translateY: 12 * (1 - bootProgress.value) },
    ],
  }));

  if (loading || returningDevice === null) {
    return (
      <View style={styles.boot}>
        <Animated.View style={[styles.bootBrand, bootAnimatedStyle]}>
          <Image
            source={require("../assets/images/logo.png")}
            resizeMode="contain"
            style={styles.bootLogo}
          />
          <Text style={styles.bootWordmark}>MECHANIC KO</Text>
          <View style={styles.bootProgressTrack}>
            <View
              style={[
                styles.bootProgressFill,
                { width: `${bootPercent}%` },
              ]}
            />
          </View>
          <Text style={styles.bootPercent}>{bootPercent}%</Text>
        </Animated.View>
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(app)" />;
  }

  if (returningDevice) {
    return <Redirect href="/login" />;
  }
  
  const handleGetStarted = async () => {
    await markDeviceOnboardingComplete();
    router.push("/welcome");
  };

  return (
    <LinearGradient
      colors={["#F8FAFC", "#F1F5F9"]}
      style={styles.screen}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Animated.View style={[styles.brand, contentAnimatedStyle]}>
            <Image
              source={require("../assets/images/logo.png")}
              resizeMode="contain"
              style={styles.logo}
            />
            <Image
              source={require("../assets/images/mechanikotext.png")}
              resizeMode="contain"
              style={styles.wordmark}
            />
          </Animated.View>

          <View style={styles.spacer} />

          <Animated.View style={[styles.message, contentAnimatedStyle]}>
            <Text style={styles.title}>YOUR HELP IS ON THE WAY.</Text>
            <Text style={styles.description}>
              Find nearby mechanics, book automotive services, and get roadside
              assistance when you need it. With Mechanic Ko, help is just a tap
              away!
            </Text>
          </Animated.View>

          <View style={styles.bottomSpacer} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Let's Get Started"
            onPress={() => void handleGetStarted()}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>Let’s Get Started</Text>
            <Text style={styles.arrow}>→</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 100,
    paddingBottom: 48,
  },
  brand: {
    alignItems: "center",
  },
  logo: {
    width: 90,
    height: 90,
  },
  wordmark: {
    width: 220,
    height: 36,
    marginTop: 24,
    tintColor: "#1E3A8A", 
  },
  spacer: {
    flex: 1,
    minHeight: 40,
  },
  message: {
    width: "100%",
    alignItems: "center",
  },
  title: {
    color: "#1E3A8A",
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(21),
    letterSpacing: 0.5,
    textAlign: "center",
  },
  description: {
    color: "#0F172A",
    fontFamily: "PlusJakartaSans",
    fontSize: normalizeText(15),
    lineHeight: normalizeText(24),
    letterSpacing: 0.2,
    maxWidth: 320,
    marginTop: 20,
    textAlign: "center",
  },
  bottomSpacer: {
    flex: 1,
    minHeight: 40,
  },
  button: {
    alignSelf: "stretch",
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#132D73",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: "#FFFFFF",
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(17),
    letterSpacing: 0.3,
  },
  arrow: {
    color: "#FFFFFF",
    fontSize: normalizeText(24),
    marginLeft: 10,
    marginTop: -2,
  },
  boot: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  bootBrand: {
    alignItems: "center",
    justifyContent: "center",
  },
  bootLogo: {
    width: 120,
    height: 120,
  },
  bootWordmark: {
    marginTop: 24,
    color: "#1E3A8A",
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(24),
    letterSpacing: 2,
  },
  bootProgressTrack: {
    width: 180,
    height: 6,
    marginTop: 32,
    overflow: "hidden",
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
  },
  bootProgressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#24439A",
  },
  bootPercent: {
    marginTop: 12,
    color: "#475569",
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(13),
  },
});