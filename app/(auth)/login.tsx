import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthInput } from "@/components/auth/AuthInput";
import { AuthLogo } from "@/components/auth/AuthLogo";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { ErrorBanner } from "@/components/auth/ErrorBanner";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { useAuth } from "@/contexts/AuthContext";
import { colors, radii, spacing } from "@/lib/theme";
import { validateEmail, validatePassword } from "@/lib/validation";

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit() {
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    if (nextEmailError || nextPasswordError) return;

    setLoading(true);
    const { error } = await signIn(email, password);
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
        <Text style={styles.heading}>Mag-login</Text>
        <Text style={styles.sub}>Ilagay ang account mo para magpatuloy.</Text>

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

        <PrimaryButton label="Mag-login" onPress={onSubmit} loading={loading} />

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
            {googleLoading ? "Kumokonekta..." : "Magpatuloy gamit ang Google"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Wala pang account?</Text>
        <Link href="/(auth)/signup" asChild>
          <Pressable>
            <Text style={styles.footerLink}>Gumawa ng account</Text>
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.lg,
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
    minHeight: 52,
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
});
