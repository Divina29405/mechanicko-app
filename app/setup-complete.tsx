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
            <Ionicons name="arrow-back" size={26} color="#000000" />
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
              Click to proceed to continue.
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
  },
  centerContent: {
    alignItems: "center",
    marginTop: 43,
  },
  setupImage: {
    width: 159,
    height: 99,
  },
  title: {
    color: "#20439B",
    fontFamily: "sans-serif",
    width: 159,
    height: 32,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 32,
    letterSpacing: -0.24,
    textAlign: "center",
    marginTop: 24,
  },
  subtitle: {
    color: "#272B34",
    fontFamily: "sans-serif",
    width: 308,
    height: 20,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
    letterSpacing: 0.14,
    textAlign: "center",
    marginTop: 8,
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
