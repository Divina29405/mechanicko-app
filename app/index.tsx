import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/lib/theme";

export default function Index() {
  const { session, loading } = useAuth();
  const contentProgress = useSharedValue(0);

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

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(app)" />;
  }

  return (
    <LinearGradient
      colors={[
        "#373327",
        "#686150",
        "#9E9786",
        "#DCDCDB",
        "#F3F3F5",
        "#F8F8FA",
      ]}
      locations={[0, 0.2, 0.38, 0.56, 0.72, 1]}
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
            onPress={() => router.push("/welcome")}
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
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
