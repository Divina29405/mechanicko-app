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

type OnboardingInfoScreenProps = {
  activeSteps: number;
  title: string;
  titleWidth: number;
  titleFontSize?: number;
  body: string;
  bodyWidth: number;
  bodyFontSize?: number;
  bodyLineHeight?: number;
  largeText?: boolean;
  nextRoute: "/choose-service" | "/setup-complete" | "/(auth)/signup";
};

export function OnboardingInfoScreen({
  activeSteps,
  title,
  titleWidth,
  titleFontSize = 18,
  body,
  bodyWidth,
  bodyFontSize = 13,
  bodyLineHeight = 22.75,
  largeText = false,
  nextRoute,
}: OnboardingInfoScreenProps) {
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
    transform: [{ translateY: 16 * (1 - titleProgress.value) }],
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
          contentStyle: { backgroundColor: "#373327" },
        }}
      />
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
          <View style={styles.topBar}>
            <View style={styles.progress}>
              {Array.from({ length: 6 }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.progressItem,
                    index < activeSteps && styles.progressItemActive,
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
              <Text style={[styles.skip, largeText && styles.largeSkip]}>
                Skip
              </Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            onPress={() =>
              router.replace({
                pathname:
                  activeSteps === 4
                    ? "/map-onboarding"
                    : activeSteps === 5
                      ? "/help-when-needed"
                      : "/choose-service",
                params: { back: "1" },
              })
            }
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
          </Pressable>

          <View style={styles.copy}>
            <Animated.Text
              style={[
                styles.title,
                titleAnimatedStyle,
                { width: titleWidth, fontSize: titleFontSize },
              ]}
            >
              {title}
            </Animated.Text>
            <Animated.Text
              style={[
                styles.body,
                bodyAnimatedStyle,
                {
                  width: bodyWidth,
                  fontSize: bodyFontSize,
                  lineHeight: bodyLineHeight,
                  height: bodyLineHeight * 4,
                },
              ]}
            >
              {body}
            </Animated.Text>
          </View>

          <View style={styles.bottomContent}>
            <Animated.Text
              style={[styles.description, largeText && styles.largeDescription]}
            >
              Click to proceed to continue.
            </Animated.Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Proceed to the next step"
              onPress={() => router.push(nextRoute)}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text
                style={[styles.buttonText, largeText && styles.largeButtonText]}
              >
                Proceed
              </Text>
              <Text style={[styles.arrow, largeText && styles.largeArrow]}>
                →
              </Text>
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
    color: "#FFFFFF",
    fontFamily: "sans-serif",
    fontSize: 16,
    fontWeight: "400",
  },
  largeSkip: {
    fontSize: 18,
  },
  backButton: {
    alignSelf: "flex-start",
    marginTop: 38,
  },
  copy: {
    marginTop: 34,
    marginLeft: 16,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: "sans-serif",
    height: 32,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  body: {
    color: "#111111",
    fontFamily: "sans-serif",
    height: 91,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 22.75,
    letterSpacing: 0,
    marginTop: 54,
  },
  bottomContent: {
    marginTop: "auto",
    alignItems: "center",
  },
  description: {
    color: "#111111",
    fontFamily: "sans-serif",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
    letterSpacing: 0.14,
    textAlign: "center",
    marginBottom: 20,
  },
  largeDescription: {
    fontSize: 15,
    lineHeight: 22,
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
  largeButtonText: {
    fontSize: 18,
    lineHeight: 20,
  },
  arrow: {
    color: "#FFFFFF",
    fontSize: 23,
    lineHeight: 23,
    marginLeft: 9,
    marginTop: -2,
  },
  largeArrow: {
    fontSize: 25,
    lineHeight: 25,
  },
});
