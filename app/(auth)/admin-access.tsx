import { Link, router, Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AuthInput } from "@/components/auth/AuthInput";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { ErrorBanner } from "@/components/auth/ErrorBanner";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/lib/theme";
import { normalizeText } from "@/lib/typography";
import { validateEmail, validatePassword } from "@/lib/validation";

const REMEMBERED_ADMIN_LOGIN_KEY = "admin-remembered-login";

type RememberedAdminLogin = {
  email: string;
  password: string;
};

async function readRememberedAdminLogin(): Promise<RememberedAdminLogin | null> {
  const raw =
    Platform.OS === "web"
      ? typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(REMEMBERED_ADMIN_LOGIN_KEY)
      : await SecureStore.getItemAsync(REMEMBERED_ADMIN_LOGIN_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "email" in parsed &&
      "password" in parsed &&
      typeof parsed.email === "string" &&
      typeof parsed.password === "string"
    ) {
      return { email: parsed.email, password: parsed.password };
    }
    return null;
  } catch {
    return null;
  }
}

async function saveRememberedAdminLogin(email: string, password: string) {
  const value = JSON.stringify({ email: email.trim(), password });
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(REMEMBERED_ADMIN_LOGIN_KEY, value);
    }
    return;
  }
  await SecureStore.setItemAsync(REMEMBERED_ADMIN_LOGIN_KEY, value);
}

async function clearRememberedAdminLogin() {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(REMEMBERED_ADMIN_LOGIN_KEY);
    }
    return;
  }
  await SecureStore.deleteItemAsync(REMEMBERED_ADMIN_LOGIN_KEY);
}

export default function AdminAccessScreen() {
  const { signInAsAdmin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);

  useEffect(() => {
    void readRememberedAdminLogin()
      .then((savedLogin) => {
        if (!savedLogin) return;
        setEmail(savedLogin.email);
        setPassword(savedLogin.password);
        setRememberPassword(true);
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? `Could not load saved login: ${caught.message}`
            : "Could not load the saved login.",
        );
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
    try {
      const result = await signInAsAdmin(email, password);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (rememberPassword) {
        await saveRememberedAdminLogin(email, password);
      } else {
        await clearRememberedAdminLogin();
      }
      router.replace("/admin");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Admin sign-in failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ animation: "none" }} />
      <AuthScreenShell>
        <View style={styles.loginContent}>
          <View style={styles.brandContainer}>
            <Image
              source={require("../../assets/images/MechanicKo_noBG.png")}
              style={styles.brandImage}
              resizeMode="contain"
            />
            <Text style={styles.roleKicker}>ADMIN ACCESS</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.heading}>Admin log in</Text>
            <Text style={styles.sub}>
              Sign in with an authorized administrator account.
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
              <Pressable style={styles.backLink}>
                <Text style={styles.backLinkText}>Back to customer login</Text>
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
    alignItems: "center",
    marginBottom: 10,
    transform: [{ translateY: -20 }],
  },
  brandImage: {
    width: 240,
    height: 120,
    marginBottom: 10,
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
    paddingBottom: 32,
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
  loginButtonOffset: {
    marginTop: 16,
  },
  backLink: {
    alignItems: "center",
    marginTop: 20,
    minHeight: 44,
    justifyContent: "center",
  },
  backLinkText: {
    color: colors.amber,
    fontFamily: "PlusJakartaSansBold",
    fontSize: normalizeText(14),
  },
});
