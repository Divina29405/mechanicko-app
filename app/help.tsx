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
          contentStyle: { backgroundColor: "#F5F7FA" },
        }}
      />
      <LinearGradient
          colors={["#F5F7FA", "#F5F7FA"]}
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
            <Ionicons name="arrow-back" size={26} color="#000000" />
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
              Click to proceed to continue.
            </Animated.Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Proceed to sign up"
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
    paddingHorizontal: 18,
    paddingTop: 25,
    paddingBottom: 76,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 18,
  },
  progress: {
    width: 260,
    height: 10,
    flexDirection: "row",
    gap: 10,
  },
  progressItem: {
    flex: 1,
    height: 10,
    borderRadius: 4,
    backgroundColor: "#E8E8E8",
  },
  progressItemActive: {
    backgroundColor: "#24439A",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  skip: {
    color: "#24439A",
    fontFamily: "sans-serif",
    fontSize: 16,
    fontWeight: "400",
  },
  backButton: {
    alignSelf: "flex-start",
    marginTop: 38,
    marginLeft: 0,
  },
  heading: {
    width: 298,
    height: 90,
    marginTop: 34,
    marginLeft: 20,
  },
  headingLine: {
    color: "#FFFFFF",
    fontFamily: "sans-serif",
    height: 30,
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 30,
    letterSpacing: 0.14,
  },
  bottomContent: {
    marginTop: "auto",
    alignItems: "center",
  },
  description: {
    color: "#272B34",
    fontFamily: "sans-serif",
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 22,
    letterSpacing: 0.14,
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    alignSelf: "stretch",
    minHeight: 52,
    borderRadius: 11,
    backgroundColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
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
});
