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
          contentStyle: { backgroundColor: "#FFFFFF" },
        }}
      />
      <View style={styles.screen}>
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
              source={require("../assets/images/mechanicko.png")}
              resizeMode="contain"
              style={[styles.wordmark, wordmarkAnimatedStyle]}
            />
          </Animated.View>

          <View style={styles.bottomContent}>
            <Animated.Text style={[styles.description, descriptionAnimatedStyle]}>
              Come on! Let’s set up your account today!
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
      </View>
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
  brand: {
    alignItems: "center",
    marginTop: 92,
  },
  heading: {
    color: "#000000",
    fontFamily: "sans-serif",
    width: 202,
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 36,
    letterSpacing: 0.14,
    textAlign: "center",
  },
  wordmark: {
    width: 207,
    height: 33,
    marginTop: 22,
  },
  bottomContent: {
    marginTop: "auto",
    alignItems: "center",
  },
  description: {
    color: "#111111",
    fontFamily: "sans-serif",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
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
    color: "#000000",
    fontFamily: "sans-serif",
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 20,
  },
  arrow: {
    color: "#000000",
    fontSize: 23,
    lineHeight: 23,
    marginLeft: 9,
    marginTop: -2,
  },
});
