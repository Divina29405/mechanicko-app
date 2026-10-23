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
            <Ionicons name="arrow-back" size={26} color="#000000" />
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
                size={22}
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
              Click to proceed to continue.
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
  backButton: {
    alignSelf: "flex-start",
    marginTop: 40,
  },
  mapImage: {
    alignSelf: "center",
    width: 310,
    height: 176,
    borderRadius: 12,
    marginTop: 38,
  },
  copy: {
    marginTop: 18,
    paddingHorizontal: 28,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: "sans-serif",
    width: 214,
    height: 36,
    fontSize: 21,
    fontWeight: "700",
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  body: {
    color: "#111111",
    fontFamily: "sans-serif",
    width: 271,
    height: 96,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 24,
    letterSpacing: 0,
    marginTop: 45,
  },
  bottomContent: {
    marginTop: "auto",
    alignItems: "center",
  },
  description: {
    color: "#111111",
    fontFamily: "sans-serif",
    fontSize: 15,
    fontWeight: "600",
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
