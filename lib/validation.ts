const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FULL_NAME_RE = /^\p{L}+(?:[ .'-]\p{L}+)+$/u;
const PH_MOBILE_RE = /^(?:\+63|0)9\d{9}$/;

export function validateRequired(value: string): string | null {
  return value.trim() ? null : "This field is required.";
}

export function validateFullName(fullName: string): string | null {
  const value = fullName.trim().replace(/\s+/g, " ");
  if (!value) return "This field is required.";
  if (!FULL_NAME_RE.test(value)) {
    return "Please enter a valid full name.";
  }
  return null;
}

export function validatePhilippineMobileNumber(value: string): string | null {
  const normalized = value.replace(/[\s()-]/g, "");
  if (!normalized) return "This field is required.";
  if (!PH_MOBILE_RE.test(normalized)) {
    return "Please enter a valid Philippine mobile number.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return 'Email is required.';
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password.trim()) return "This field is required.";
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm.trim()) return "This field is required.";
  if (password !== confirm) return 'Passwords do not match.';
  return null;
}
