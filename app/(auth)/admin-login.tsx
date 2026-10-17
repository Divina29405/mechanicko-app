import { Link, Stack, router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { AuthInput } from "@/components/auth/AuthInput";
import { AuthLogo } from "@/components/auth/AuthLogo";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { ErrorBanner } from "@/components/auth/ErrorBanner";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { ComingSoonModal } from "@/components/ComingSoonModal";
import { useAuth } from "@/contexts/AuthContext";
import { colors, spacing } from "@/lib/theme";
import { validateEmail, validatePassword } from "@/lib/validation";

export default function AdminLoginScreen() {
  const { signInAsMechanic } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);

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
    router.replace("/admin");
  }

  return (
    <>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <AuthScreenShell>
      <View style={styles.loginContent}>
        <Text style={styles.kicker}>MECHANIC</Text>
        <AuthLogo variant="blue" />

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
              fieldStyle={styles.emailField}
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
              fieldStyle={styles.passwordField}
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

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>o</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            style={styles.googleButton}
            onPress={() => setComingSoonVisible(true)}
            disabled={loading}
          >
            <Image
              source={require("../../assets/images/google.png")}
              resizeMode="contain"
              style={styles.googleIcon}
            />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </Pressable>

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

      <ComingSoonModal
        visible={comingSoonVisible}
        onClose={() => setComingSoonVisible(false)}
      />
      </AuthScreenShell>
    </>
  );
}

const styles = StyleSheet.create({
  loginContent: {
    transform: [{ translateY: 35 }],
  },
  kicker: {
    alignSelf: "center",
    color: "#000000",
    fontFamily: "sans-serif",
    fontSize: 15,
    lineHeight: 15,
    letterSpacing: 2.2,
    fontWeight: "800",
    marginBottom: 16,
    transform: [{ translateY: -55 }],
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 50,
    borderWidth: 0,
    marginHorizontal: 0,
    marginTop: -33,
  },
  heading: {
    color: "#2C2F35",
    fontFamily: "sans-serif",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.55,
    fontWeight: "700",
    marginBottom: 3,
    transform: [{ translateY: -10 }],
  },
  sub: {
    color: "#5F6877",
    fontFamily: "sans-serif",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
    transform: [{ translateY: -10 }],
  },
  loginInput: {
    marginBottom: 7,
  },
  loginLabel: {
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 5,
  },
  emailField: {
    transform: [{ translateY: 5 }],
  },
  passwordField: {
    transform: [{ translateY: 5 }],
  },
  loginImageIcon: {
    width: 22,
    height: 22,
    transform: [{ translateX: 14 }],
  },
  loginFieldInput: {
    paddingLeft: 27,
    fontSize: 17,
    paddingVertical: 11,
  },
  loginButtonOffset: {
    transform: [{ translateY: 8 }],
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 12,
    minHeight: 22,
    transform: [{ translateY: 5 }],
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: 1 }],
  },
  checkboxChecked: {
    backgroundColor: "#24439A",
    borderColor: "#24439A",
  },
  checkmark: {
    color: colors.bg,
    fontSize: 13,
    lineHeight: 14,
  },
  rememberText: {
    color: "#475569",
    fontFamily: "sans-serif",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 20,
    marginBottom: 12,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: "#B7BFCC",
    fontSize: 10,
  },
  googleButton: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  googleIcon: {
    width: 22,
    height: 22,
  },
  googleButtonText: {
    color: "#2C2F35",
    fontSize: 14,
    fontWeight: "700",
  },
  footer: {
    marginTop: 17,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  footerText: {
    color: "#727B8A",
    fontFamily: "sans-serif",
    fontSize: 13,
    lineHeight: 18,
  },
  footerLink: {
    color: "#24439A",
    fontFamily: "sans-serif",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  adminLink: {
    alignSelf: "center",
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  adminLinkText: {
    color: "#000000",
    fontFamily: "sans-serif",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  adminArrow: {
    color: "#2C2F35",
    fontSize: 13,
    lineHeight: 13,
  },
});
