import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import { PrimaryRideSteps } from "@/components/PrimaryRideSteps";
import { useEffect } from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePrimaryRideForm } from "@/hooks/usePrimaryRideForm";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const gradientColors = [
  "#373327",
  "#686150",
  "#9E9786",
  "#DCDCDB",
  "#F3F3F5",
  "#F8F8FA",
] as const;

export default function AddPrimaryRideScreen() {
  const almostDoneTitleProgress = useSharedValue(0);
  const almostDoneTextProgress = useSharedValue(0);
  const {
    selectedVehicle, setSelectedVehicle, multipleVehicles, setMultipleVehicles, step,
    setStep, makeDropdownOpen, setMakeDropdownOpen, selectedMake, setSelectedMake,
    selectedFuel, setSelectedFuel, modelName, setModelName, vehicleYear, setVehicleYear,
    plateNumber, setPlateNumber, saving, showAlmostDone, setShowAlmostDone,
    animateUiChange, continueSetup,
  } = usePrimaryRideForm();

  useEffect(() => {
    if (!showAlmostDone) {
      almostDoneTitleProgress.value = 0;
      almostDoneTextProgress.value = 0;
      return;
    }

    almostDoneTitleProgress.value = withTiming(1, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
    almostDoneTextProgress.value = withDelay(
      260,
      withTiming(1, {
        duration: 850,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [
    almostDoneTextProgress,
    almostDoneTitleProgress,
    showAlmostDone,
  ]);

  const almostDoneTitleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: almostDoneTitleProgress.value,
    transform: [{ translateY: 28 * (1 - almostDoneTitleProgress.value) }],
  }));
  const almostDoneTextAnimatedStyle = useAnimatedStyle(() => ({
    opacity: almostDoneTextProgress.value,
    transform: [{ translateY: 22 * (1 - almostDoneTextProgress.value) }],
  }));
  return (
    <>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.2, 0.38, 0.56, 0.72, 1]}
        style={styles.screen}
      >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            onPress={() => {
              if (showAlmostDone) {
                animateUiChange();
                setShowAlmostDone(false);
              } else if (step === 2) {
                animateUiChange();
                setStep(1);
              } else {
                router.back();
              }
            }}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={25} color="#FFFFFF" />
          </Pressable>

          <View style={styles.card}>
            <View
              style={showAlmostDone ? styles.hiddenRideContent : undefined}
            >
            <Text style={styles.title}>Add your primary ride</Text>
            <Text style={styles.subtitle}>
              Select the vehicle you&apos;re using.
            </Text>
            <PrimaryRideSteps
              styles={styles}
              step={step}
              selectedVehicle={selectedVehicle}
              setSelectedVehicle={setSelectedVehicle}
              multipleVehicles={multipleVehicles}
              setMultipleVehicles={setMultipleVehicles}
              makeDropdownOpen={makeDropdownOpen}
              setMakeDropdownOpen={setMakeDropdownOpen}
              selectedMake={selectedMake}
              setSelectedMake={setSelectedMake}
              selectedFuel={selectedFuel}
              setSelectedFuel={setSelectedFuel}
              modelName={modelName}
              setModelName={setModelName}
              vehicleYear={vehicleYear}
              setVehicleYear={setVehicleYear}
              plateNumber={plateNumber}
              setPlateNumber={setPlateNumber}
            />
            <View style={[styles.actions, step === 2 && styles.actionsStep2]}>
              <Pressable
                onPress={() => {
                  if (step === 2) {
                    animateUiChange();
                    setStep(1);
                  } else if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace("/quick-account-setup");
                  }
                }}
                style={styles.backAction}
              >
                <Text style={styles.backActionText}>Back</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  animateUiChange();
                  if (step === 1) {
                    setStep(2);
                  } else {
                    setShowAlmostDone(true);
                  }
                }}
                style={[
                  styles.nextAction,
                  step === 2 && styles.step2NextAction,
                  (step === 2 || selectedVehicle) && styles.nextActionSelected,
                ]}
              >
                <Text style={styles.nextActionText}>
                  {step === 2 ? "Save and Continue" : "Next"}
                </Text>
                <Ionicons
                  name="arrow-forward-circle-outline"
                  size={16}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>
            </View>
            {showAlmostDone ? (
              <View style={styles.almostDone}>
                <Animated.Text
                  style={[styles.almostDoneTitle, almostDoneTitleAnimatedStyle]}
                >
                  You&apos;re almost done!
                </Animated.Text>
                <Animated.Text
                  style={[styles.almostDoneText, almostDoneTextAnimatedStyle]}
                >
                  You can now proceed to the next step.
                </Animated.Text>
                <View style={styles.almostDoneActions}>
                  <Pressable
                    style={styles.almostDoneBack}
                    onPress={() => {
                      animateUiChange();
                      setShowAlmostDone(false);
                    }}
                  >
                    <Text style={styles.almostDoneBackText}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={styles.almostDoneProceed}
                    onPress={() => void continueSetup()}
                    disabled={saving}
                  >
                    <Text style={styles.almostDoneProceedText}>Proceed</Text>
                    <Text style={styles.almostDoneArrow}>→</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 25,
    paddingBottom: 35,
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: 24,
  },
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 18,
    marginHorizontal: -18,
    marginBottom: -35,
  },
  hiddenRideContent: {
    display: "none",
  },
  almostDone: {
    flex: 1,
    minHeight: 430,
    justifyContent: "center",
    alignItems: "center",
  },
  almostDoneTitle: {
    width: 289,
    color: "#1E3A8A",
    fontSize: 24,
    lineHeight: 33,
    fontWeight: "800",
    textAlign: "center",
  },
  almostDoneText: {
    color: "#2C2F35",
    width: 291,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 3,
  },
  almostDoneActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 44,
  },
  almostDoneBack: {
    minHeight: 36,
    minWidth: 86,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E5F0",
    alignItems: "center",
    justifyContent: "center",
  },
  almostDoneBackText: {
    color: "#4B5568",
    fontSize: 12,
    fontWeight: "700",
  },
  almostDoneProceed: {
    width: 145,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#D97706",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  almostDoneProceedText: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "600",
  },
  almostDoneArrow: {
    color: "#FFFFFF",
    fontSize: 16,
    marginLeft: 6,
  },
  title: {
    color: "#2C2F35",
    fontSize: 24,
    lineHeight: 33,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: "#2C2F35",
    fontSize: 12,
    lineHeight: 19.5,
    fontWeight: "500",
    marginTop: 2,
  },
  stepLabel: {
    color: "#D97706",
    fontSize: 11,
    lineHeight: 16.5,
    fontWeight: "800",
    letterSpacing: 0.55,
    marginTop: 17,
  },
  sectionTitle: {
    color: "#2C2F35",
    fontSize: 15,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.45,
    marginTop: 8,
  },
  sectionCopy: {
    color: "#2C2F35",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  brandLabel: {
    color: "#131B2E",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 18,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  stepIcon: {
    width: 14,
    height: 14,
    resizeMode: "contain",
  },
  fieldLabelText: {
    color: "#131B2E",
    fontSize: 12,
    fontWeight: "600",
  },
  makeField: {
    height: 42,
    borderWidth: 1,
    borderColor: "#E4E4E4",
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  makeDropdownContainer: {
    position: "relative",
    zIndex: 10,
  },
  makeDropdown: {
    position: "absolute",
    top: 46,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: "#E4E4E4",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    marginTop: 4,
    overflow: "hidden",
  },
  makeOption: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0F4",
  },
  makeOptionText: {
    color: "#131B2E",
    fontSize: 13,
  },
  fieldPlaceholder: {
    color: "#69707D",
    fontSize: 13,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 5,
    marginTop: 18,
  },
  modelField: {
    flex: 1,
  },
  yearField: {
    width: "31%",
  },
  fieldLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  inputBoxText: {
    color: "#737783",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "#C9C9C9",
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 14,
    textAlignVertical: "center",
    lineHeight: 42,
  },
  plateText: {
    color: "#737783",
    fontSize: 13,
  },
  plateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 18,
  },
  exampleLabel: {
    color: "#4B5563",
    fontSize: 9,
    fontWeight: "700",
    marginBottom: 8,
  },
  plateField: {
    height: 44,
    borderWidth: 1,
    borderColor: "#C9C9C9",
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 18,
  },
  phBadge: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: "#E2E7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  phBadgeText: {
    color: "#3153C8",
    fontSize: 9,
    fontWeight: "800",
  },
  fuelRow: {
    flexDirection: "row",
    gap: 5,
  },
  fuelOption: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: "#C9C9C9",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  fuelOptionSelected: {
    backgroundColor: "#063FC2",
    borderColor: "#063FC2",
  },
  fuelText: {
    color: "#131B2E",
    fontSize: 12,
    fontWeight: "600",
  },
  fuelTextSelected: {
    color: "#FFFFFF",
  },
  fuelIcon: {
    width: 15,
    height: 15,
    resizeMode: "contain",
  },
  fuelIconSelected: {
    tintColor: "#FFFFFF",
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  categoryTitle: {
    color: "#131B2E",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0.14,
  },
  selectOne: {
    color: "#2C2F35",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  vehicleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
  },
  vehicleCard: {
    width: "48.5%",
    minHeight: 94,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    padding: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  vehicleCardSelected: {
    backgroundColor: "#24439A",
  },
  vehicleImage: {
    width: 36,
    height: 36,
  },
  vehicleImageSelected: {
    tintColor: "#FFFFFF",
  },
  vehicleIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#E2E7FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  vehicleIconSelected: {
    backgroundColor: "#3D579F",
  },
  selectedCheck: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleTitle: {
    color: "#2C2F35",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 0.14,
  },
  vehicleCardSelectedText: {
    color: "#FFFFFF",
  },
  vehicleDescription: {
    color: "#2C2F35",
    fontSize: 10,
    marginTop: 2,
  },
  multipleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 35,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  checkboxSelected: {
    backgroundColor: "#24439A",
  },
  multipleText: {
    color: "#131B2E",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 0.14,
  },
  multipleInfo: {
    flexDirection: "row",
    backgroundColor: "#E7EAFF",
    borderRadius: 16,
    padding: 12,
    height: 82,
    marginTop: 20,
  },
  multipleIcon: {
    width: 36,
    height: 36,
    marginRight: 12,
  },
  multipleCopy: { flex: 1 },
  multipleTitle: {
    color: "#131B2E",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.24,
  },
  multipleDescription: {
    color: "#434655",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 18,
  },
  actionsStep2: {
    marginTop: 65,
  },
  backAction: {
    width: 76,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E5F0",
    alignItems: "center",
    justifyContent: "center",
  },
  backActionText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },
  nextAction: {
    width: 96,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#3D3D4D",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  step2NextAction: {
    width: 182,
  },
  nextActionSelected: {
    backgroundColor: "#24439A",
  },
  nextActionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
});
