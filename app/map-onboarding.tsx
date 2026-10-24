import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MapOnboardingScreen() {
  const { back } = useLocalSearchParams<{ back?: string }>();
  const isBackNavigation = back === "1";
  const titleProgress = useSharedValue(0);
  const bodyProgress = useSharedValue(0);

  useEffect(() => {
    titleProgress.value = withTiming(1, {
      duration: 850,
      easing: Easing.out(Easing.cubic),
    });
    bodyProgress.value = withDelay(
      300,
      withTiming(1, {
        duration: 900,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [bodyProgress, titleProgress]);

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleProgress.value,
    transform: [{ translateY: 14 * (1 - titleProgress.value) }],
  }));
  const bodyAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bodyProgress.value,
    transform: [{ translateY: 14 * (1 - bodyProgress.value) }],
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
                      index < 3 && styles.progressItemActive,
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
                router.replace({ pathname: "/help", params: { back: "1" } })
              }
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={28} color="#0F172A" />
            </Pressable>

            <Image
              source={require("../assets/images/onboardmap.png")}
              resizeMode="contain"
              style={styles.mapImage}
            />

            <View style={styles.copy}>
              <View style={styles.titleRow}>
                <Ionicons
                  name="navigate-circle-outline"
                  size={26}
                  color="#24439A"
                />
                <Animated.Text style={[styles.title, titleAnimatedStyle]}>
                  Find Mechanics Near You
                </Animated.Text>
              </View>
              <Animated.Text style={[styles.body, bodyAnimatedStyle]}>
                Locate nearby mechanics using your{"\n"}current location. Explore
                available{"\n"}service providers and find the right{"\n"}mechanic
                for your vehicle&apos;s needs.
              </Animated.Text>
            </View>

            <View style={styles.bottomContent}>
              <Animated.Text style={styles.description}>
                Click proceed to continue.
              </Animated.Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Proceed to sign up"
                onPress={() => router.push("/help-when-needed")}
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
  mapImage: {
    alignSelf: "center",
    width: 320,
    height: 186,
    borderRadius: 14,
    marginTop: 38,
  },
  copy: {
    marginTop: 24,
    paddingHorizontal: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  title: {
    color: "#0F172A",
    fontFamily: "sans-serif",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  body: {
    color: "#334155",
    fontFamily: "sans-serif",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 26,
    letterSpacing: 0.1,
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