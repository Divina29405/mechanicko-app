import { Link, Stack, router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, Image } from "react-native";

import { AuthInput } from "@/components/auth/AuthInput";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { ErrorBanner } from "@/components/auth/ErrorBanner";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { useAuth } from "@/contexts/AuthContext";
import { colors, spacing } from "@/lib/theme";
import { validateEmail, validatePassword } from "@/lib/validation";
import { normalizeText } from "@/lib/typography";

const MECHANIC_REMEMBERED_LOGIN_KEY = "mechanic-remembered-login";

type RememberedMechanicLogin = {
  email: string;
  password: string;
};

async function readRememberedMechanicLogin(): Promise<RememberedMechanicLogin | null> {
  const raw =
    Platform.OS === "web"
      ? typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(MECHANIC_REMEMBERED_LOGIN_KEY)
      : await SecureStore.getItemAsync(MECHANIC_REMEMBERED_LOGIN_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as RememberedMechanicLogin;
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

async function saveRememberedMechanicLogin(email: string, password: string) {
  const value = JSON.stringify({ email: email.trim(), password });
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MECHANIC_REMEMBERED_LOGIN_KEY, value);
    }
    return;
  }
  await SecureStore.setItemAsync(MECHANIC_REMEMBERED_LOGIN_KEY, value);
}

async function clearRememberedMechanicLogin() {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(MECHANIC_REMEMBERED_LOGIN_KEY);
    }
    return;
  }
  await SecureStore.deleteItemAsync(MECHANIC_REMEMBERED_LOGIN_KEY);
}

export default function AdminLoginScreen() {
  const { signInAsMechanic } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);

  useEffect(() => {
    void readRememberedMechanicLogin().then((savedLogin) => {
      if (!savedLogin) return;
      setEmail(savedLogin.email);
      setPassword(savedLogin.password);
      setRememberPassword(true);
    });
  }, []);

  async function submit() {
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setError(null);
    if (nextEmailError || nextPasswordError) return;

    setLoading(true);
    const result = await signInAsMechanic(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    try {
      if (rememberPassword) {
        await saveRememberedMechanicLogin(email, password);
      } else {
        await clearRememberedMechanicLogin();
      }
    } catch {
      setError(
        "Login succeeded, but your remember-me preference could not be saved.",
      );
      return;
    }

    router.replace("/(app)");
  }

  return (
    <>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <AuthScreenShell>
      <View style={styles.loginContent}>
        
        <View style={styles.brandContainer}>
          <Image source={require("../../assets/images/logo.png")} style={styles.brandLogo} resizeMode="contain" />
          <Image source={require("../../assets/images/mechanikotext.png")} style={styles.brandText} resizeMode="contain" />
          <Text style={styles.roleKicker}>MECHANIC LOGIN</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Log in</Text>
          <Text style={styles.sub}>
            Enter your account details to continue.
          </Text>

          <ErrorBanner message={error} />

          <View style={styles.loginInput}>
            <AuthInput
              label="Email"
              icon="mail-outline"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (emailError) setEmailError(validateEmail(value));
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
              onChangeText={(value) => {
                setPassword(value);
                if (passwordError) setPasswordError(validatePassword(value));
              }}
              error={passwordError}
              isPassword
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
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
              onPress={() => void submit()}
              loading={loading}
              variant="login"
            />
          </View>

          <Link href="/(auth)/login" asChild>
            <Pressable style={styles.adminLink}>
              <Text style={styles.adminLinkText}>Log in as Customer</Text>
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
    marginTop: -40,
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