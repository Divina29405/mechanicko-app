import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Link, router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthInput } from "@/components/auth/AuthInput";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { ErrorBanner } from "@/components/auth/ErrorBanner";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import {
  type AuthRole,
  type MechanicApplication,
  useAuth,
} from "@/contexts/AuthContext";
import { colors, radii, spacing } from "@/lib/theme";
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from "@/lib/validation";

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<AuthRole | null>(null);
  const [rolePickerVisible, setRolePickerVisible] = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState(1);
  const [licenseFront, setLicenseFront] = useState<string | null>(null);
  const [licenseBack, setLicenseBack] = useState<string | null>(null);
  const [skills, setSkills] = useState("");
  const [certifications, setCertifications] = useState("");
  const [experience, setExperience] = useState("");

  async function pickLicensePhoto(side: "front" | "back") {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    if (side === "front") {
      setLicenseFront(result.assets[0].uri);
    } else {
      setLicenseBack(result.assets[0].uri);
    }
  }

  function nextStep() {
    setFormError(null);

    if (step === 1) {
      if (!fullName.trim() || !mobileNumber.trim() || !homeAddress.trim()) {
        setFormError("Kumpletuhin ang personal information bago magpatuloy.");
        return;
      }

      const nextEmailError = validateEmail(email);
      const nextPasswordError = validatePassword(password);
      const nextConfirmError = validateConfirmPassword(password, confirm);
      setEmailError(nextEmailError);
      setPasswordError(nextPasswordError);
      setConfirmError(nextConfirmError);

      if (nextEmailError || nextPasswordError || nextConfirmError) return;
    }

    if (step === 2 && (!licenseFront || !licenseBack)) {
      setFormError(
        "Kailangan ang front at back na larawan ng driver's license.",
      );
      return;
    }

    if (step === 3 && !skills.trim()) {
      setFormError("Ilagay ang skills at specialization mo.");
      return;
    }

    setStep((currentStep) => Math.min(currentStep + 1, 4));
  }

  async function submitMechanicApplication() {
    if (!certifications.trim() || !experience.trim()) {
      setFormError(
        "Kumpletuhin ang certifications at experience bago isumite.",
      );
      return;
    }

    setLoading(true);
    const application: MechanicApplication = {
      mobileNumber,
      homeAddress,
      skills,
      certifications,
      experience,
      licenseFrontUri: licenseFront ?? "",
      licenseBackUri: licenseBack ?? "",
    };
    const { error } = await signUp(
      email,
      password,
      fullName,
      "mechanic",
      application,
    );
    setLoading(false);

    if (error) {
      setFormError(error);
      return;
    }

    setSuccess(true);
    setInfo("Application submitted for review.");
  }

  async function onSubmit() {
    if (!role) {
      setRolePickerVisible(true);
      return;
    }

    if (role === "mechanic") {
      await submitMechanicApplication();
      return;
    }

    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    const nextConfirmError = validateConfirmPassword(password, confirm);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    setFormError(null);
    setInfo(null);
    if (!mobileNumber.trim()) {
      setFormError("Ilagay ang mobile number.");
    }
    if (
      nextEmailError ||
      nextPasswordError ||
      nextConfirmError ||
      !mobileNumber.trim()
    )
      return;

    setLoading(true);
    const { error } = await signUp(
      email,
      password,
      fullName,
      role,
      undefined,
      mobileNumber,
    );
    setLoading(false);
    if (error) {
      setFormError(error);
      setSuccess(false);
      return;
    }
    setSuccess(true);
    setInfo("May verification link na ipinadala sa email address mo.");
    setFormError(null);
    Alert.alert(
      "Verify your email",
      "Na-create ang account. Buksan ang verification link sa email bago mag-login.",
      [{ text: "Back to Login", onPress: () => router.push("/(auth)/login") }],
    );
  }

  return (
    <AuthScreenShell>
      <View style={styles.card}>
        <Text style={styles.heading}>Gumawa ng account</Text>
        <Text style={styles.sub}>
          {role === "mechanic"
            ? "Mag-register bilang mechanic para tumanggap ng jobs."
            : "Mag-register bilang user para gumawa ng service requests."}
        </Text>

        <ErrorBanner message={formError} />
        {info ? <Text style={styles.info}>{info}</Text> : null}

        {success ? (
          <View>
            {role === "mechanic" ? (
              <>
                <Text style={styles.reviewTitle}>Application submitted</Text>
                <Text style={styles.reviewText}>
                  Na-submit na ang mechanic application mo. Kailangan mo lamang
                  maghintay ng 7-10 working days para sa review.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.reviewTitle}>Check your email</Text>
                <Text style={styles.reviewText}>
                  May verification link na ipinadala sa email mo. I-verify muna
                  ang account bago mag-login.
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
            <AuthInput
              label="Pangalan (optional)"
              icon="person-outline"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />
            <AuthInput
              label="Mobile number"
              icon="call-outline"
              value={mobileNumber}
              onChangeText={setMobileNumber}
              keyboardType="phone-pad"
              returnKeyType="next"
            />
            <AuthInput
              label="Email"
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
              returnKeyType="next"
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
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
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
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
            <PrimaryButton
              label="Gumawa ng account"
              onPress={onSubmit}
              loading={loading}
            />
          </>
        ) : (
          <>
            <View style={styles.stepHeader}>
              <Text style={styles.stepLabel}>Step {step} of 4</Text>
              <Text style={styles.stepTitle}>
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
                <AuthInput
                  label="Full name"
                  icon="person-outline"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                />
                <AuthInput
                  label="Mobile number"
                  icon="call-outline"
                  value={mobileNumber}
                  onChangeText={setMobileNumber}
                  keyboardType="phone-pad"
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
                />
                <AuthInput
                  label="Home address"
                  icon="location-outline"
                  value={homeAddress}
                  onChangeText={setHomeAddress}
                  autoCapitalize="words"
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
                />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text style={styles.helperText}>
                  Mag-upload ng malinaw na larawan ng iyong driver&apos;s
                  license.
                </Text>
                <LicensePhoto
                  label="Driver's license - front"
                  uri={licenseFront}
                  onPress={() => void pickLicensePhoto("front")}
                />
                <LicensePhoto
                  label="Driver's license - back"
                  uri={licenseBack}
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

            <View style={styles.stepActions}>
              {step > 1 ? (
                <Pressable
                  style={styles.backStepButton}
                  onPress={() => setStep((currentStep) => currentStep - 1)}
                >
                  <Text style={styles.backStepText}>Back</Text>
                </Pressable>
              ) : null}
              {step < 4 ? (
                <PrimaryButton
                  label="Next"
                  onPress={nextStep}
                  icon={require("../../assets/images/next.png")}
                />
              ) : (
                <PrimaryButton
                  label="Submit application"
                  onPress={onSubmit}
                  loading={loading}
                />
              )}
            </View>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>May account na?</Text>
        <Link href="/(auth)/login" asChild>
          <Pressable>
            <Text style={styles.footerLink}>Mag-login</Text>
          </Pressable>
        </Link>
      </View>

      <Modal
        visible={rolePickerVisible}
        transparent={false}
        animationType="fade"
        onRequestClose={() => router.back()}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.roleModal}>
            <Text style={styles.modalKicker}>WELCOME TO MECHANIKO</Text>
            <Text style={styles.modalTitle}>Anong account ang gagawin?</Text>
            <Text style={styles.modalText}>
              Piliin muna ang role mo bago magpatuloy sa registration.
            </Text>

            <Pressable
              style={styles.roleOption}
              onPress={() => {
                setRole("mechanic");
                setRolePickerVisible(false);
              }}
            >
              <View style={styles.roleIcon}>
                <Ionicons name="build-outline" size={23} color={colors.amber} />
              </View>
              <View style={styles.roleCopy}>
                <Text style={styles.roleTitle}>Mechanic</Text>
                <Text style={styles.roleDescription}>
                  Tumanggap at mag-manage ng service jobs.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textDim}
              />
            </Pressable>

            <Pressable
              style={styles.roleOption}
              onPress={() => {
                setRole("customer");
                setRolePickerVisible(false);
              }}
            >
              <View style={styles.roleIcon}>
                <Ionicons
                  name="person-outline"
                  size={23}
                  color={colors.amber}
                />
              </View>
              <View style={styles.roleCopy}>
                <Text style={styles.roleTitle}>User</Text>
                <Text style={styles.roleDescription}>
                  Humingi ng mechanic at service assistance.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textDim}
              />
            </Pressable>

            <Pressable
              style={styles.modalBackButton}
              onPress={() => router.back()}
            >
              <Text style={styles.modalBackText}>Back to login</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AuthScreenShell>
  );
}

function LicensePhoto({
  label,
  uri,
  onPress,
}: {
  label: string;
  uri: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.photoButton} onPress={onPress}>
      {uri ? (
        <Image source={{ uri }} style={styles.photoPreview} />
      ) : (
        <Ionicons name="camera-outline" size={28} color={colors.amber} />
      )}
      <View style={styles.photoCopy}>
        <Text style={styles.photoLabel}>{label}</Text>
        <Text style={styles.photoHint}>
          {uri ? "Photo selected" : "Choose photo"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
    </Pressable>
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
    fontSize: 18,
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  reviewText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  footer: {
    marginTop: spacing.lg,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  footerLink: {
    color: colors.amber,
    fontSize: 14,
    fontWeight: "700",
  },
  stepHeader: {
    marginBottom: spacing.md,
  },
  stepLabel: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  stepTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
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
    marginRight: spacing.sm,
  },
  photoCopy: {
    flex: 1,
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
  backStepButton: {
    minHeight: 52,
    minWidth: 112,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: "auto",
  },
  backStepText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  roleModal: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  modalKicker: {
    color: colors.amber,
    fontSize: 11,
    letterSpacing: 1.8,
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  modalText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.lg,
  },
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  roleIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.amber + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  roleCopy: {
    flex: 1,
  },
  roleTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 3,
  },
  roleDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
