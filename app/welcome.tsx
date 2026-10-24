import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { normalizeText } from "@/lib/typography";

export default function WelcomeScreen() {
  const { back } = useLocalSearchParams<{ back?: string }>();
  const isBackNavigation = back === "1";
  const topProgress = useSharedValue(0);
  const brandProgress = useSharedValue(0);
  const headingProgress = useSharedValue(0);
  const wordmarkProgress = useSharedValue(0);
  const descriptionProgress = useSharedValue(0);

  useEffect(() => {
    topProgress.value = withTiming(1, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
    brandProgress.value = withDelay(
      60,
      withTiming(1, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      }),
    );
    headingProgress.value = withDelay(
      100,
      withTiming(1, {
        duration: 450,
        easing: Easing.out(Easing.cubic),
      }),
    );
    wordmarkProgress.value = withDelay(
      180,
      withTiming(1, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      }),
    );
    descriptionProgress.value = withDelay(
      650,
      withTiming(1, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [
    brandProgress,
    descriptionProgress,
    headingProgress,
    topProgress,
    wordmarkProgress,
  ]);

  const topAnimatedStyle = useAnimatedStyle(() => ({
    opacity: topProgress.value,
    transform: [{ translateY: -8 * (1 - topProgress.value) }],
  }));
  const brandAnimatedStyle = useAnimatedStyle(() => ({
    opacity: brandProgress.value,
    transform: [
      { translateY: 22 * (1 - brandProgress.value) },
      { scale: 0.96 + 0.04 * brandProgress.value },
    ],
  }));
  const headingAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headingProgress.value,
    transform: [{ translateY: 12 * (1 - headingProgress.value) }],
  }));
  const wordmarkAnimatedStyle = useAnimatedStyle(() => ({
    opacity: wordmarkProgress.value,
    transform: [
      { translateY: 14 * (1 - wordmarkProgress.value) },
      { scale: 0.97 + 0.03 * wordmarkProgress.value },
    ],
  }));
  const descriptionAnimatedStyle = useAnimatedStyle(() => ({
    opacity: descriptionProgress.value,
    transform: [{ translateY: 12 * (1 - descriptionProgress.value) }],
  }));

  return (
    <>
      <Stack.Screen
        options={{
          animation: isBackNavigation ? "slide_from_left" : "slide_from_right",
          gestureEnabled: false,
          contentStyle: { backgroundColor: "#F8FAFC" },
        }}
      />
      <LinearGradient
        colors={["#F8FAFC", "#F1F5F9"]}
        style={styles.screen}
      >
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Animated.View style={[styles.topBar, topAnimatedStyle]}>
              <View style={styles.progress}>
                {Array.from({ length: 6 }, (_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.progressItem,
                      index === 0 && styles.progressItemActive,
                    ]}
                  />
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip onboarding"
                hitSlop={12}
                onPress={() => router.replace("/setup-complete")}
              >
                <Text style={styles.skip}>Skip</Text>
              </Pressable>
            </Animated.View>

            <Animated.View style={[styles.brand, brandAnimatedStyle]}>
              <Animated.Text style={[styles.heading, headingAnimatedStyle]}>
                WELCOME TO
              </Animated.Text>
              <Animated.Image
                source={require("../assets/images/mechanikotext.png")}
                resizeMode="contain"
                style={[styles.wordmark, wordmarkAnimatedStyle]}
              />
            </Animated.View>

            <View style={styles.bottomContent}>
              <Animated.Text style={[styles.description, descriptionAnimatedStyle]}>
                Come on! Let’s set up your account today.
              </Animated.Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Proceed to account setup"
                onPress={() => router.push("/help")}
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.buttonText}>Proceed</Text>
                <Text style={styles.arrow}>→</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </>
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
    paddingHorizontal: 22,
    paddingTop: 25,
    paddingBottom: 48,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  progress: {
    width: 260,
    height: 8,
    flexDirection: "row",
    gap: 8,
  },
  progressItem: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
  },
  progressItemActive: {
    backgroundColor: "#24439A",
  },
  skip: {
    color: "#1E3A8A",
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(15),
  },
  brand: {
    alignItems: "center",
    marginTop: 110,
  },
  heading: {
    color: "#1E3A8A",
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(30),
    letterSpacing: 0.5,
    textAlign: "center",
  },
  wordmark: {
    width: 220,
    height: 36,
    marginTop: 16,
    tintColor: "#1E3A8A", 
  },
  bottomContent: {
    marginTop: "auto",
    alignItems: "center",
  },
  description: {
    color: "#0F172A",
    fontFamily: "PlusJakartaSans",
    fontSize: normalizeText(15),
    lineHeight: normalizeText(24),
    letterSpacing: 0.1,
    textAlign: "center",
    marginBottom: 24,
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
});