import { Link, router, Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { AuthInput } from "@/components/auth/AuthInput";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { ErrorBanner } from "@/components/auth/ErrorBanner";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/lib/theme";
import { validateEmail, validatePassword } from "@/lib/validation";
import { normalizeText } from "@/lib/typography";

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
    setLoading(true);
    const { error } = await signInWithGoogle();
    setLoading(false);
    if (error) {
      setFormError(error);
      return;
    }
    router.replace({
      pathname: "/(app)/motorist-profile",
      params: { setupVehicle: "1" },
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          animation: "slide_from_left",
        }}
      />
      <AuthScreenShell>
      <View style={styles.loginContent}>
        
        <View style={styles.brandContainer}>
          <Image source={require("../../assets/images/logo.png")} style={styles.brandLogo} resizeMode="contain" />
          <Image source={require("../../assets/images/mechanikotext.png")} style={styles.brandText} resizeMode="contain" />
          <Text style={styles.roleKicker}>MOTORIST LOGIN</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Log in</Text>
          <Text style={styles.sub}>
            Enter your account details to continue.
          </Text>

          <ErrorBanner message={formError} />

          <View style={styles.loginInput}>
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
              variant="customer"
              iconImage={require("../../assets/images/email.jpg")}
              iconImageStyle={styles.loginImageIcon}
              labelStyle={styles.loginLabel}
              inputStyle={styles.loginFieldInput}
            />
          </View>
          <View style={styles.loginInput}>
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
              variant="customer"
              iconImage={require("../../assets/images/password.jpg")}
              iconImageStyle={styles.loginImageIcon}
              labelStyle={styles.loginLabel}
              inputStyle={styles.loginFieldInput}
            />
          </View>

          <Pressable
            style={styles.rememberRow}
            onPress={() => setRememberPassword((current) => !current)}
            disabled={loading}
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
                <Text style={styles.checkmark}>✓</Text>
              ) : null}
            </View>
            <Text style={styles.rememberText}>Remember me</Text>
          </Pressable>

          <View style={styles.loginButtonOffset}>
            <PrimaryButton
              label="Log in"
              onPress={onSubmit}
              loading={loading}
              variant="login"
            />
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>o</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            style={styles.googleButton}
            onPress={onGoogleSignIn}
            disabled={loading}
          >
            <Image
              source={require("../../assets/images/google.png")}
              resizeMode="contain"
              style={styles.googleIcon}
            />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </Pressable>

          <Link href="/(auth)/admin-login" asChild>
            <Pressable style={styles.adminLink}>
              <Text style={styles.adminLinkText}>Log in as Mechanic</Text>
              <Text style={styles.adminArrow}>→</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don&apos;t have an account?</Text>
          <Link href="/(auth)/signup" asChild>
            <Pressable>
              <Text style={styles.footerLink}>Create an account</Text>
            </Pressable>
          </Link>
        </View>
      </View>
      </AuthScreenShell>
    </>
  );
}

const styles = StyleSheet.create({
  loginContent: {
    paddingHorizontal: 12,
    transform: [{ translateY: 20 }],
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 10,
    transform: [{ translateY: -20 }]
  },
  brandLogo: {
    width: 80,
    height: 80,
    marginBottom: 12
  },
  brandText: {
    width: 170,
    height: 24,
    tintColor: "#1E3A8A",
    marginBottom: 10
  },
  roleKicker: {
    color: "#64748B",
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(13),
    fontWeight: "800",
    letterSpacing: 2,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: "#DCE3EF",
    shadowColor: "#17213D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
    width: "100%",
  },
  heading: {
    color: "#0F172A",
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(28),
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  sub: {
    color: "#475569",
    fontFamily: "PlusJakartaSans",
    fontSize: normalizeText(15),
    lineHeight: normalizeText(22),
    marginBottom: 24,
  },
  loginInput: {
    marginBottom: 12,
  },
  loginLabel: {
    fontSize: normalizeText(15),
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  loginImageIcon: {
    width: 24,
    height: 24,
    marginLeft: 12,
  },
  loginFieldInput: {
    paddingLeft: 12,
    fontSize: normalizeText(16),
    paddingVertical: 14,
  },
  loginButtonOffset: {
    marginTop: 12,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    marginTop: 8,
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
    backgroundColor: "#24439A",
    borderColor: "#24439A",
  },
  checkmark: {
    color: colors.bg,
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  rememberText: {
    color: "#475569",
    fontFamily: "PlusJakartaSans",
    fontSize: normalizeText(15),
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
    marginBottom: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: "#94A3B8",
    fontSize: normalizeText(14),
    fontWeight: "600",
  },
  googleButton: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleIcon: {
    width: 24,
    height: 24,
  },
  googleButtonText: {
    color: "#0F172A",
    fontSize: normalizeText(16),
    fontWeight: "700",
  },
  footer: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  footerText: {
    color: "#64748B",
    fontFamily: "PlusJakartaSans",
    fontSize: normalizeText(15),
  },
  footerLink: {
    color: "#24439A",
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(15),
  },
  adminLink: {
    alignSelf: "center",
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adminLinkText: {
    color: "#0F172A",
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(15),
  },
  adminArrow: {
    color: "#0F172A",
    fontSize: normalizeText(16),
    fontWeight: "bold",
  },
});