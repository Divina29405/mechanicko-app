import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MechanicText as Text, translateMechanicValue } from "@/components/mechanic/MechanicText";
import { useAppTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { normalizeText } from "@/lib/typography";

const MOTORIST_RADIUS_KEY = "motorist_search_radius_km";

export default function MotoristSettingsScreen() {
  const { colors, language, setLanguage } = useAppTheme();
  const [searchRadius, setSearchRadius] = useState(10);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [securityVisible, setSecurityVisible] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(MOTORIST_RADIUS_KEY)
      .then((storedRadius) => {
        const parsedRadius = Number(storedRadius);
        if (active && [5, 10, 15].includes(parsedRadius)) {
          setSearchRadius(parsedRadius);
        }
      })
      .catch((error) => {
        console.warn("Could not load motorist search radius:", error);
        if (active) {
          setSettingsError("Could not load your search radius. Please try again.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const updateSearchRadius = async (radius: number) => {
    setSettingsError(null);
    try {
      await SecureStore.setItemAsync(MOTORIST_RADIUS_KEY, String(radius));
      setSearchRadius(radius);
    } catch (error) {
      console.warn("Could not save motorist search radius:", error);
      setSettingsError("Could not save your search radius. Please try again.");
    }
  };

  const updatePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated successfully.");
    } catch (error) {
      console.warn("Could not update motorist password:", error);
      setPasswordError(
        error instanceof Error
          ? error.message
          : "Unable to update password. Please try again.",
      );
    } finally {
      setPasswordUpdating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          onPress={() => router.replace("/(app)/motorist-profile")}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to profile"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          Settings & Preferences
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            style={[styles.row, { borderBottomColor: colors.border }]}
            onPress={() => router.push("/(app)/payment-methods")}
            accessibilityRole="button"
          >
            <Ionicons name="card-outline" size={24} color={colors.primary} style={styles.rowIcon} />
            <View style={styles.rowCopy}>
              <Text style={[styles.rowText, { color: colors.text }]}>Payment Method</Text>
            </View>
            <Ionicons name="chevron-forward" size={21} color={colors.primary} />
          </Pressable>

          <View style={[styles.preferenceSection, { borderBottomColor: colors.border }]}>
            <View style={styles.preferenceHeading}>
              <Ionicons name="globe-outline" size={24} color={colors.primary} style={styles.rowIcon} />
              <View style={styles.rowCopy}>
                <Text style={[styles.rowText, { color: colors.text }]}>Language</Text>
              </View>
            </View>
            <View style={styles.choiceOptions}>
              {([
                ["en", "English"],
                ["fil", "Filipino"],
              ] as const).map(([nextLanguage, label]) => {
                const selected = language === nextLanguage;
                return (
                  <Pressable
                    key={nextLanguage}
                    onPress={() => setLanguage(nextLanguage)}
                    style={[
                      styles.choiceOption,
                      {
                        backgroundColor: selected ? colors.primary : colors.card,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.choiceText, { color: selected ? "#FFFFFF" : colors.text }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            style={[styles.row, { borderBottomColor: colors.border }]}
            onPress={() => {
              setPasswordError(null);
              setPasswordSuccess(null);
              setSecurityVisible(true);
            }}
            accessibilityRole="button"
          >
            <Ionicons name="shield-checkmark-outline" size={24} color={colors.primary} style={styles.rowIcon} />
            <View style={styles.rowCopy}>
              <Text style={[styles.rowText, { color: colors.text }]}>Account security</Text>
              <Text style={[styles.rowHint, { color: colors.textMuted }]}>Manage your password and sign-in</Text>
            </View>
            <Ionicons name="chevron-forward" size={21} color={colors.primary} />
          </Pressable>

          <View style={[styles.radiusRow, { borderBottomColor: colors.border }]}>
            <Ionicons name="radio-outline" size={24} color={colors.primary} style={styles.rowIcon} />
            <View style={styles.rowCopy}>
              <Text style={[styles.rowText, { color: colors.text }]}>Mechanic Search Radius</Text>
              <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                Show mechanics within {searchRadius} km
              </Text>
              <View style={styles.radiusOptions}>
                {[5, 10, 15].map((radius) => {
                  const selected = searchRadius === radius;
                  return (
                    <Pressable
                      key={radius}
                      style={[
                        styles.radiusOption,
                        {
                          backgroundColor: selected ? colors.primary : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => void updateSearchRadius(radius)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.radiusOptionText, { color: selected ? "#FFFFFF" : colors.text }]}>
                        {radius} km
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
        {settingsError ? (
          <Text style={[styles.error, { color: "#D64545" }]}>
            {translateMechanicValue(settingsError, language)}
          </Text>
        ) : null}
      </ScrollView>

      <Modal
        visible={securityVisible}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => {
          if (!passwordUpdating) setSecurityVisible(false);
        }}
      >
        <View style={styles.securityOverlay}>
          <View style={[styles.securityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.securityHeader}>
              <Text style={[styles.securityTitle, { color: colors.text }]}>Account security</Text>
              <Pressable
                onPress={() => setSecurityVisible(false)}
                disabled={passwordUpdating}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.rowHint, styles.securityHint, { color: colors.textMuted }]}>
              Update your sign-in password
            </Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={translateMechanicValue("New password", language)}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              style={[styles.securityInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={translateMechanicValue("Confirm new password", language)}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              style={[styles.securityInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
            />
            {passwordError ? (
              <Text style={[styles.securityMessage, { color: "#D64545" }]}>
                {translateMechanicValue(passwordError, language)}
              </Text>
            ) : null}
            {passwordSuccess ? (
              <Text style={[styles.securityMessage, { color: "#16803C" }]}>
                {translateMechanicValue(passwordSuccess, language)}
              </Text>
            ) : null}
            <Pressable
              onPress={() => void updatePassword()}
              disabled={passwordUpdating}
              style={[
                styles.securitySubmit,
                { backgroundColor: colors.primary },
                passwordUpdating && styles.disabled,
              ]}
            >
              {passwordUpdating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.securitySubmitText}>Update password</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 64,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, marginLeft: 12, fontSize: normalizeText(20), fontWeight: "800" },
  headerSpacer: { width: 44 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  panel: { marginTop: 24, borderRadius: 12, overflow: "hidden", borderWidth: 1 },
  row: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    borderBottomWidth: 1,
  },
  rowIcon: { width: 30, height: 30, marginRight: 18, textAlign: "center" },
  rowCopy: { flex: 1, minHeight: 30, justifyContent: "center" },
  rowText: { fontSize: normalizeText(17), lineHeight: normalizeText(24), fontWeight: "700" },
  rowHint: { fontSize: normalizeText(14), lineHeight: normalizeText(22), marginTop: 2 },
  radiusRow: {
    minHeight: 100,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  radiusOptions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  radiusOption: {
    minWidth: 64,
    minHeight: 38,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  radiusOptionText: { fontSize: normalizeText(14), fontWeight: "800" },
  preferenceSection: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  preferenceHeading: { flexDirection: "row", alignItems: "center" },
  choiceOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginLeft: 48,
    marginTop: 12,
  },
  choiceOption: {
    minWidth: 100,
    minHeight: 40,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: { fontSize: normalizeText(14), fontWeight: "700" },
  error: { marginTop: 12, fontSize: normalizeText(14) },
  securityOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(16, 24, 40, 0.56)",
  },
  securityCard: { padding: 20, borderWidth: 1, borderRadius: 16 },
  securityHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  securityTitle: { fontSize: normalizeText(20), fontWeight: "800" },
  securityHint: { marginTop: 6, marginBottom: 10 },
  securityInput: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: normalizeText(15),
    marginTop: 10,
  },
  securityMessage: { fontSize: normalizeText(13), lineHeight: normalizeText(19), marginTop: 8 },
  securitySubmit: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    marginTop: 16,
  },
  securitySubmitText: { color: "#FFFFFF", fontSize: normalizeText(15), fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
