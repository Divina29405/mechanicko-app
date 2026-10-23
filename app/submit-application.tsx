import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

export default function SubmitApplicationScreen() {
  const { role } = useLocalSearchParams<{ role?: string }>();
  const [submitted, setSubmitted] = useState(false);
  const titleProgress = useSharedValue(0);
  const descriptionProgress = useSharedValue(0);

  useEffect(() => {
    titleProgress.value = 0;
    descriptionProgress.value = 0;
    titleProgress.value = withTiming(1, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
    descriptionProgress.value = withDelay(
      260,
      withTiming(1, {
        duration: 850,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [descriptionProgress, submitted, titleProgress]);

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleProgress.value,
    transform: [{ translateY: 28 * (1 - titleProgress.value) }],
  }));
  const descriptionAnimatedStyle = useAnimatedStyle(() => ({
    opacity: descriptionProgress.value,
    transform: [{ translateY: 22 * (1 - descriptionProgress.value) }],
  }));

  const reviewDetails = () => {
    router.back();
  };

  const submitApplication = () => {
    setSubmitted(true);
  };

  return (
    <>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <StatusBar style="dark" />
      <LinearGradient
        colors={["#F5F7FA", "#F5F7FA"]}
        style={styles.screen}
      >
        <SafeAreaView style={styles.safeArea}>
          {!submitted ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={reviewDetails}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={25} color="#000000" />
            </Pressable>
          ) : null}
          <View style={styles.sheet}>
            {submitted ? (
              <View style={[styles.content, styles.successContent]}>
                <Animated.Text
                  style={[styles.successTitle, titleAnimatedStyle]}
                >
                  {role === "customer"
                    ? "CONGRATULATIONS!"
                    : "Application Submitted Successfully!"}
                </Animated.Text>
                <Animated.Text
                  style={[styles.successDescription, descriptionAnimatedStyle]}
                >
                  {role === "customer" ? (
                    "Your account has been successfully created."
                  ) : (
                    <>
                      Thank you for submitting your application. Your request
                      is currently under review. Please wait{" "}
                      <Animated.Text style={styles.businessDays}>
                        7 to 10 business days
                      </Animated.Text>{" "}
                      for the approval process. We will notify you once your
                      status has been updated.
                    </>
                  )}
                </Animated.Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Proceed to login"
                  onPress={() => router.replace("/(auth)/login")}
                  style={({ pressed }) => [
                    styles.backToLoginButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.backToLoginText}>
                    {role === "customer" ? "Proceed to Login" : "Back to Login"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.content}>
                <Animated.Text style={[styles.title, titleAnimatedStyle]}>
                  Submit Application?
                </Animated.Text>
                <Animated.Text
                  style={[styles.description, descriptionAnimatedStyle]}
                >
                  Please make sure all your personal details,{"\n"}
                  credentials, and uploaded documents are{"\n"}
                  accurate before submitting for verification.
                </Animated.Text>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Yes, submit application"
                    onPress={submitApplication}
                    style={({ pressed }) => [
                      styles.submitButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.submitButtonText}>
                      Yes, Submit Application
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Review details or go back"
                    onPress={reviewDetails}
                    style={({ pressed }) => [
                      styles.reviewButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.reviewButtonText}>
                      Review Details / Go Back
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  backButton: {
    position: "absolute",
    top: 42,
    left: 18,
    zIndex: 2,
  },
  sheet: {
    flex: 1,
    marginTop: 52,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DCE3EF",
    shadowColor: "#17213D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  content: { paddingHorizontal: 32, paddingTop: 198 },
  successContent: { paddingTop: 204 },
  title: {
    color: "#17213D",
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
  },
  description: {
    color: "#4B5568",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    marginTop: 8,
  },
  actions: { marginTop: 30, gap: 10 },
  submitButton: {
    minHeight: 49,
    borderRadius: 11,
    backgroundColor: "#0641B9",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B3FA8",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  reviewButton: {
    minHeight: 43,
    borderRadius: 11,
    backgroundColor: "#F0F2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewButtonText: {
    color: "#202943",
    fontSize: 14,
    fontWeight: "700",
  },
  successTitle: {
    color: "#16A34A",
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
  },
  successDescription: {
    color: "#4B5568",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    marginTop: 14,
  },
  businessDays: { fontWeight: "800", color: "#17213D" },
  backToLoginButton: {
    alignSelf: "center",
    minWidth: 150,
    minHeight: 43,
    borderRadius: 11,
    backgroundColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
    shadowColor: "#0B3FA8",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  backToLoginText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  buttonPressed: { opacity: 0.8 },
});
