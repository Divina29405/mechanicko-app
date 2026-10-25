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
            <Ionicons name="arrow-back" size={24} color="#000000" />
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
                    size={16}
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
            colors={["#F5F7FA", "#F5F7FA"]}
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
                <Ionicons name="arrow-back" size={25} color="#000000" />
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
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
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
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
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
  customerCard: {
    marginHorizontal: -24,
    marginTop: 54,
    minHeight: 680,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#17213D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  customerSectionTitle: {
    color: "#2C2F35",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: -0.35,
    marginTop: 2,
    marginBottom: 0,
  },
  customerHeading: {
    color: "#2C2F35",
    width: "100%",
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "700",
    letterSpacing: -0.6,
    marginBottom: 2,
  },
  customerSub: {
    width: "100%",
    color: "#2C2F35",
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "500",
    marginBottom: 14,
  },
  customerRequiredHelper: {
    color: "#2C2F35",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: -0.35,
    marginTop: 2,
    marginBottom: 10,
  },
  customerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 10,
  },
  customerBackButton: {
    width: 76,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E0E5F0",
    alignItems: "center",
    justifyContent: "center",
  },
  customerBackText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600",
  },
  customerNextButton: {
    width: 108,
    height: 42,
    borderRadius: 11,
    backgroundColor: "#3D3D4D",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    shadowColor: "#D97706",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 7,
    elevation: 4,
  },
  customerNextText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  mechanicBackButton: {
    position: "absolute",
    top: 24,
    left: 20,
    zIndex: 2,
  },
  mechanicCard: {
    marginHorizontal: -24,
    marginTop: 54,
    minHeight: 680,
    borderRadius: 24,
    borderWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  heading: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  sub: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  mechanicHeading: {
    color: "#2C2F35",
    width: "100%",
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.6,
    fontWeight: "700",
    marginBottom: 2,
  },
  mechanicStep3Heading: {
    width: 342,
    fontSize: 24,
    lineHeight: 27.5,
    letterSpacing: -0.55,
  },
  mechanicFinalHeading: {
    width: 340,
    fontSize: 24,
    lineHeight: 32.5,
    letterSpacing: -0.65,
    fontWeight: "800",
  },
  mechanicSub: {
    width: "100%",
    color: "#2C2F35",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
    marginBottom: 14,
  },
  mechanicStep3Sub: {
    width: 342,
    lineHeight: 19.5,
  },
  mechanicFinalSub: {
    width: 340,
    lineHeight: 17.88,
  },
  requiredHelper: {
    color: "#2C2F35",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    marginTop: -9,
    marginBottom: 8,
  },
  errorMessage: {
    color: "#B42318",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  info: {
    color: colors.success,
    fontSize: 13,
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
    fontSize: 15,
  },
  reviewTitle: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  reviewText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
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
    lineHeight: 32.5,
    letterSpacing: -0.65,
    fontWeight: "800",
    textAlign: "center",
  },
  almostDoneText: {
    color: "#2C2F35",
    width: 291,
    fontSize: 13,
    lineHeight: 17.88,
    fontWeight: "500",
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
    shadowColor: "#132D73",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  almostDoneProceedText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "700",
  },
  almostDoneArrow: {
    color: "#FFFFFF",
    fontSize: 16,
    marginLeft: 6,
  },
  stepHeader: {
    marginBottom: 10,
  },
  stepLabel: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  mechanicStepLabel: {
    color: "#D97706",
    width: "100%",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  mechanicStep3Label: {
    width: 342,
  },
  stepTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
  },
  mechanicStepTitle: {
    color: "#2C2F35",
    width: "100%",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    marginBottom: 0,
  },
  mechanicStep3Title: {
    width: 342,
    fontSize: 15,
    lineHeight: 23.38,
    fontWeight: "700",
  },
  mechanicFinalStepTitle: {
    width: 340,
    fontSize: 19,
    lineHeight: 28.5,
    fontWeight: "700",
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  photoButton: {
    minHeight: 78,
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
    width: 58,
    height: 58,
    borderRadius: radii.md,
  },
  photoIconSlot: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  photoCopy: {
    flex: 1,
    marginLeft: 16,
  },
  photoLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 3,
  },
  photoHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  textArea: {
    minHeight: 130,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    color: colors.text,
    padding: spacing.md,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  stepActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mechanicStepActions: {
    marginTop: 4,
    justifyContent: "flex-start",
    gap: 14,
  },
  backStepButton: {
    minHeight: 42,
    minWidth: 76,
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 0,
  },
  backStepText: {
    color: colors.textMuted,
    fontSize: 13,
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
    maxWidth: 358,
    minHeight: 326,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    marginTop: 70,
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
    top: 62,
    left: 4,
    zIndex: 2,
  },
  modalTitle: {
    color: "#2C2F35",
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 29,
  },
  modalText: {
    color: "#2C2F35",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    marginBottom: 12,
  },
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 72,
    borderRadius: 12,
    backgroundColor: "#F1F2FF",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  roleOptionSelected: {
    backgroundColor: "#F1F2FF",
  },
  roleOptionLast: {
    marginBottom: 0,
  },
  roleOptionMotorist: {
    marginTop: 8,
  },
  roleOptionMechanic: {
    minHeight: 72,
    marginTop: 0,
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  roleIconImage: {
    width: 38,
    height: 38,
    resizeMode: "contain",
    tintColor: "#000000",
  },
  roleCopy: {
    flex: 1,
  },
  roleTitle: {
    color: "#1E3A8A",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
    letterSpacing: 0.14,
  },
  roleTitleMechanic: {
    color: "#D97706",
  },
  roleDescription: {
    color: "#2C2F35",
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },
  checkbox: {
    width: 19,
    height: 19,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#1E3A8A",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    marginRight: 10,
  },
  checkboxSelected: {
    backgroundColor: "#1E3A8A",
  },
  roleBottom: {
    marginTop: "auto",
    paddingHorizontal: 5,
    paddingBottom: 140,
    alignItems: "center",
  },
  rolePrompt: {
    color: "#2C2F35",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 16,
  },
  roleProceedButton: {
    alignSelf: "stretch",
    minHeight: 56,
    borderRadius: 12,
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
    fontSize: 19,
    fontWeight: "600",
    lineHeight: 22,
  },
  roleProceedArrow: {
    color: "#FFFFFF",
    fontSize: 23,
    lineHeight: 23,
    marginLeft: 9,
    marginTop: -2,
  },
  modalBackButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  modalBackText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
});
