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
      colors={["#F5F7FA", "#F5F7FA"]}
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

          <Animated.View style={[styles.message, contentAnimatedStyle]}>
            <Text style={styles.title}>YOUR HELP IS ON THE WAY.</Text>
            <Text style={styles.description}>
              Find nearby mechanics, book automotive services, and get roadside
              assistance when you need it. With Mechanic Ko, help is just a tap
              away!
            </Text>
          </Animated.View>

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
    paddingHorizontal: 18,
    paddingTop: 130,
    paddingBottom: 48,
  },
  brand: {
    alignItems: "center",
  },
  logo: {
    width: 82,
    height: 83,
  },
  wordmark: {
    width: 207,
    height: 33,
    marginTop: 22,
  },
  message: {
    width: "100%",
    alignItems: "center",
    marginTop: 72,
  },
  title: {
    color: "#20439B",
    fontFamily: "sans-serif",
    width: 276,
    height: 20,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 20,
    letterSpacing: 0.14,
    textAlign: "center",
    textShadowColor: "#20439B",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0.55,
  },
  description: {
    color: "#272B34",
    fontFamily: "sans-serif",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
    letterSpacing: 0.14,
    maxWidth: 330,
    marginTop: 170,
    textAlign: "center",
  },
  button: {
    alignSelf: "stretch",
    minHeight: 52,
    borderRadius: 11,
    backgroundColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 44,
    shadowColor: "#132D73",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: "#FFFFFF",
    fontFamily: "sans-serif",
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 20,
  },
  arrow: {
    color: "#FFFFFF",
    fontSize: 23,
    lineHeight: 23,
    marginLeft: 9,
    marginTop: -2,
  },
  boot: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    alignItems: "center",
    justifyContent: "center",
  },
  bootBrand: {
    alignItems: "center",
    justifyContent: "center",
  },
  bootLogo: {
    width: 112,
    height: 112,
  },
  bootWordmark: {
    marginTop: 18,
    color: "#24439A",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  bootProgressTrack: {
    width: 180,
    height: 5,
    marginTop: 28,
    overflow: "hidden",
    borderRadius: 3,
    backgroundColor: "#DCE3EF",
  },
  bootProgressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#24439A",
  },
  bootPercent: {
    marginTop: 10,
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },
});
