import { Ionicons } from "@expo/vector-icons";
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

export default function HelpOnboardingScreen() {
  const { back } = useLocalSearchParams<{ back?: string }>();
  const isBackNavigation = back === "1";
  const headingLineOneProgress = useSharedValue(0);
  const headingLineTwoProgress = useSharedValue(0);
  const headingLineThreeProgress = useSharedValue(0);

  useEffect(() => {
    headingLineOneProgress.value = withTiming(1, {
      duration: 850,
      easing: Easing.out(Easing.cubic),
    });
    headingLineTwoProgress.value = withDelay(
      180,
      withTiming(1, {
        duration: 850,
        easing: Easing.out(Easing.cubic),
      }),
    );
    headingLineThreeProgress.value = withDelay(
      360,
      withTiming(1, {
        duration: 850,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [
    headingLineOneProgress,
    headingLineThreeProgress,
    headingLineTwoProgress,
  ]);

  const headingLineOneAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headingLineOneProgress.value,
    transform: [{ translateY: 18 * (1 - headingLineOneProgress.value) }],
  }));
  const headingLineTwoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headingLineTwoProgress.value,
    transform: [{ translateY: 18 * (1 - headingLineTwoProgress.value) }],
  }));
  const headingLineThreeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headingLineThreeProgress.value,
    transform: [{ translateY: 18 * (1 - headingLineThreeProgress.value) }],
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
            <View style={styles.topBar}>
              <View style={styles.progress}>
                {Array.from({ length: 6 }, (_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.progressItem,
                      index < 2 && styles.progressItemActive,
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
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={() =>
                router.replace({ pathname: "/welcome", params: { back: "1" } })
              }
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={28} color="#0F172A" />
            </Pressable>

            <View style={styles.heading}>
              <Animated.Text
                style={[styles.headingLine, headingLineOneAnimatedStyle]}
              >
                Here’s what
              </Animated.Text>
              <Animated.Text
                style={[styles.headingLine, headingLineTwoAnimatedStyle]}
              >
                Mechanic ko helps
              </Animated.Text>
              <Animated.Text
                style={[styles.headingLine, headingLineThreeAnimatedStyle]}
              >
                you with
              </Animated.Text>
            </View>

            <View style={styles.bottomContent}>
              <Animated.Text style={styles.description}>
                Click proceed to continue.
              </Animated.Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Proceed to map onboarding"
                onPress={() => router.push("/map-onboarding")}
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
    fontFamily: "sans-serif",
    fontSize: normalizeText(16),
    fontWeight: "600",
  },
  backButton: {
    alignSelf: "flex-start",
    marginTop: 38,
  },
  heading: {
    marginTop: 40,
    marginLeft: 12,
  },
  headingLine: {
    color: "#1E3A8A",
    fontFamily: "sans-serif",
    fontSize: normalizeText(36),
    fontWeight: "900",
    lineHeight: normalizeText(42),
    letterSpacing: -0.5,
  },
  bottomContent: {
    marginTop: "auto",
    alignItems: "center",
  },
  description: {
    color: "#334155",
    fontFamily: "sans-serif",
    fontSize: normalizeText(15),
    fontWeight: "600",
    letterSpacing: 0.1,
    textAlign: "center",
    marginBottom: 20,
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
    fontFamily: "sans-serif",
    fontSize: normalizeText(18),
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  arrow: {
    color: "#FFFFFF",
    fontSize: normalizeText(24),
    marginLeft: 10,
    marginTop: -2,
  },
});