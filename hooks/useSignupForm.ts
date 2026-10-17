import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

import {
  type AuthRole,
  type MechanicApplication,
  useAuth,
} from "@/contexts/AuthContext";
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from "@/lib/validation";

export function useSignupForm() {
  const { signUp } = useAuth();
  const { role: roleParam, setup } = useLocalSearchParams<{
    role?: string;
    setup?: string;
  }>();
  const initialRole =
    roleParam === "mechanic" || roleParam === "customer" ? roleParam : null;
  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<AuthRole | null>(initialRole);
  const [rolePickerVisible, setRolePickerVisible] = useState(
    setup !== "complete",
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showAlmostDone, setShowAlmostDone] = useState(false);
  const [step, setStep] = useState(1);
  const [licenseFront, setLicenseFront] = useState<string | null>(null);
  const [licenseBack, setLicenseBack] = useState<string | null>(null);
  const [skills, setSkills] = useState("");
  const [certifications, setCertifications] = useState("");
  const [experience, setExperience] = useState("");
  const isMechanic = role === "mechanic";
  const reopenRolePickerOnFocus = useRef(false);
  const [rolePickerLeaving, setRolePickerLeaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!reopenRolePickerOnFocus.current) return;

      reopenRolePickerOnFocus.current = false;
      setFormError(null);
      setRolePickerLeaving(false);
      setRolePickerVisible(true);
    }, []),
  );

  function continueRoleSelection() {
    if (!role) {
      setFormError("Please tap an account type to proceed.");
      return;
    }
    if (role === "customer") {
      setFormError(null);
      router.push({
        pathname: "/(auth)/signup",
        params: { role: "customer", setup: "complete" },
      });
      return;
    }
    reopenRolePickerOnFocus.current = true;
    setRolePickerLeaving(true);
    setRolePickerVisible(false);
    requestAnimationFrame(() => {
      router.push({ pathname: "/quick-account-setup", params: { role } });
    });
  }

  async function pickLicensePhoto(side: "front" | "back") {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    if (side === "front") setLicenseFront(result.assets[0].uri);
    else setLicenseBack(result.assets[0].uri);
  }

  function nextStep() {
    setFormError(null);
    setStep((currentStep) => Math.min(currentStep + 1, 4));
  }

  async function submitMechanicApplication() {
    const missingFields = [
      ["full name", fullName],
      ["mobile number", mobileNumber],
      ["email address", email],
      ["home address", homeAddress],
      ["skills and specialization", skills],
      ["certifications", certifications],
      ["experience", experience],
    ].find(([, value]) => !value.trim());
    if (missingFields) {
      setFormError(`Kumpletuhin ang ${missingFields[0]} bago isumite.`);
      return;
    }
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    const nextConfirmError = validateConfirmPassword(password, confirm);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    if (nextEmailError || nextPasswordError || nextConfirmError) {
      setFormError("Ayusin muna ang mga error sa account details.");
      return;
    }
    if (!licenseFront || !licenseBack) {
      setFormError(
        "I-upload ang front at back na larawan ng driver's license bago isumite.",
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
      licenseFrontUri: licenseFront,
      licenseBackUri: licenseBack,
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
    setShowAlmostDone(true);
    setInfo(null);
  }

  async function saveAndContinue() {
    setFormError(null);

    const hasCompleteApplication =
      fullName.trim() &&
      mobileNumber.trim() &&
      homeAddress.trim() &&
      email.trim() &&
      password &&
      confirm &&
      skills.trim() &&
      certifications.trim() &&
      experience.trim() &&
      licenseFront &&
      licenseBack;

    if (!hasCompleteApplication) {
      setShowAlmostDone(true);
      return;
    }

    await submitMechanicApplication();
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
    if (!mobileNumber.trim()) setFormError("Ilagay ang mobile number.");
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

  return {
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
    submitMechanicApplication,
    saveAndContinue,
    onSubmit,
  };
}
