import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
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

import { AuthInput } from "@/components/auth/AuthInput";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { ErrorBanner } from "@/components/auth/ErrorBanner";
import { MechanicRegistrationSteps } from "@/components/auth/MechanicRegistrationSteps";
import { useSignupForm } from "@/hooks/useSignupForm";
import { colors, radii, spacing } from "@/lib/theme";
import {
  validateConfirmPassword,
  validateEmail,
  validateFullName,
  validatePhilippineMobileNumber,
  validatePassword,
} from "@/lib/validation";
import { normalizeText } from "@/lib/typography";

export default function SignupScreen() {
  const { back } = useLocalSearchParams<{ back?: string }>();
  const almostDoneTitleProgress = useSharedValue(0);
  const almostDoneTextProgress = useSharedValue(0);
  const {
    fullName,
    setFullName,
    mobileNumber,
    setMobileNumber,
    homeAddress,
    setHomeAddress,
    email,
    setEmail,
    password,
    setPassword,
    confirm,
    setConfirm,
    role,
    setRole,
    isMechanic,
    rolePickerVisible,
    rolePickerLeaving,
    setRolePickerVisible,
    emailError,
    setEmailError,
    passwordError,
    setPasswordError,
    confirmError,
    setConfirmError,
    fieldErrors,
    setFieldErrors,
    formError,
    info,
    loading,
    success,
    showAlmostDone,
    setShowAlmostDone,
    step,
    setStep,
    licenseFront,
    licenseBack,
    skills,
    setSkills,
    certifications,
    setCertifications,
    experience,
    setExperience,
    continueRoleSelection,
    pickLicensePhoto,
    nextStep,
    saveAndContinue,
    onSubmit,
  } = useSignupForm();

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
  }, [almostDoneTextProgress, almostDoneTitleProgress, showAlmostDone]);

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
      <AuthScreenShell>
        {isMechanic || role === "customer" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to account type selection"
            hitSlop={12}
            onPress={() => {
              if (role === "customer") {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  setRole(null);
                  setRolePickerVisible(true);
                }
              } else {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace({
                    pathname: "/quick-account-setup",
                    params: { role: "mechanic", back: "1" },
                  });
                }
              }
            }}
            style={styles.mechanicBackButton}
          >
            <Ionicons name="arrow-back" size={26} color="#0F172A" />
          </Pressable>
        ) : null}

        <View
          style={[
            styles.card,
            isMechanic && styles.mechanicCard,
            role === "customer" && styles.customerCard,
            (rolePickerVisible || rolePickerLeaving) &&
              styles.hiddenUnderlyingCard,
          ]}
        >
          {!showAlmostDone ? (
            <>
              <Text
                style={[
                  styles.heading,
                  isMechanic && styles.mechanicHeading,
                  role === "customer" && styles.customerHeading,
                  isMechanic && step === 3 && styles.mechanicStep3Heading,
                  isMechanic && step === 4 && styles.mechanicFinalHeading,
                ]}
              >
                {isMechanic || role === "customer"
                  ? "Create an account"
                  : "Gumawa ng account"}
              </Text>
              <Text
                style={[
                  styles.sub,
                  isMechanic && styles.mechanicSub,
                  role === "customer" && styles.customerSub,
                  isMechanic && step === 3 && styles.mechanicStep3Sub,
                  isMechanic && step === 4 && styles.mechanicFinalSub,
                ]}
              >
                {isMechanic
                  ? "Register as a mechanic to accept services."
                  : role === "customer"
                    ? "Register as a customer to book a service request."
                    : "Mag-register bilang user para gumawa ng service requests."}
              </Text>
            </>
          ) : null}

          <ErrorBanner message={formError} />
          {info ? <Text style={styles.info}>{info}</Text> : null}

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
                  onPress={() => setShowAlmostDone(false)}
                >
                  <Text style={styles.almostDoneBackText}>Back</Text>
                </Pressable>
                <Pressable
                  style={styles.almostDoneProceed}
                  onPress={() =>
                    router.push({
                      pathname: "/quick-account-setup",
                      params: { role: role ?? "customer", completed: "1" },
                    })
                  }
                >
                  <Text style={styles.almostDoneProceedText}>Proceed</Text>
                  <Text style={styles.almostDoneArrow}>→</Text>
                </Pressable>
              </View>
            </View>
          ) : success ? (
            <View>
              {role === "mechanic" ? (
                <>
                  <Text style={styles.reviewTitle}>Application submitted</Text>
                  <Text style={styles.reviewText}>
                    Na-submit na ang mechanic application mo. Kailangan mo
                    lamang maghintay ng 7-10 working days para sa review.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.reviewTitle}>Check your email</Text>
                  <Text style={styles.reviewText}>
                    May verification link na ipinadala sa email mo. I-verify
                    muna ang account bago mag-login.
                  </Text>
                </>
              )}
              <Link href="/(auth)/login" asChild>
                <Pressable style={styles.successButton}>
                  <Text style={styles.successButtonText}>Back to Login</Text>
                </Pressable>
              </Link>
            </View>
          ) : role === "customer" ? (
            <>
              <Text style={styles.customerSectionTitle}>
                Personal information
              </Text>
              <Text style={styles.customerRequiredHelper}>
                Please fill out all the (*) required information.
              </Text>
              <AuthInput
                label="Full name"
                required
                icon="person-outline"
                iconImage={require("../../assets/images/profile1.png")}
                value={fullName}
                onChangeText={(value) => {
                  setFullName(value);
                  setFieldErrors((current) => ({
                    ...current,
                    fullName: validateFullName(value),
                  }));
                }}
                error={fieldErrors.fullName}
                onBlur={() =>
                  setFieldErrors((current) => ({
                    ...current,
                    fullName: validateFullName(fullName),
                  }))
                }
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                variant="customer"
                fieldStyle={styles.formFieldContainer}
              />
              <AuthInput
                label="Mobile number"
                required
                icon="call-outline"
                iconImage={require("../../assets/images/call.png")}
                value={mobileNumber}
                onChangeText={(value) => {
                  setMobileNumber(value);
                  setFieldErrors((current) => ({
                    ...current,
                    mobileNumber: validatePhilippineMobileNumber(value),
                  }));
                }}
                error={fieldErrors.mobileNumber}
                onBlur={() =>
                  setFieldErrors((current) => ({
                    ...current,
                    mobileNumber: validatePhilippineMobileNumber(mobileNumber),
                  }))
                }
                keyboardType="phone-pad"
                returnKeyType="next"
                variant="customer"
                fieldStyle={styles.formFieldContainer}
              />
              <AuthInput
                label="Email address"
                required
                icon="mail-outline"
                iconImage={require("../../assets/images/email1.jpg")}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (emailError) setEmailError(validateEmail(v));
                }}
                error={emailError}
                onBlur={() => setEmailError(validateEmail(email))}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                variant="customer"
                fieldStyle={styles.formFieldContainer}
              />
              <AuthInput
                label="Password"
                required
                icon="lock-closed-outline"
                iconImage={require("../../assets/images/password1.jpg")}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (passwordError) setPasswordError(validatePassword(v));
                }}
                error={passwordError}
                onBlur={() => setPasswordError(validatePassword(password))}
                isPassword
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                variant="customer"
                fieldStyle={styles.formFieldContainer}
              />
              <AuthInput
                label="Confirm password"
                required
                icon="shield-checkmark-outline"
                iconImage={require("../../assets/images/password1.jpg")}
                value={confirm}
                onChangeText={(v) => {
                  setConfirm(v);
                  if (confirmError)
                    setConfirmError(validateConfirmPassword(password, v));
                }}
                error={confirmError}
                onBlur={() =>
                  setConfirmError(validateConfirmPassword(password, confirm))
                }
                isPassword
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                variant="customer"
                fieldStyle={styles.formFieldContainer}
              />
              <View style={styles.customerActions}>
                <Pressable
                  style={styles.customerBackButton}
                  onPress={() => router.back()}
                >
                  <Text style={styles.customerBackText}>Back</Text>
                </Pressable>
                <Pressable
                  style={styles.customerNextButton}
                  onPress={onSubmit}
                  disabled={loading}
                >
                  <Text style={styles.customerNextText}>
                    {loading ? "Saving..." : "Next"}
                  </Text>
                  <Ionicons
                    name="arrow-forward-circle-outline"
                    size={20}
                    color="#FFFFFF"
                  />
                </Pressable>
              </View>
            </>
          ) : (
            <MechanicRegistrationSteps
              styles={styles}
              step={step}
              isMechanic={isMechanic}
              fullName={fullName}
              setFullName={setFullName}
              mobileNumber={mobileNumber}
              setMobileNumber={setMobileNumber}
              homeAddress={homeAddress}
              setHomeAddress={setHomeAddress}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              confirm={confirm}
              setConfirm={setConfirm}
              emailError={emailError}
              setEmailError={setEmailError}
              passwordError={passwordError}
              setPasswordError={setPasswordError}
              confirmError={confirmError}
              setConfirmError={setConfirmError}
              fieldErrors={fieldErrors}
              setFieldErrors={setFieldErrors}
              licenseFront={licenseFront}
              licenseBack={licenseBack}
              pickLicensePhoto={(side) => void pickLicensePhoto(side)}
              skills={skills}
              setSkills={setSkills}
              certifications={certifications}
              setCertifications={setCertifications}
              experience={experience}
              setExperience={setExperience}
              setStep={setStep}
              setRolePickerVisible={setRolePickerVisible}
              backToQuickSetup={() =>
                router.replace({
                  pathname: "/quick-account-setup",
                  params: { role: "mechanic" },
                })
              }
              nextStep={nextStep}
              saveAndContinue={saveAndContinue}
              onSubmit={onSubmit}
              loading={loading}
            />
          )}
        </View>
      </AuthScreenShell>
      {rolePickerVisible ? (
        <View style={styles.rolePickerOverlay}>
          <LinearGradient
            colors={["#F8FAFC", "#F1F5F9"]}
            style={styles.modalBackdrop}
          >
            <SafeAreaView style={styles.roleScreen}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to login"
                hitSlop={12}
                onPress={() =>
                  router.replace({
                    pathname: "/(auth)/login",
                    params: { back: "1" },
                  })
                }
                style={styles.roleBackButton}
              >
                <Ionicons name="arrow-back" size={28} color="#0F172A" />
              </Pressable>

              <View style={styles.roleModal}>
                <Text style={styles.modalTitle}>Choose an account</Text>
                <Text style={styles.modalText}>
                  What type of account you&apos;re registering as?
                </Text>

                <Pressable
                  style={[
                    styles.roleOption,
                    styles.roleOptionMotorist,
                    role === "customer" && styles.roleOptionSelected,
                  ]}
                  onPress={() => {
                    setRole("customer");
                  }}
                >
                  <View style={styles.roleIcon}>
                    <Image
                      source={require("../../assets/images/motorist.png")}
                      style={styles.roleIconImage}
                    />
                  </View>
                  <View style={styles.roleCopy}>
                    <Text style={styles.roleTitle}>Motorist</Text>
                    <Text style={styles.roleDescription}>
                      Book for a services
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      role === "customer" && styles.checkboxSelected,
                    ]}
                  >
                    {role === "customer" ? (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    ) : null}
                  </View>
                </Pressable>

                <Pressable
                  style={[
                    styles.roleOption,
                    styles.roleOptionMechanic,
                    styles.roleOptionLast,
                    role === "mechanic" && styles.roleOptionSelected,
                  ]}
                  onPress={() => {
                    setRole("mechanic");
                  }}
                >
                  <View style={styles.roleIcon}>
                    <Image
                      source={require("../../assets/images/mechanic.png")}
                      style={styles.roleIconImage}
                    />
                  </View>
                  <View style={styles.roleCopy}>
                    <Text style={[styles.roleTitle, styles.roleTitleMechanic]}>
                      Mechanic
                    </Text>
                    <Text style={styles.roleDescription}>
                      Offering services
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      role === "mechanic" && styles.checkboxSelected,
                    ]}
                  >
                    {role === "mechanic" ? (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    ) : null}
                  </View>
                </Pressable>
              </View>

              <View style={styles.roleBottom}>
                <Text style={styles.rolePrompt}>
                  Please tap the checkbox to proceed.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Proceed with account registration"
                  onPress={continueRoleSelection}
                  style={({ pressed }) => [
                    styles.roleProceedButton,
                    role && styles.roleProceedButtonSelected,
                    !role && styles.roleProceedButtonDisabled,
                    pressed && styles.roleProceedPressed,
                  ]}
                >
                  <Text style={styles.roleProceedText}>Proceed</Text>
                  <Text style={styles.roleProceedArrow}>→</Text>
                </Pressable>
              </View>
            </SafeAreaView>
          </LinearGradient>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hiddenUnderlyingCard: {
    display: "none",
  },
  formFieldContainer: {
    marginBottom: 6,
  },
  customerCard: {
    marginHorizontal: 12, // Reduced margin to widen card
    marginTop: 64,
    minHeight: 680,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#17213D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    paddingHorizontal: 26, // Increased inner padding
    paddingTop: 28,
    paddingBottom: 28,
  },
  customerSectionTitle: {
    color: "#0F172A",
    fontSize: normalizeText(18),
    fontWeight: "800",
    letterSpacing: -0.3,
    marginTop: 4,
    marginBottom: 4,
  },
  customerHeading: {
    color: "#0F172A",
    width: "100%",
    fontSize: normalizeText(28),
    fontWeight: "800",
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  customerSub: {
    width: "100%",
    color: "#475569",
    fontSize: normalizeText(14),
    lineHeight: normalizeText(22),
    fontWeight: "600",
    marginBottom: 16,
  },
  customerRequiredHelper: {
    color: "#475569",
    fontSize: normalizeText(13),
    fontWeight: "700",
    marginBottom: 16,
  },
  customerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 16,
  },
  customerBackButton: {
    width: 84,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E5F0",
    alignItems: "center",
    justifyContent: "center",
  },
  customerBackText: {
    color: "#334155",
    fontSize: normalizeText(15),
    fontWeight: "700",
  },
  customerNextButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#3D3D4D",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "#D97706",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  customerNextText: {
    color: "#FFFFFF",
    fontSize: normalizeText(15),
    fontWeight: "700",
  },
  mechanicBackButton: {
    position: "absolute",
    top: 24,
    left: 20,
    zIndex: 2,
  },
  mechanicCard: {
    marginHorizontal: 12, // Reduced margin to widen card
    marginTop: 64,
    minHeight: 680,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 26, // Increased inner padding
    paddingTop: 28,
    paddingBottom: 28,
    shadowColor: "#17213D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  heading: {
    color: colors.text,
    fontSize: normalizeText(22),
    fontWeight: "700",
    marginBottom: 4,
  },
  sub: {
    color: colors.textMuted,
    fontSize: normalizeText(14),
    marginBottom: spacing.lg,
  },
  mechanicHeading: {
    color: "#0F172A",
    width: "100%",
    fontSize: normalizeText(28),
    letterSpacing: -0.6,
    fontWeight: "800",
    marginBottom: 6,
  },
  mechanicStep3Heading: {
    fontSize: normalizeText(25),
    letterSpacing: -0.5,
  },
  mechanicFinalHeading: {
    fontSize: normalizeText(25),
    letterSpacing: -0.5,
  },
  mechanicSub: {
    width: "100%",
    color: "#475569",
    fontSize: normalizeText(14),
    lineHeight: normalizeText(22),
    fontWeight: "600",
    marginBottom: 16,
  },
  mechanicStep3Sub: {
    lineHeight: normalizeText(22),
  },
  mechanicFinalSub: {
    lineHeight: normalizeText(22),
  },
  requiredHelper: {
    color: "#475569",
    fontSize: normalizeText(13),
    fontWeight: "700",
    marginTop: -4,
    marginBottom: 12,
  },
  errorMessage: {
    color: "#EF4444",
    fontSize: normalizeText(13),
    marginTop: 6,
  },
  info: {
    color: colors.success,
    fontSize: normalizeText(14),
    marginBottom: spacing.md,
  },
  successButton: {
    marginTop: spacing.md,
    backgroundColor: colors.amber,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  successButtonText: {
    color: colors.bg,
    fontWeight: "700",
    fontSize: normalizeText(15),
  },
  reviewTitle: {
    color: colors.success,
    fontSize: normalizeText(15),
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  reviewText: {
    color: colors.textMuted,
    fontSize: normalizeText(15),
    lineHeight: normalizeText(22),
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
    fontWeight: "800",
    textAlign: "center",
  },
  almostDoneText: {
    color: "#0F172A",
    width: 320,
    fontSize: normalizeText(16),
    lineHeight: normalizeText(24),
    fontWeight: "600",
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
    minHeight: 46,
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
    minHeight: 46,
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
    marginLeft: 8,
  },
  stepHeader: {
    marginBottom: 12,
  },
  stepLabel: {
    color: colors.amber,
    fontSize: normalizeText(13),
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  mechanicStepLabel: {
    color: "#D97706",
    width: "100%",
    fontSize: normalizeText(13),
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  mechanicStep3Label: {
  },
  stepTitle: {
    color: colors.text,
    fontSize: normalizeText(20),
    fontWeight: "800",
  },
  mechanicStepTitle: {
    color: "#0F172A",
    width: "100%",
    fontSize: normalizeText(18),
    fontWeight: "800",
    marginBottom: 0,
  },
  mechanicStep3Title: {
    fontSize: normalizeText(16),
  },
  mechanicFinalStepTitle: {
    fontSize: normalizeText(20),
  },
  helperText: {
    color: colors.textMuted,
    fontSize: normalizeText(15),
    lineHeight: normalizeText(22),
    marginBottom: spacing.md,
  },
  photoButton: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  photoPreview: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
  },
  photoIconSlot: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  photoCopy: {
    flex: 1,
    marginLeft: 16,
  },
  photoLabel: {
    color: colors.text,
    fontSize: normalizeText(15),
    fontWeight: "700",
    marginBottom: 4,
  },
  photoHint: {
    color: colors.textMuted,
    fontSize: normalizeText(13),
  },
  textArea: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    color: colors.text,
    padding: spacing.md,
    fontSize: normalizeText(15),
    marginBottom: spacing.md,
  },
  stepActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  mechanicStepActions: {
    marginTop: 8,
    justifyContent: "flex-start",
    gap: 16,
  },
  backStepButton: {
    minHeight: 46,
    minWidth: 84,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 0,
  },
  backStepText: {
    color: colors.textMuted,
    fontSize: normalizeText(14),
    fontWeight: "700",
  },
  rolePickerOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    elevation: 10,
  },
  modalBackdrop: {
    flex: 1,
    paddingHorizontal: 16,
  },
  roleScreen: {
    flex: 1,
  },
  roleModal: {
    width: "100%",
    maxWidth: 380,
    minHeight: 340,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 28,
    marginTop: 80,
    borderWidth: 1,
    borderColor: "#DCE3EF",
    shadowColor: "#17213D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  roleBackButton: {
    position: "absolute",
    top: 66,
    left: 8,
    zIndex: 2,
  },
  modalTitle: {
    color: "#0F172A",
    fontSize: normalizeText(24),
    fontWeight: "800",
  },
  modalText: {
    color: "#334155",
    fontSize: normalizeText(15),
    fontWeight: "600",
    marginBottom: 16,
    marginTop: 6,
  },
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 76,
    borderRadius: 14,
    backgroundColor: "#F1F2FF",
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  roleOptionSelected: {
    backgroundColor: "#F1F2FF",
  },
  roleOptionLast: {
    marginBottom: 0,
  },
  roleOptionMotorist: {
    marginTop: 10,
  },
  roleOptionMechanic: {
    minHeight: 76,
    marginTop: 0,
  },
  roleIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  roleIconImage: {
    width: 42,
    height: 42,
    resizeMode: "contain",
    tintColor: "#000000",
  },
  roleCopy: {
    flex: 1,
  },
  roleTitle: {
    color: "#1E3A8A",
    fontSize: normalizeText(17),
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  roleTitleMechanic: {
    color: "#D97706",
  },
  roleDescription: {
    color: "#334155",
    fontSize: normalizeText(13),
    fontWeight: "600",
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#1E3A8A",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 14,
    marginRight: 8,
  },
  checkboxSelected: {
    backgroundColor: "#1E3A8A",
  },
  roleBottom: {
    marginTop: "auto",
    paddingHorizontal: 10,
    paddingBottom: 140,
    alignItems: "center",
  },
  rolePrompt: {
    color: "#0F172A",
    fontSize: normalizeText(15),
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  roleProceedButton: {
    alignSelf: "stretch",
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#132D73",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  roleProceedButtonDisabled: {
    backgroundColor: "#3D3D4D",
  },
  roleProceedButtonSelected: {
    backgroundColor: "#24439A",
  },
  roleProceedPressed: {
    opacity: 0.8,
  },
  roleProceedText: {
    color: "#FFFFFF",
    fontSize: normalizeText(20),
    fontWeight: "700",
  },
  roleProceedArrow: {
    color: "#FFFFFF",
    fontSize: normalizeText(26),
    marginLeft: 10,
    marginTop: -2,
  },
  modalBackButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  modalBackText: {
    color: colors.textMuted,
    fontSize: normalizeText(15),
    fontWeight: "700",
  },
});