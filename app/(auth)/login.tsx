import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { AuthInput } from "@/components/auth/AuthInput";
import { AuthLogo } from "@/components/auth/AuthLogo";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { ErrorBanner } from "@/components/auth/ErrorBanner";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { useAuth } from "@/contexts/AuthContext";
import { colors, radii, spacing } from "@/lib/theme";
import { validateEmail, validatePassword } from "@/lib/validation";

const REMEMBERED_LOGIN_KEY = "mechaniko-remembered-login";

type RememberedLogin = {
  email: string;
  password: string;
};

async function readRememberedLogin(): Promise<RememberedLogin | null> {
  const raw =
    Platform.OS === "web"
      ? typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(REMEMBERED_LOGIN_KEY)
      : await SecureStore.getItemAsync(REMEMBERED_LOGIN_KEY);

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as RememberedLogin;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.password !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function saveRememberedLogin(email: string, password: string) {
  const value = JSON.stringify({ email: email.trim(), password });
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(REMEMBERED_LOGIN_KEY, value);
    }
    return;
  }
  await SecureStore.setItemAsync(REMEMBERED_LOGIN_KEY, value);
}

async function clearRememberedLogin() {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(REMEMBERED_LOGIN_KEY);
    }
    return;
  }
  await SecureStore.deleteItemAsync(REMEMBERED_LOGIN_KEY);
}

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);

  useEffect(() => {
    void readRememberedLogin().then((savedLogin) => {
      if (!savedLogin) return;
      setEmail(savedLogin.email);
      setPassword(savedLogin.password);
      setRememberPassword(true);
    });
  }, []);

  async function onSubmit() {
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    if (nextEmailError || nextPasswordError) return;

    setLoading(true);
    const { error } = await signIn(email, password);

    if (!error) {
      try {
        if (rememberPassword) {
          await saveRememberedLogin(email, password);
        } else {
          await clearRememberedLogin();
        }
      } catch {
        setFormError(
          "Login succeeded, but your remember-password preference could not be saved.",
        );
      }
    }

    setLoading(false);
    if (error) setFormError(error);
  }

  async function onGoogleSignIn() {
    setFormError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) setFormError(error);
  }

  return (
    <AuthScreenShell>
      <Text style={styles.kicker}>ROADSIDE · SHOP · SERVICE</Text>
      <AuthLogo />

      <View style={styles.card}>
        <Text style={styles.heading}>Log in</Text>
        <Text style={styles.sub}>Enter your account details to continue.</Text>

        <ErrorBanner message={formError} />

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
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />

        <Pressable
          style={styles.rememberRow}
          onPress={() => setRememberPassword((current) => !current)}
          disabled={loading || googleLoading}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rememberPassword }}
        >
          <View
            style={[
              styles.checkbox,
              rememberPassword && styles.checkboxChecked,
            ]}
          >
            {rememberPassword ? (
              <Ionicons name="checkmark" size={16} color={colors.bg} />
            ) : null}
          </View>
          <Text style={styles.rememberText}>Remember me</Text>
        </Pressable>

        <PrimaryButton label="Log in" onPress={onSubmit} loading={loading} />

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>o</Text>
          <View style={styles.divider} />
        </View>

        <Pressable
          style={styles.googleButton}
          onPress={onGoogleSignIn}
          disabled={loading || googleLoading}
        >
          <Ionicons name="logo-google" size={19} color={colors.text} />
          <Text style={styles.googleButtonText}>
            {googleLoading ? "Connecting..." : "Continue with Google"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don&apos;t have an account?</Text>
        <Link href="/(auth)/signup" asChild>
          <Pressable>
            <Text style={styles.footerLink}>Create an account</Text>
          </Pressable>
        </Link>
      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  kicker: {
    alignSelf: "center",
    color: colors.amber,
    fontSize: 11,
    letterSpacing: 2.4,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.lg,
    padding: spacing.md,
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
    marginBottom: spacing.md,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
    minHeight: 30,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  rememberText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textDim,
    fontSize: 13,
  },
  googleButton: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  googleButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    marginTop: spacing.md,
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
});
