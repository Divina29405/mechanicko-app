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

export default function SetupCompleteScreen() {
  const { back } = useLocalSearchParams<{ back?: string }>();
  const isBackNavigation = back === "1";
  const centerProgress = useSharedValue(0);
  const iconProgress = useSharedValue(0);
  const titleProgress = useSharedValue(0);
  const subtitleProgress = useSharedValue(0);

  useEffect(() => {
    centerProgress.value = withTiming(1, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
    iconProgress.value = withDelay(
      220,
      withTiming(1, {
        duration: 950,
        easing: Easing.out(Easing.back(1.2)),
      }),
    );
    titleProgress.value = withDelay(
      500,
      withTiming(1, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      }),
    );
    subtitleProgress.value = withDelay(
      700,
      withTiming(1, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [
    centerProgress,
    iconProgress,
    subtitleProgress,
    titleProgress,
  ]);

  const centerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: centerProgress.value,
    transform: [{ translateY: 18 * (1 - centerProgress.value) }],
  }));
  const iconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: iconProgress.value,
    transform: [
      { translateY: 16 * (1 - iconProgress.value) },
      { scale: 0.86 + 0.14 * iconProgress.value },
    ],
  }));
  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleProgress.value,
    transform: [{ translateY: 12 * (1 - titleProgress.value) }],
  }));
  const subtitleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: subtitleProgress.value,
    transform: [{ translateY: 10 * (1 - subtitleProgress.value) }],
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
                    style={[styles.progressItem, styles.progressItemActive]}
                  />
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip onboarding"
                hitSlop={12}
                onPress={() => router.replace("/(auth)/login")}
              >
                <Text style={styles.skip}>Skip</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={() =>
                router.replace({
                  pathname: "/choose-service",
                  params: { back: "1" },
                })
              }
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={28} color="#0F172A" />
            </Pressable>

            <Animated.View
              style={[styles.centerContent, centerAnimatedStyle]}
            >
              <Animated.Image
                source={require("../assets/images/setupcomplete.png")}
                resizeMode="contain"
                style={[styles.setupImage, iconAnimatedStyle]}
              />
              <Animated.Text style={[styles.title, titleAnimatedStyle]}>
                You&apos;re All Set!
              </Animated.Text>
              <Animated.Text style={[styles.subtitle, subtitleAnimatedStyle]}>
                You can now continue creating your account.
              </Animated.Text>
            </Animated.View>

            <View style={styles.bottomContent}>
              <Text style={styles.description}>
                Click proceed to continue.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Proceed to sign up"
                onPress={() => router.push("/(auth)/signup")}
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
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    alignSelf: "flex-start",
    marginTop: 38,
  },
  centerContent: {
    alignItems: "center",
    marginTop: 54,
  },
  setupImage: {
    width: 170,
    height: 110,
  },
  title: {
    color: "#1E3A8A",
    fontFamily: "sans-serif",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
    marginTop: 32,
  },
  subtitle: {
    color: "#0F172A",
    fontFamily: "sans-serif",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    letterSpacing: 0.1,
    textAlign: "center",
    marginTop: 12,
  },
  bottomContent: {
    marginTop: "auto",
    alignItems: "center",
  },
  description: {
    color: "#334155",
    fontFamily: "sans-serif",
    fontSize: 15,
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
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  arrow: {
    color: "#FFFFFF",
    fontSize: 24,
    marginLeft: 10,
    marginTop: -2,
  },
});