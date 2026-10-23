import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";

import {
  type AuthRole,
  type MechanicApplication,
  useAuth,
} from "@/contexts/AuthContext";
import {
  validateConfirmPassword,
  validateEmail,
  validateFullName,
  validatePhilippineMobileNumber,
  validatePassword,
  validateRequired,
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success] = useState(false);
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
        pathname: "/quick-account-setup",
        params: { role: "customer" },
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
    if (side === "front") {
      setLicenseFront(result.assets[0].uri);
      setFieldErrors((current) => ({ ...current, licenseFront: null }));
    } else {
      setLicenseBack(result.assets[0].uri);
      setFieldErrors((current) => ({ ...current, licenseBack: null }));
    }
  }

  function nextStep() {
    if (!validateStep(step)) return;
    setFormError(null);
    setStep((currentStep) => Math.min(currentStep + 1, 4));
  }

  function validateStep(currentStep: number) {
    const nextErrors: Record<string, string | null> = {};
    if (currentStep === 1) {
      nextErrors.fullName = validateFullName(fullName);
      nextErrors.mobileNumber = validatePhilippineMobileNumber(mobileNumber);
      nextErrors.email = validateEmail(email);
      nextErrors.homeAddress = validateRequired(homeAddress);
      nextErrors.password = validatePassword(password);
      nextErrors.confirm = validateConfirmPassword(password, confirm);
      setEmailError(nextErrors.email);
      setPasswordError(nextErrors.password);
      setConfirmError(nextErrors.confirm);
    } else if (currentStep === 3) {
      nextErrors.skills = validateRequired(skills);
    } else if (currentStep === 2) {
      nextErrors.licenseFront = licenseFront
        ? null
        : "This field is required.";
      nextErrors.licenseBack = licenseBack ? null : "This field is required.";
    } else if (currentStep === 4) {
      nextErrors.certifications = validateRequired(certifications);
      nextErrors.experience = validateRequired(experience);
    }
    setFieldErrors(nextErrors);
    const hasErrors = Object.values(nextErrors).some(Boolean);
    if (hasErrors) {
      setFormError("Please correct the highlighted fields before continuing.");
    }
    return !hasErrors;
  }

  async function submitMechanicApplication() {
    const nextErrors: Record<string, string | null> = {
      fullName: validateFullName(fullName),
      mobileNumber: validatePhilippineMobileNumber(mobileNumber),
      email: validateEmail(email),
      homeAddress: validateRequired(homeAddress),
      password: validatePassword(password),
      confirm: validateConfirmPassword(password, confirm),
      licenseFront: licenseFront ? null : "This field is required.",
      licenseBack: licenseBack ? null : "This field is required.",
      skills: validateRequired(skills),
      certifications: validateRequired(certifications),
      experience: validateRequired(experience),
    };
    setEmailError(nextErrors.email);
    setPasswordError(nextErrors.password);
    setConfirmError(nextErrors.confirm);
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setFormError("Please correct the highlighted fields before continuing.");
      return;
    }
    setLoading(true);
    const application: MechanicApplication = {
      mobileNumber,
      homeAddress,
      skills,
      certifications,
      experience,
      licenseFrontUri: licenseFront!,
      licenseBackUri: licenseBack!,
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
    const nextErrors = {
      fullName: validateFullName(fullName),
      mobileNumber: validatePhilippineMobileNumber(mobileNumber),
      email: validateEmail(email),
      password: validatePassword(password),
      confirm: validateConfirmPassword(password, confirm),
    };
    setFieldErrors(nextErrors);
    setEmailError(nextErrors.email);
    setPasswordError(nextErrors.password);
    setConfirmError(nextErrors.confirm);
    if (Object.values(nextErrors).some(Boolean)) {
      setFormError("Please correct the highlighted fields before continuing.");
      return;
    }
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);
    setFormError(null);
    setInfo(null);
    setShowAlmostDone(true);
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
    submitMechanicApplication,
    saveAndContinue,
    onSubmit,
  };
}
