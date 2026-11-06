import { router } from "expo-router";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";

import { ComingSoonModal } from "@/components/ComingSoonModal";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { MechanicText as Text } from "@/components/mechanic/MechanicText";
import { useAuth } from "@/contexts/AuthContext";
import { useMechanic } from "@/contexts/MechanicContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { getPreferredMapApp, savePreferredMapApp, type PreferredMapApp } from "@/lib/mechanicPreferences";
import { getMechanicThemeColors, spacing } from "@/lib/theme";
import { normalizeText } from "@/lib/typography";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";

const MECHANIC_RADIUS_STORAGE_KEY = "mechanic_search_radius_km";

type MechanicSidebarContextValue = {
  openSidebar: () => void;
};

const MechanicSidebarContext =
  createContext<MechanicSidebarContextValue | null>(null);

export function MechanicSidebarProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const slideProgress = useRef(new Animated.Value(0)).current;

  const openSidebar = () => {
    slideProgress.setValue(0);
    setVisible(true);
  };
  const closeSidebar = (onClosed?: () => void) => {
    Animated.timing(slideProgress, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setVisible(false);
      onClosed?.();
    });
  };

  return (
    <MechanicSidebarContext.Provider
      value={{ openSidebar }}
    >
      {children}
      <MechanicSidebarModal
        visible={visible}
        settingsVisible={settingsVisible}
        slideProgress={slideProgress}
        onOpen={() => {
          Animated.timing(slideProgress, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }}
        onClose={closeSidebar}
        onShowHelp={() => setComingSoonVisible(true)}
        onShowSettings={() => setSettingsVisible(true)}
        onCloseSettings={() => setSettingsVisible(false)}
      />
      <ComingSoonModal
        visible={comingSoonVisible}
        onClose={() => setComingSoonVisible(false)}
      />
    </MechanicSidebarContext.Provider>
  );
}

function MechanicSidebarModal({
  visible,
  settingsVisible,
  slideProgress,
  onOpen,
  onClose,
  onShowHelp,
  onShowSettings,
  onCloseSettings,
}: {
  visible: boolean;
  settingsVisible: boolean;
  slideProgress: Animated.Value;
  onOpen: () => void;
  onClose: (onClosed?: () => void) => void;
  onShowHelp: () => void;
  onShowSettings: () => void;
  onCloseSettings: () => void;
}) {
  const { colors: themeColors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const colors = getMechanicThemeColors(themeColors);
  const { session } = useAuth();
  const { avatarUrl } = useMechanic();
  const name =
    (typeof session?.user.user_metadata?.full_name === "string" &&
    session.user.user_metadata.full_name.trim()) ||
    session?.user.email?.split("@")[0] ||
    "Mekaniko";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => onClose()}
      onShow={onOpen}
    >
      <View style={styles.overlay}>
          <Animated.View
          style={[
            styles.panel,
            { backgroundColor: themeColors.card },
            {
              transform: [
                {
                  translateX: slideProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-300, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            style={styles.profile}
            onPress={() =>
              onClose(() => router.push("/(app)/profile"))
            }
            accessibilityRole="button"
            accessibilityLabel="Open mechanic profile"
          >
            <ProfileAvatar
              uri={avatarUrl}
              name={name}
              size={50}
              backgroundColor={colors.amberSoft}
            />
            <Text
              style={[styles.name, { color: themeColors.text }]}
              numberOfLines={2}
            >
              {name}
            </Text>
          </Pressable>
          <View
            style={[styles.divider, { backgroundColor: themeColors.border }]}
          />
          <Pressable
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={onShowHelp}
            accessibilityRole="button"
          >
            <Ionicons
              name="help-circle-outline"
              size={23}
              color={themeColors.text}
            />
            <Text style={[styles.menuText, { color: themeColors.text }]}>Help</Text>
            <Ionicons
              name="chevron-forward"
              size={19}
              color={themeColors.textMuted}
            />
          </Pressable>
          <Pressable
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={onShowSettings}
            accessibilityRole="button"
            accessibilityLabel="Open mechanic settings"
          >
            <Ionicons
              name="settings-outline"
              size={23}
              color={themeColors.text}
            />
            <Text style={[styles.menuText, { color: themeColors.text }]}>Settings</Text>
            <Ionicons
              name="chevron-forward"
              size={19}
              color={themeColors.textMuted}
            />
          </Pressable>
          </Animated.View>
          <Pressable
            style={styles.dismiss}
            onPress={() => onClose()}
            accessibilityRole="button"
            accessibilityLabel="Close profile menu"
          />
          <MechanicSettingsModal
            visible={settingsVisible}
            insets={insets}
            onClose={onCloseSettings}
          />
      </View>
    </Modal>
  );
}

function MechanicSettingsModal({
  visible,
  insets,
  onClose,
}: {
  visible: boolean;
  insets: { top: number; bottom: number };
  onClose: () => void;
}) {
  const { colors: themeColors, isDarkMode, toggleTheme, language, setLanguage } =
    useAppTheme();
  const colors = getMechanicThemeColors(themeColors);
  const { session } = useAuth();
  const [radius, setRadius] = useState(10);
  const [preferredMapApp, setPreferredMapApp] =
    useState<PreferredMapApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [securityVisible, setSecurityVisible] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !visible) return;
    let active = true;
    void SecureStore.getItemAsync(`${MECHANIC_RADIUS_STORAGE_KEY}_${userId}`)
      .then((storedRadius) => {
        const parsed = Number(storedRadius);
        if (active && [5, 10, 15].includes(parsed)) setRadius(parsed);
      })
      .catch((loadError) => {
        console.warn("Could not load mechanic search radius:", loadError);
        if (active) setError("Could not load your search radius. Please try again.");
      });
    void getPreferredMapApp(userId)
      .then((app) => {
        if (active) setPreferredMapApp(app);
      })
      .catch((loadError) => {
        console.warn("Could not load preferred map app:", loadError);
        if (active) setError("Could not load your map preference. Please try again.");
      });
    return () => {
      active = false;
    };
  }, [session?.user.id, visible]);

  async function saveRadius(nextRadius: number) {
    const userId = session?.user.id;
    if (!userId) return;
    setError(null);
    try {
      await SecureStore.setItemAsync(
        `${MECHANIC_RADIUS_STORAGE_KEY}_${userId}`,
        String(nextRadius),
      );
      setRadius(nextRadius);
    } catch (saveError) {
      console.warn("Could not save mechanic search radius:", saveError);
      setError("Could not save your search radius. Please try again.");
    }
  }

  async function saveMapApp(app: PreferredMapApp) {
    const userId = session?.user.id;
    if (!userId) return;
    setError(null);
    try {
      await savePreferredMapApp(userId, app);
      setPreferredMapApp(app);
    } catch (saveError) {
      console.warn("Could not save preferred map app:", saveError);
      setError("Could not save your map preference. Please try again.");
    }
  }

  async function updatePassword() {
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
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated successfully.");
    } catch (updateError) {
      console.warn("Could not update mechanic password:", updateError);
      setPasswordError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update password. Please try again.",
      );
    } finally {
      setPasswordUpdating(false);
    }
  }

  return (
    <>
      {visible ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: themeColors.bg },
          ]}
        >
          <StatusBar style={isDarkMode ? "light" : "dark"} />
          <View
            style={[
              styles.settingsScreen,
              {
                backgroundColor: themeColors.bg,
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
              },
            ]}
          >
          <View
            style={[
              styles.settingsHeader,
              {
                backgroundColor: themeColors.card,
                borderBottomColor: themeColors.border,
              },
            ]}
          >
            <Pressable
              onPress={onClose}
              style={styles.settingsBackButton}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Ionicons name="arrow-back" size={24} color={themeColors.text} />
            </Pressable>
            <Text style={[styles.settingsTitle, { color: themeColors.text }]}>
              Settings & Preferences
            </Text>
          </View>
          <ScrollView
            contentContainerStyle={styles.settingsContent}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.settingsPanel,
                {
                  backgroundColor: themeColors.card,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.settingsRow,
                  { borderBottomColor: themeColors.border },
                ]}
              >
                <Ionicons
                  name="moon-outline"
                  size={24}
                  color={themeColors.primary}
                  style={styles.settingsRowIcon}
                />
                <View style={styles.settingsRowCopy}>
                  <Text style={[styles.settingsRowTitle, { color: themeColors.text }]}>
                    Dark Mode
                  </Text>
                  <Text style={[styles.settingsRowHint, { color: themeColors.textMuted }]}>
                    Use a darker appearance
                  </Text>
                </View>
                <Switch
                  value={isDarkMode}
                  onValueChange={toggleTheme}
                  trackColor={{ false: themeColors.border, true: themeColors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View
                style={[
                  styles.settingsRow,
                  styles.settingsRadiusRow,
                  { borderBottomColor: themeColors.border },
                ]}
              >
                <Ionicons
                  name="navigate-outline"
                  size={24}
                  color={themeColors.primary}
                  style={styles.settingsRowIcon}
                />
                <View style={styles.settingsRowCopy}>
                  <Text style={[styles.settingsRowTitle, { color: themeColors.text }]}>
                    Mechanic Search Radius
                  </Text>
                  <Text style={[styles.settingsRowHint, { color: themeColors.textMuted }]}>
                    Show service requests within {radius} km
                  </Text>
                  <View style={styles.settingsRadiusOptions}>
                    {[5, 10, 15].map((value) => {
                      const selected = radius === value;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => void saveRadius(value)}
                          style={[
                            styles.settingsRadiusOption,
                            {
                              backgroundColor: selected
                                ? themeColors.primary
                                : themeColors.card,
                              borderColor: selected
                                ? themeColors.primary
                                : themeColors.border,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Set mechanic search radius to ${value} kilometers`}
                        >
                          <Text
                            style={[
                              styles.settingsRadiusOptionText,
                              { color: selected ? "#FFFFFF" : themeColors.text },
                            ]}
                          >
                            {value} km
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
              <SettingsChoiceSection
                icon="map-outline"
                title="Preferred map app"
                subtitle="Choose which app opens directions"
                options={[
                  ["google_maps", "Google Maps"],
                  ["waze", "Waze"],
                ]}
                selected={preferredMapApp}
                onSelect={(value) => void saveMapApp(value as PreferredMapApp)}
                colors={themeColors}
              />
              <SettingsChoiceSection
                icon="globe-outline"
                title="Language"
                options={[
                  ["en", "English"],
                  ["fil", "Filipino"],
                ]}
                selected={language}
                onSelect={(value) => setLanguage(value as "en" | "fil")}
                colors={themeColors}
              />
              <Pressable
                onPress={() => {
                  setPasswordError(null);
                  setPasswordSuccess(null);
                  setSecurityVisible(true);
                }}
                style={[styles.settingsRow, { borderBottomWidth: 0 }]}
                accessibilityRole="button"
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={23}
                  color={themeColors.primary}
                  style={styles.settingsRowIcon}
                />
                <View style={styles.settingsRowCopy}>
                  <Text style={[styles.settingsRowTitle, { color: themeColors.text }]}>
                    Account security
                  </Text>
                  <Text style={[styles.settingsRowHint, { color: themeColors.textMuted }]}>
                    Manage your password and sign-in
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={19}
                  color={themeColors.textMuted}
                />
              </Pressable>
            </View>
            {error ? (
              <Text style={[styles.settingsError, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}
          </ScrollView>
          </View>
        </View>
      ) : null}
      <Modal
        visible={securityVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSecurityVisible(false)}
      >
        <View style={styles.securityOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSecurityVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close account security"
          />
          <View
            style={[
              styles.securityCard,
              {
                backgroundColor: themeColors.card,
                borderColor: themeColors.border,
              },
            ]}
          >
            <View style={styles.securityHeader}>
              <Text style={[styles.securityTitle, { color: themeColors.text }]}>
                Account security
              </Text>
              <Pressable
                onPress={() => setSecurityVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={themeColors.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.securityHint, { color: themeColors.textMuted }]}>
              Update your sign-in password
            </Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              placeholderTextColor={themeColors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              style={[
                styles.securityInput,
                {
                  backgroundColor: themeColors.input,
                  borderColor: themeColors.border,
                  color: themeColors.text,
                },
              ]}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={themeColors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              style={[
                styles.securityInput,
                {
                  backgroundColor: themeColors.input,
                  borderColor: themeColors.border,
                  color: themeColors.text,
                },
              ]}
            />
            {passwordError ? (
              <Text style={[styles.securityMessage, { color: colors.error }]}>
                {passwordError}
              </Text>
            ) : null}
            {passwordSuccess ? (
              <Text style={[styles.securityMessage, { color: colors.success }]}>
                {passwordSuccess}
              </Text>
            ) : null}
            <Pressable
              onPress={() => void updatePassword()}
              disabled={passwordUpdating}
              style={[
                styles.securitySubmit,
                { backgroundColor: themeColors.primary },
                passwordUpdating && styles.securitySubmitDisabled,
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
    </>
  );
}

function SettingsChoiceSection({
  icon,
  title,
  subtitle,
  options,
  selected,
  onSelect,
  colors,
}: {
  icon: "map-outline" | "globe-outline";
  title: string;
  subtitle?: string;
  options: readonly (readonly [string, string])[];
  selected: string | null;
  onSelect: (value: string) => void;
  colors: ReturnType<typeof useAppTheme>["colors"];
}) {
  return (
    <View style={[styles.settingsPreferenceSection, { borderBottomColor: colors.border }]}>
      <View style={styles.settingsPreferenceHeading}>
        <Ionicons name={icon} size={23} color={colors.primary} />
        <View style={styles.settingsRowCopy}>
          <Text style={[styles.settingsRowTitle, { color: colors.text }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.settingsRowHint, { color: colors.textMuted }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.settingsChoiceOptions}>
        {options.map(([value, label]) => {
          const isSelected = selected === value;
          return (
            <Pressable
              key={value}
              onPress={() => onSelect(value)}
              style={[
                styles.settingsChoiceOption,
                {
                  backgroundColor: isSelected ? colors.primary : colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.settingsChoiceOptionText,
                  { color: isSelected ? "#FFFFFF" : colors.text },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function useMechanicSidebar() {
  const context = useContext(MechanicSidebarContext);
  if (!context) {
    throw new Error(
      "useMechanicSidebar must be used within a MechanicSidebarProvider",
    );
  }
  return context;
}

export function useOptionalMechanicSidebar() {
  return useContext(MechanicSidebarContext);
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.52)",
  },
  panel: {
    width: "65%",
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  name: {
    flex: 1,
    fontSize: normalizeText(18),
    fontWeight: "800",
  },
  divider: { height: 1, marginVertical: spacing.md },
  menuItem: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
  },
  menuText: {
    flex: 1,
    fontSize: normalizeText(17),
    fontWeight: "700",
  },
  dismiss: { flex: 1 },
  settingsScreen: { flex: 1 },
  settingsHeader: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  settingsBackButton: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsTitle: { fontSize: normalizeText(20), fontWeight: "800" },
  settingsContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  settingsPanel: {
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: 16,
  },
  settingsRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  settingsRowIcon: { marginRight: spacing.xs },
  settingsRowCopy: { flex: 1 },
  settingsRowTitle: {
    fontSize: normalizeText(16),
    lineHeight: normalizeText(22),
    fontWeight: "700",
  },
  settingsRowHint: {
    fontSize: normalizeText(13),
    lineHeight: normalizeText(18),
    marginTop: 2,
  },
  settingsRadiusRow: {
    alignItems: "flex-start",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  settingsRadiusOptions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  settingsRadiusOption: {
    minWidth: 64,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsRadiusOptionText: {
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  settingsPreferenceSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  settingsPreferenceHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  settingsChoiceOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginLeft: 31,
    marginTop: spacing.sm,
  },
  settingsChoiceOption: {
    minHeight: 38,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsChoiceOptionText: {
    fontSize: normalizeText(14),
    fontWeight: "800",
  },
  settingsError: {
    fontSize: normalizeText(14),
    marginTop: spacing.sm,
  },
  securityOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: "rgba(16, 24, 40, 0.56)",
  },
  securityCard: {
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: 20,
  },
  securityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  securityTitle: { fontSize: normalizeText(20), fontWeight: "800" },
  securityHint: {
    fontSize: normalizeText(14),
    lineHeight: normalizeText(20),
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  securityInput: {
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: normalizeText(15),
    marginTop: spacing.sm,
  },
  securityMessage: {
    fontSize: normalizeText(13),
    lineHeight: normalizeText(19),
    marginTop: spacing.sm,
  },
  securitySubmit: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    marginTop: spacing.md,
  },
  securitySubmitDisabled: { opacity: 0.6 },
  securitySubmitText: {
    color: "#FFFFFF",
    fontSize: normalizeText(15),
    fontWeight: "800",
  },
});
