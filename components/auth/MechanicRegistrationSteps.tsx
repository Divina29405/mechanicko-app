import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, Text, TextInput, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AuthInput } from "@/components/auth/AuthInput";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { colors } from "@/lib/theme";
import { validateConfirmPassword, validateEmail, validatePassword } from "@/lib/validation";

export type SignupStepStyles = Record<
  string,
  StyleProp<ViewStyle & TextStyle & ImageStyle>
>;

export function MechanicRegistrationSteps({
  styles, step, isMechanic, fullName, setFullName, mobileNumber, setMobileNumber,
  homeAddress, setHomeAddress, email, setEmail, password, setPassword, confirm,
  setConfirm, emailError, setEmailError, passwordError, setPasswordError,
  confirmError, setConfirmError, licenseFront, licenseBack, pickLicensePhoto,
  skills, setSkills, certifications, setCertifications, experience, setExperience,
  setStep, setRolePickerVisible, nextStep, saveAndContinue, onSubmit, loading,
}: {
  styles: SignupStepStyles;
  step: number;
  isMechanic: boolean;
  fullName: string; setFullName: (value: string) => void;
  mobileNumber: string; setMobileNumber: (value: string) => void;
  homeAddress: string; setHomeAddress: (value: string) => void;
  email: string; setEmail: (value: string) => void;
  password: string; setPassword: (value: string) => void;
  confirm: string; setConfirm: (value: string) => void;
  emailError: string | null; setEmailError: (value: string | null) => void;
  passwordError: string | null; setPasswordError: (value: string | null) => void;
  confirmError: string | null; setConfirmError: (value: string | null) => void;
  licenseFront: string | null; licenseBack: string | null;
  pickLicensePhoto: (side: "front" | "back") => void;
  skills: string; setSkills: (value: string) => void;
  certifications: string; setCertifications: (value: string) => void;
  experience: string; setExperience: (value: string) => void;
  setStep: (value: number | ((current: number) => number)) => void;
  setRolePickerVisible: (value: boolean) => void;
  nextStep: () => void; saveAndContinue: () => Promise<void>; onSubmit: () => Promise<void>;
  loading: boolean;
}) {
  const stepProgress = useSharedValue(0);

  useEffect(() => {
    stepProgress.value = 0;
    stepProgress.value = withTiming(1, {
      duration: 650,
      easing: Easing.out(Easing.cubic),
    });
  }, [step, stepProgress]);

  const stepAnimatedStyle = useAnimatedStyle(() => ({
    opacity: stepProgress.value,
    transform: [{ translateY: 18 * (1 - stepProgress.value) }],
  }));

  return (
    <>
      <Animated.View style={stepAnimatedStyle}>
            <View style={styles.stepHeader}>
              <Text
                style={[
                  styles.stepLabel,
                  isMechanic && styles.mechanicStepLabel,
                  isMechanic && step === 3 && styles.mechanicStep3Label,
                ]}
              >
                Step {step} of 4
              </Text>
              <Text
                style={[
                  styles.stepTitle,
                  isMechanic && styles.mechanicStepTitle,
                  isMechanic && step === 3 && styles.mechanicStep3Title,
                  isMechanic && step === 4 && styles.mechanicFinalStepTitle,
                ]}
              >
                {step === 1
                  ? "Personal information"
                  : step === 2
                    ? "Documents"
                    : step === 3
                      ? "Skills and Specialization"
                      : "Certifications and Experience"}
              </Text>
            </View>

            {step === 1 ? (
              <>
                <Text style={styles.requiredHelper}>
                  Please fill out all the (*) required information.
                </Text>
                <AuthInput
                  label="Full name"
                  icon="person-outline"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  variant="mechanic"
                />
                <AuthInput
                  label="Mobile number"
                  icon="call-outline"
                  value={mobileNumber}
                  onChangeText={setMobileNumber}
                  keyboardType="phone-pad"
                  variant="mechanic"
                />
                <AuthInput
                  label="Email address"
                  icon="mail-outline"
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (emailError) setEmailError(validateEmail(v));
                  }}
                  error={emailError}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  variant="mechanic"
                />
                <AuthInput
                  label="Home address"
                  icon="location-outline"
                  value={homeAddress}
                  onChangeText={setHomeAddress}
                  autoCapitalize="words"
                  variant="mechanic"
                />
                <AuthInput
                  label="Password"
                  icon="lock-closed-outline"
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (passwordError) setPasswordError(validatePassword(v));
                  }}
                  error={passwordError}
                  isPassword
                  autoCapitalize="none"
                  variant="mechanic"
                />
                <AuthInput
                  label="Ulitin ang password"
                  icon="shield-checkmark-outline"
                  value={confirm}
                  onChangeText={(v) => {
                    setConfirm(v);
                    if (confirmError)
                      setConfirmError(validateConfirmPassword(password, v));
                  }}
                  error={confirmError}
                  isPassword
                  autoCapitalize="none"
                  variant="mechanic"
                />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text style={styles.helperText}>
                  Upload a clear photo of your driver&apos;s license
                </Text>
                <LicensePhoto
                  label="Driver's license - front"
                  uri={licenseFront}
                  styles={styles}
                  onPress={() => void pickLicensePhoto("front")}
                />
                <LicensePhoto
                  label="Driver's license - back"
                  uri={licenseBack}
                  styles={styles}
                  onPress={() => void pickLicensePhoto("back")}
                />
              </>
            ) : null}

            {step === 3 ? (
              <TextInput
                style={styles.textArea}
                placeholder="Hal. engine repair, brake system, electrical diagnostics"
                placeholderTextColor={colors.textDim}
                value={skills}
                onChangeText={setSkills}
                multiline
                textAlignVertical="top"
              />
            ) : null}

            {step === 4 ? (
              <>
                <TextInput
                  style={styles.textArea}
                  placeholder="Certifications at training"
                  placeholderTextColor={colors.textDim}
                  value={certifications}
                  onChangeText={setCertifications}
                  multiline
                  textAlignVertical="top"
                />
                <TextInput
                  style={styles.textArea}
                  placeholder="Ilang taon na ang experience mo at saan ka nagtrabaho?"
                  placeholderTextColor={colors.textDim}
                  value={experience}
                  onChangeText={setExperience}
                  multiline
                  textAlignVertical="top"
                />
              </>
            ) : null}
      </Animated.View>

            <View
              style={[
                styles.stepActions,
                isMechanic && styles.mechanicStepActions,
              ]}
            >
              {step > 1 || isMechanic ? (
                <Pressable
                  style={styles.backStepButton}
                  onPress={() =>
                    step > 1
                      ? setStep((currentStep) => currentStep - 1)
                      : setRolePickerVisible(true)
                  }
                >
                  <Text style={styles.backStepText}>Back</Text>
                </Pressable>
              ) : null}
              {step < 4 ? (
                <PrimaryButton
                  label="Next"
                  onPress={nextStep}
                  icon={require("../../assets/images/next.png")}
                  variant={isMechanic ? "blue" : "amber"}
                />
              ) : (
                <PrimaryButton
                  label="Save and Continue"
                  onPress={isMechanic ? saveAndContinue : onSubmit}
                  loading={loading}
                  variant={isMechanic ? "blue" : "amber"}
                />
              )}
            </View>
        </>
  );
}

function LicensePhoto({
  label,
  uri,
  styles,
  onPress,
}: {
  label: string;
  uri: string | null;
  styles: SignupStepStyles;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.photoButton} onPress={onPress}>
      <View style={styles.photoIconSlot}>
        {uri ? <Image source={{ uri }} style={styles.photoPreview} /> : <Ionicons name="camera-outline" size={28} color={colors.amber} />}
      </View>
      <View style={styles.photoCopy}>
        <Text style={styles.photoLabel}>{label}</Text>
        <Text style={styles.photoHint}>{uri ? "Photo selected" : "Choose photo"}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
    </Pressable>
  );
}