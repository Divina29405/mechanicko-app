import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { PrimaryRideSteps } from "@/components/PrimaryRideSteps";
import { useEffect } from "react";
import { normalizeText } from "@/lib/typography";

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
  "#F8FAFC",
  "#F1F5F9",
] as const;

export default function AddPrimaryRideScreen() {
  const almostDoneTitleProgress = useSharedValue(0);
  const almostDoneTextProgress = useSharedValue(0);
  const { back } = useLocalSearchParams<{ back?: string }>();
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
      <Stack.Screen
        options={{
          animation: back === "1" ? "slide_from_left" : "slide_from_right",
        }}
      />
      <LinearGradient
        colors={gradientColors}
        locations={[0, 1]}
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
            <Ionicons name="arrow-back" size={28} color="#0F172A" />
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
                  } else {
                    router.back();
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
                  size={20}
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
    paddingHorizontal: 22,
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
    padding: 22,
    marginHorizontal: -22,
    marginBottom: -35,
    borderWidth: 1,
    borderColor: "#DCE3EF",
    shadowColor: "#17213D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
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
    width: 320,
    color: "#1E3A8A",
    fontSize: normalizeText(28),
    lineHeight: normalizeText(36),
    fontWeight: "800",
    textAlign: "center",
  },
  almostDoneText: {
    color: "#0F172A",
    width: 320,
    fontSize: normalizeText(16),
    lineHeight: normalizeText(24),
    textAlign: "center",
    marginTop: 6,
  },
  almostDoneActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 44,
  },
  almostDoneBack: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E5F0",
    alignItems: "center",
    justifyContent: "center",
  },
  almostDoneBackText: {
    color: "#4B5568",
    fontSize: normalizeText(14),
    fontWeight: "700",
  },
  almostDoneProceed: {
    width: 160,
    minHeight: 44,
    borderRadius: 12,
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
    fontSize: normalizeText(15),
    fontWeight: "700",
  },
  almostDoneArrow: {
    color: "#FFFFFF",
    fontSize: normalizeText(20),
    marginLeft: 6,
  },
  title: {
    color: "#1E3A8A",
    fontSize: normalizeText(26),
    lineHeight: normalizeText(34),
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: "#334155",
    fontSize: normalizeText(14),
    lineHeight: normalizeText(22),
    fontWeight: "600",
    marginTop: 4,
  },
  stepLabel: {
    color: "#D97706",
    fontSize: normalizeText(13),
    fontWeight: "800",
    letterSpacing: 0.55,
    marginTop: 20,
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: normalizeText(17),
    fontWeight: "800",
    letterSpacing: -0.45,
    marginTop: 8,
  },
  sectionCopy: {
    color: "#334155",
    fontSize: normalizeText(12),
    fontWeight: "600",
    marginTop: 4,
  },
  brandLabel: {
    color: "#131B2E",
    fontSize: normalizeText(14),
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepIcon: {
    width: 16,
    height: 16,
    resizeMode: "contain",
  },
  fieldLabelText: {
    color: "#131B2E",
    fontSize: normalizeText(14),
    fontWeight: "700",
  },
  makeField: {
    height: 48,
    borderWidth: 1,
    borderColor: "#E4E4E4",
    borderRadius: 12,
    paddingHorizontal: 16,
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
    top: 52,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: "#E4E4E4",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    marginTop: 4,
    overflow: "hidden",
  },
  makeOption: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0F4",
  },
  makeOptionText: {
    color: "#131B2E",
    fontSize: normalizeText(15),
  },
  fieldPlaceholder: {
    color: "#69707D",
    fontSize: normalizeText(15),
  },
  fieldRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
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
    gap: 6,
    marginBottom: 8,
  },
  inputBoxText: {
    color: "#737783",
    fontSize: normalizeText(15),
    borderWidth: 1,
    borderColor: "#C9C9C9",
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 16,
    textAlignVertical: "center",
  },
  plateText: {
    color: "#737783",
    fontSize: normalizeText(15),
  },
  plateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },
  exampleLabel: {
    color: "#4B5563",
    fontSize: normalizeText(11),
    fontWeight: "800",
    marginBottom: 8,
  },
  plateField: {
    height: 48,
    borderWidth: 1,
    borderColor: "#C9C9C9",
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  phBadge: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#E2E7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  phBadgeText: {
    color: "#3153C8",
    fontSize: normalizeText(10),
    fontWeight: "900",
  },
  fuelRow: {
    flexDirection: "row",
    gap: 8,
  },
  fuelOption: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: "#C9C9C9",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  fuelOptionSelected: {
    backgroundColor: "#063FC2",
    borderColor: "#063FC2",
  },
  fuelText: {
    color: "#131B2E",
    fontSize: normalizeText(14),
    fontWeight: "700",
  },
  fuelTextSelected: {
    color: "#FFFFFF",
  },
  fuelIcon: {
    width: 18,
    height: 18,
    resizeMode: "contain",
  },
  fuelIconSelected: {
    tintColor: "#FFFFFF",
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  categoryTitle: {
    color: "#131B2E",
    fontSize: normalizeText(16),
    fontWeight: "700",
  },
  selectOne: {
    color: "#2C2F35",
    fontSize: normalizeText(12),
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  vehicleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
  },
  vehicleCard: {
    width: "48%",
    minHeight: 106,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 12,
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
    width: 42,
    height: 42,
  },
  vehicleIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#E2E7FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  vehicleIconSelected: {
    backgroundColor: "#3D579F",
  },
  selectedCheck: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleTitle: {
    color: "#2C2F35",
    fontSize: normalizeText(15),
    fontWeight: "800",
  },
  vehicleCardSelectedText: {
    color: "#FFFFFF",
  },
  vehicleDescription: {
    color: "#334155",
    fontSize: normalizeText(12),
    marginTop: 2,
  },
  multipleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 38,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: "#24439A",
  },
  multipleText: {
    color: "#131B2E",
    fontSize: normalizeText(16),
    fontWeight: "800",
  },
  multipleInfo: {
    flexDirection: "row",
    backgroundColor: "#E7EAFF",
    borderRadius: 16,
    padding: 16,
    minHeight: 88,
    marginTop: 22,
  },
  multipleIcon: {
    width: 40,
    height: 40,
    marginRight: 14,
  },
  multipleCopy: { flex: 1 },
  multipleTitle: {
    color: "#131B2E",
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  multipleDescription: {
    color: "#434655",
    fontSize: normalizeText(14),
    lineHeight: normalizeText(20),
    fontWeight: "500",
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 24,
  },
  actionsStep2: {
    marginTop: 70,
  },
  backAction: {
    width: 86,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E5F0",
    alignItems: "center",
    justifyContent: "center",
  },
  backActionText: {
    color: "#334155",
    fontSize: normalizeText(14),
    fontWeight: "700",
  },
  nextAction: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#3D3D4D",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  step2NextAction: {
    flex: 1,
  },
  nextActionSelected: {
    backgroundColor: "#24439A",
  },
  nextActionText: {
    color: "#FFFFFF",
    fontSize: normalizeText(15),
    fontWeight: "700",
  },
});