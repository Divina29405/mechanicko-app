const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return 'Kailangan ang email.';
  if (!EMAIL_RE.test(value)) return 'Hindi valid ang email.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Kailangan ang password.';
  if (password.length < 6) return 'Hindi dapat mas maikli sa 6 characters.';
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return 'Ulitin ang password.';
  if (password !== confirm) return 'Hindi magkatugma ang password.';
  return null;
}
