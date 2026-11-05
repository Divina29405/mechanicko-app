import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  colors as adminPalette,
  getMechanicThemeColors,
  radii,
  spacing,
} from "@/lib/theme";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  validateEmail,
  validateFullName,
  validatePassword,
} from "@/lib/validation";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_path: string | null;
  role: "admin" | "mechanic" | "customer";
  application_status: "pending" | "approved" | "rejected";
  skills: string | null;
  experience: string | null;
  created_at: string;
};

type UserRole = Profile["role"];
type AdminColors = ReturnType<typeof getMechanicThemeColors>;
type AdminStyles = ReturnType<typeof createStyles>;

const avatarUrlCache = new Map<string, { url: string; expiresAt: number }>();
const avatarUrlRequests = new Map<string, Promise<string | null>>();

function getCachedAvatarUrl(path: string | null) {
  if (!path) return null;
  const cached = avatarUrlCache.get(path);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    avatarUrlCache.delete(path);
    return null;
  }
  return cached.url;
}

function loadAvatarUrl(path: string): Promise<string | null> {
  const cachedUrl = getCachedAvatarUrl(path);
  if (cachedUrl) return Promise.resolve(cachedUrl);

  const existingRequest = avatarUrlRequests.get(path);
  if (existingRequest) return existingRequest;

  const request = supabase.storage
    .from("mechanic-avatars")
    .createSignedUrl(path, 60 * 60)
    .then(({ data, error }) => {
      if (error) {
        console.warn("Admin user avatar load failed:", error.message);
        return null;
      }
      avatarUrlCache.set(path, {
        url: data.signedUrl,
        expiresAt: Date.now() + 55 * 60 * 1000,
      });
      return data.signedUrl;
    })
    .finally(() => {
      avatarUrlRequests.delete(path);
    });

  avatarUrlRequests.set(path, request);
  return request;
}

async function getAdminFunctionError(
  error: Awaited<
    ReturnType<typeof supabase.functions.invoke>
  >["error"],
): Promise<string> {
  const context = error?.context;
  if (context instanceof Response) {
    const body: unknown = await context.clone().json().catch(async () => {
      const text = await context.clone().text().catch(() => "");
      return text ? { message: text } : null;
    });
    if (
      typeof body === "object" &&
      body !== null &&
      ("error" in body || "message" in body)
    ) {
      const message =
        "error" in body && typeof body.error === "string"
          ? body.error
          : "message" in body && typeof body.message === "string"
            ? body.message
            : null;
      if (message) {
        if (context.status === 404) {
          return `${message} If the admin-users function is not deployed yet, deploy it with: npx supabase functions deploy admin-users`;
        }
        return message;
      }
    }
    return `User management request failed (HTTP ${context.status}).`;
  }
  return error?.message ?? "The user management request failed.";
}

type Application = {
  id: string;
  email: string | null;
  full_name: string;
  mobile_number: string | null;
  skills: string | null;
  experience: string | null;
  certifications: string | null;
  home_address: string | null;
  license_front_path: string | null;
  license_back_path: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  source?: "applications" | "profiles";
};

export default function AdminDashboard() {
  const { session, signOut } = useAuth();
  const {
    colors: themeColors,
    isDarkMode,
    toggleTheme,
  } = useAppTheme();
  const colors = useMemo(
    () => ({
      ...getMechanicThemeColors(themeColors),
      amber: adminPalette.amber,
    }),
    [themeColors],
  );
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 720;
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [sidebarProgress] = useState(() => new Animated.Value(0));
  const [signingOut, setSigningOut] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [selectedUserRole, setSelectedUserRole] = useState<UserRole | null>(
    null,
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [userFormMode, setUserFormMode] = useState<"invite" | "edit" | null>(
    null,
  );
  const [formProfile, setFormProfile] = useState<Profile | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("customer");
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [userActionError, setUserActionError] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProfiles(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const [{ data, error: queryError }, applicationsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,email,full_name,avatar_path,role,application_status,skills,experience,created_at")
          .order("created_at", { ascending: false }),
        supabase.rpc("admin_list_mechanic_applications"),
      ]);
      const nextProfiles = (data ?? []) as Profile[];
      if (!queryError) setProfiles(nextProfiles);
      if (applicationsResult.error) {
        const legacyApplications = nextProfiles
          .filter(
            (profile) =>
              profile.role === "mechanic" &&
              profile.application_status === "pending",
          )
          .map(
            (profile): Application => ({
              id: profile.id,
              email: profile.email,
              full_name: profile.full_name || "Unnamed mechanic",
              mobile_number: null,
              skills: profile.skills,
              experience: profile.experience,
              certifications: null,
              home_address: null,
              license_front_path: null,
              license_back_path: null,
              status: "pending",
              submitted_at: profile.created_at,
              source: "profiles",
            }),
          );
        setApplications(legacyApplications);
        setError(
          queryError?.message ??
            `Applications table is not available yet: ${applicationsResult.error.message}`,
        );
      } else {
        setApplications(
          ((applicationsResult.data ?? []) as Application[]).map((application) => ({
            ...application,
            source: "applications",
          })),
        );
        setError(queryError?.message ?? null);
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not load admin data.";
      setError(message);
      console.error("Admin dashboard data load failed:", caught);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    // Load the dashboard data after the screen mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfiles();
  }, []);

  async function updateApplication(application: Application, status: "approved" | "rejected") {
    if (application.source === "profiles") {
      const { error: legacyError } = await supabase
        .from("profiles")
        .update({ application_status: status })
        .eq("id", application.id);
      if (legacyError) {
        setError(legacyError.message);
        return;
      }
      await loadProfiles(false);
      return;
    }

    const { error: updateError } = await supabase.rpc(
      "admin_review_mechanic_application",
      { application_id: application.id, next_status: status },
    );
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await loadProfiles(false);
  }

  function openInviteForm() {
    setSelectedUserRole(null);
    setFormProfile(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole(selectedUserRole ?? "customer");
    setUserFormError(null);
    setUserActionError(null);
    setUserFormMode("invite");
  }

  function openEditForm(profile: Profile) {
    setSelectedUserRole(null);
    setFormProfile(profile);
    setFormName(profile.full_name ?? "");
    setFormEmail(profile.email ?? "");
    setFormRole(profile.role);
    setUserFormError(null);
    setUserActionError(null);
    setUserFormMode("edit");
  }

  async function submitUserForm() {
    const mode = userFormMode;
    if (!mode) return;
    if (mode === "edit" && !formProfile) {
      setUserFormError("Select a user profile to edit.");
      return;
    }

    const nameError = validateFullName(formName);
    const emailError =
      mode === "invite" ? validateEmail(formEmail) : null;
    const passwordError =
      mode === "invite" ? validatePassword(formPassword) : null;
    if (nameError || emailError || passwordError) {
      setUserFormError(nameError ?? emailError ?? passwordError);
      return;
    }

    setSavingUser(true);
    setUserFormError(null);
    try {
      const body =
        mode === "invite"
          ? {
              action: "create",
              email: formEmail.trim().toLowerCase(),
              fullName: formName.trim().replace(/\s+/g, " "),
              password: formPassword,
              role: formRole,
            }
          : {
              action: "update",
              userId: formProfile?.id,
              fullName: formName.trim().replace(/\s+/g, " "),
            };
      const { error: functionError } = await supabase.functions.invoke(
        "admin-users",
        { body },
      );
      if (functionError) {
        setUserFormError(await getAdminFunctionError(functionError));
        return;
      }

      setUserFormMode(null);
      setFormPassword("");
      setSelectedUserRole(formProfile?.role ?? formRole);
      await loadProfiles(false);
    } catch (caught) {
      setUserFormError(
        caught instanceof Error
          ? caught.message
          : "Could not save this user. Please try again.",
      );
    } finally {
      setSavingUser(false);
    }
  }

  async function confirmDeleteUser() {
    if (!deletingProfile) return;
    setDeletingUser(true);
    setUserActionError(null);
    try {
      const { error: functionError } = await supabase.functions.invoke(
        "admin-users",
        {
          body: { action: "delete", userId: deletingProfile.id },
        },
      );
      if (functionError) {
        setUserActionError(await getAdminFunctionError(functionError));
        return;
      }

      const deletedRole = deletingProfile.role;
      const deletedUserId = deletingProfile.id;
      setDeletingProfile(null);
      setSelectedUserRole(deletedRole);
      setProfiles((currentProfiles) =>
        currentProfiles.filter((profile) => profile.id !== deletedUserId),
      );
    } catch (caught) {
      setUserActionError(
        caught instanceof Error
          ? caught.message
          : "Could not delete this account. Please try again.",
      );
    } finally {
      setDeletingUser(false);
    }
  }

  const pendingMechanics = useMemo(
    () => applications.filter((application) => application.status === "pending"),
    [applications],
  );
  const mechanics = profiles.filter((profile) => profile.role === "mechanic");
  const customers = profiles.filter((profile) => profile.role === "customer");
  const admins = profiles.filter((profile) => profile.role === "admin");
  const visibleUsers = selectedUserRole
    ? profiles.filter((profile) => profile.role === selectedUserRole)
    : [];
  const userRoleOptions: {
    role: UserRole;
    label: string;
    count: number;
  }[] = [
    { role: "customer", label: "Motorists", count: customers.length },
    { role: "mechanic", label: "Mechanics", count: mechanics.length },
    { role: "admin", label: "Admins", count: admins.length },
  ];
  const adminName =
    (typeof session?.user.user_metadata?.full_name === "string" &&
      session.user.user_metadata.full_name.trim()) ||
    session?.user.email ||
    "Administrator";

  function closeSidebar(onComplete?: () => void) {
    Animated.timing(sidebarProgress, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSidebarVisible(false);
        onComplete?.();
      }
    });
  }

  async function handleAdminSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSidebarVisible(false);
    await new Promise((resolve) => setTimeout(resolve, 450));
    try {
      await signOut();
      router.replace("/(auth)/admin-access");
    } catch (caught) {
      console.error("Admin sign out failed:", caught);
      setSigningOut(false);
      setError(
        caught instanceof Error
          ? `Could not log out: ${caught.message}`
          : "Could not log out. Please try again.",
      );
    }
  }

  useEffect(() => {
    if (!sidebarVisible) return;
    sidebarProgress.setValue(0);
    const animation = Animated.timing(sidebarProgress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [sidebarProgress, sidebarVisible]);

  return (
    <View style={[styles.page, compact && styles.pageCompact]}>
      {compact ? (
        <View style={styles.mobileBar}>
          <Pressable
            style={styles.brandIconButton}
            onPress={() => setSidebarVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open admin sidebar"
          >
            <Image
              source={require("../../assets/images/MechanicKo_noBG.png")}
              style={styles.brandIcon}
              resizeMode="contain"
              accessibilityLabel="Mechanicko"
            />
          </Pressable>
        </View>
      ) : (
        <View style={styles.sidebar}>
          <Image
            source={require("../../assets/images/MechanicKo_noBG.png")}
            style={styles.sidebarBrandIcon}
            resizeMode="contain"
            accessibilityLabel="Mechanicko"
          />
          <View style={styles.sidebarThemeRow}>
            <Image
              source={
                isDarkMode
                  ? require("../../assets/images/darkmodee.png")
                  : require("../../assets/images/darkmode.png")
              }
              style={styles.sidebarThemeIcon}
              resizeMode="contain"
              accessibilityLabel="Dark mode"
            />
            <Text style={styles.sidebarThemeLabel}>Dark mode</Text>
            <Switch
              value={isDarkMode}
              onValueChange={toggleTheme}
              accessibilityLabel="Enable dark mode"
              trackColor={{ false: colors.border, true: colors.amber }}
              thumbColor={colors.white}
            />
          </View>
          <Pressable
            onPress={() => void handleAdminSignOut()}
            style={styles.logout}
            disabled={signingOut}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
            <Text style={styles.navText}>Log out</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={[
          styles.contentInner,
          compact && styles.contentInnerCompact,
        ]}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.overviewTitle}>OVERVIEW</Text>
        <View style={styles.stats}>
          <Stat label="Pending applications" value={pendingMechanics.length} icon={require("../../assets/images/adminpending.png")} compact={compact} styles={styles} />
          <Stat label="Mechanics" value={mechanics.length} icon={require("../../assets/images/adminmechanics.png")} compact={compact} styles={styles} />
          <Stat label="Motorists" value={customers.length} icon={require("../../assets/images/adminmotorists.png")} compact={compact} styles={styles} />
          <Stat label="Total profiles" value={profiles.length} icon={require("../../assets/images/admintotalusers.png")} compact={compact} styles={styles} />
        </View>

        <View
          style={styles.section}
        >
          <View style={styles.applicationsHeader}>
            <View style={styles.applicationsIconWrap}>
              <Image
                source={require("../../assets/images/applications.png")}
                style={styles.applicationsIcon}
                resizeMode="cover"
                accessibilityLabel="Applications"
              />
            </View>
            <View style={styles.applicationsHeading}>
              <Text style={styles.sectionTitle}>Mechanic applications</Text>
              <Text style={styles.applicationsSubtitle}>
                Review and manage mechanic registrations
              </Text>
            </View>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>
                {pendingMechanics.length}
              </Text>
            </View>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.amber} />
          ) : pendingMechanics.length === 0 ? (
            <View style={styles.emptyApplications}>
              <Ionicons
                name="checkmark-circle-outline"
                size={22}
                color={colors.success}
              />
              <Text style={styles.emptyApplicationsText}>
                No pending applications
              </Text>
            </View>
          ) : (
            pendingMechanics.map((application) => (
              <View
                key={application.id}
                style={styles.application}
              >
                <View
                  style={[
                    styles.applicationTop,
                    compact && styles.applicationTopCompact,
                  ]}
                >
                  <View style={styles.applicationInfo}>
                    <Text style={styles.name}>
                      {application.full_name || "Unnamed mechanic"}
                    </Text>
                    <Text style={styles.applicationEmail}>
                      {application.email || "No email provided"}
                    </Text>
                  </View>
                  <View style={styles.reviewBadge}>
                    <Text style={styles.reviewBadgeText}>Pending review</Text>
                  </View>
                </View>
                <View style={styles.applicationDetails}>
                  <View style={styles.detailItem}>
                    <Ionicons
                      name="construct-outline"
                      size={16}
                      color={colors.textMuted}
                    />
                    <Text style={styles.detail} numberOfLines={2}>
                      {application.skills || "No specialization provided"}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons
                      name="briefcase-outline"
                      size={16}
                      color={colors.textMuted}
                    />
                    <Text style={styles.detail} numberOfLines={2}>
                      {application.experience || "Experience not provided"}
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => void updateApplication(application, "approved")}
                    style={[styles.action, styles.approve]}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.success}
                    />
                    <Text style={[styles.actionText, styles.approveText]}>
                      Approve
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void updateApplication(application, "rejected")}
                    style={[styles.action, styles.reject]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="close" size={18} color={colors.sos} />
                    <Text style={[styles.actionText, styles.rejectText]}>
                      Reject
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Users</Text>
          <View style={styles.userFilters}>
            {userRoleOptions.map((option) => {
              const selected = selectedUserRole === option.role;
              return (
                <Pressable
                  key={option.role}
                  onPress={() => setSelectedUserRole(option.role)}
                  style={[
                    styles.userFilter,
                    selected && styles.userFilterSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.userFilterLabel,
                      selected && styles.userFilterLabelSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.userFilterCount,
                      selected && styles.userFilterCountSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.userFilterCountText,
                        selected && styles.userFilterCountTextSelected,
                      ]}
                    >
                      {option.count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {compact ? (
        <Modal
          visible={sidebarVisible}
          transparent
          animationType="none"
          onRequestClose={() => closeSidebar()}
        >
          <View style={styles.sidebarOverlay}>
            <Animated.View
              style={[
                styles.mobileSidebar,
                {
                  width: Math.min(width * 0.72, 280),
                  paddingTop: Math.max(insets.top, spacing.xl),
                  transform: [
                    {
                      translateX: sidebarProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-Math.min(width * 0.72, 280), 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.drawerAccount}>
                <Image
                  source={require("../../assets/images/MechanicKo_noBG.png")}
                  style={styles.drawerBrandIcon}
                  resizeMode="contain"
                  accessibilityLabel="Mechanicko"
                />
                <Text style={styles.drawerAccountName} numberOfLines={1}>
                  {adminName}
                </Text>
                <Text style={styles.drawerAccountRole}>Administrator</Text>
              </View>
              <View style={styles.drawerDivider} />
              <View style={styles.drawerThemeRow}>
                <Image
                  source={
                    isDarkMode
                      ? require("../../assets/images/darkmodee.png")
                      : require("../../assets/images/darkmode.png")
                  }
                  style={styles.drawerThemeIcon}
                  resizeMode="contain"
                  accessibilityLabel="Dark mode"
                />
                <Text style={styles.drawerRowText}>Dark mode</Text>
                <Switch
                  value={isDarkMode}
                  onValueChange={toggleTheme}
                  accessibilityLabel="Enable dark mode"
                  trackColor={{ false: colors.border, true: colors.amber }}
                  thumbColor={colors.white}
                />
              </View>
              <Pressable
                style={[styles.drawerRow, styles.drawerLogout]}
                onPress={() => void handleAdminSignOut()}
                disabled={signingOut}
                accessibilityRole="button"
              >
                <Ionicons name="log-out-outline" size={23} color={colors.sos} />
                <Text style={[styles.drawerRowText, styles.drawerLogoutText]}>
                  Log out
                </Text>
              </Pressable>
            </Animated.View>
            <Pressable
              style={styles.sidebarDismiss}
              onPress={() => closeSidebar()}
              accessibilityRole="button"
              accessibilityLabel="Close admin sidebar"
            />
          </View>
        </Modal>
      ) : null}
      <Modal
        visible={selectedUserRole !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedUserRole(null)}
      >
        <View style={styles.usersModalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSelectedUserRole(null)}
            accessibilityRole="button"
            accessibilityLabel="Close users list"
          />
          <View
            style={[
              styles.usersModalCard,
              compact && styles.usersModalCardCompact,
              { maxHeight: "84%", width: compact ? width - 32 : 560 },
            ]}
          >
            <View style={styles.usersModalHeader}>
              <Pressable
                onPress={() => setSelectedUserRole(null)}
                style={styles.usersModalBack}
                accessibilityRole="button"
                accessibilityLabel="Back to user categories"
              >
                <Ionicons name="arrow-back" size={23} color={colors.text} />
              </Pressable>
              <View style={styles.usersModalHeading}>
                <Text style={styles.usersModalTitle}>
                  {userRoleOptions.find(
                    (option) => option.role === selectedUserRole,
                  )?.label ?? "Users"}
                </Text>
                <Text style={styles.usersModalSubtitle}>
                  {visibleUsers.length}{" "}
                  {visibleUsers.length === 1 ? "account" : "accounts"}
                </Text>
              </View>
              <Pressable
                onPress={openInviteForm}
                style={styles.inviteButton}
                accessibilityRole="button"
              >
                <Ionicons name="person-add-outline" size={18} color={colors.white} />
                <Text style={styles.inviteButtonText}>Add user</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.usersModalList}
              contentContainerStyle={styles.usersModalListContent}
              showsVerticalScrollIndicator={false}
            >
              {loading ? (
                <ActivityIndicator color={colors.amber} />
              ) : visibleUsers.length === 0 ? (
                <View style={styles.emptyUsers}>
                  <Ionicons
                    name={
                      selectedUserRole === "mechanic"
                        ? "construct-outline"
                        : selectedUserRole === "admin"
                          ? "shield-checkmark-outline"
                          : "people-outline"
                    }
                    size={24}
                    color={colors.textMuted}
                  />
                  <Text style={styles.emptyUsersText}>
                    No{" "}
                    {userRoleOptions
                      .find((option) => option.role === selectedUserRole)
                      ?.label.toLowerCase()}{" "}
                    found.
                  </Text>
                </View>
              ) : (
                visibleUsers.map((profile) => (
                  <View
                    key={profile.id}
                    style={[
                      styles.userRow,
                    ]}
                  >
                    <View style={styles.userIdentity}>
                      <UserAvatar
                        name={profile.full_name}
                        avatarPath={profile.avatar_path}
                        colors={colors}
                        styles={styles}
                      />
                      <View style={styles.userInfo}>
                        <Text style={styles.name} numberOfLines={1}>
                          {profile.full_name || "Unnamed user"}
                        </Text>
                        <Text style={styles.userEmail} numberOfLines={1}>
                          {profile.email}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.userMeta,
                      ]}
                    >
                      <View style={styles.userActions}>
                        <Pressable
                          onPress={() => openEditForm(profile)}
                          style={styles.userActionButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${profile.full_name || "user"}`}
                        >
                          <Image
                            source={require("../../assets/images/adminedit.png")}
                            style={styles.userActionImage}
                            resizeMode="contain"
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setSelectedUserRole(null);
                            setDeletingProfile(profile);
                            setUserActionError(null);
                          }}
                          style={[
                            styles.userActionButton,
                            styles.deleteUserAction,
                            profile.id === session?.user.id &&
                              styles.userActionDisabled,
                          ]}
                          disabled={profile.id === session?.user.id}
                          accessibilityRole="button"
                          accessibilityLabel={
                            profile.id === session?.user.id
                              ? "Cannot delete your administrator account"
                              : `Delete ${profile.full_name || "user"}`
                          }
                        >
                          <Image
                            source={require("../../assets/images/admindelete.png")}
                            style={styles.userActionImage}
                            resizeMode="contain"
                          />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={userFormMode !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setUserFormMode(null)}
      >
        <View style={styles.usersModalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setUserFormMode(null)}
            accessibilityRole="button"
            accessibilityLabel="Close user form"
          />
          <View
            style={[
              styles.userFormCard,
              compact && styles.userFormCardCompact,
              { width: compact ? width - 32 : 480 },
            ]}
          >
            <View style={styles.usersModalHeader}>
              <View style={styles.usersModalHeading}>
                <Text style={styles.usersModalTitle}>
                  {userFormMode === "invite" ? "Create user account" : "Edit user"}
                </Text>
                <Text style={styles.usersModalSubtitle}>
                  {userFormMode === "invite"
                    ? "Create an account that can log in immediately"
                    : "Update this user's profile name"}
                </Text>
              </View>
              <Pressable
                onPress={() => setUserFormMode(null)}
                style={styles.usersModalClose}
                accessibilityRole="button"
                accessibilityLabel="Close user form"
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            <View style={styles.userFormFields}>
              <Text style={styles.formLabel}>Full name</Text>
              <TextInput
                value={formName}
                onChangeText={setFormName}
                placeholder="Enter full name"
                placeholderTextColor={colors.textDim}
                autoCapitalize="words"
                editable={!savingUser}
                style={styles.formInput}
              />
              {userFormMode === "invite" ? (
                <>
                  <Text style={styles.formLabel}>Email</Text>
                  <TextInput
                    value={formEmail}
                    onChangeText={setFormEmail}
                    placeholder="name@example.com"
                    placeholderTextColor={colors.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!savingUser}
                    style={styles.formInput}
                  />
                  <Text style={styles.formLabel}>Initial password</Text>
                  <TextInput
                    value={formPassword}
                    onChangeText={setFormPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    editable={!savingUser}
                    style={styles.formInput}
                  />
                  <Text style={styles.passwordHint}>
                    Share this password with the user securely.
                  </Text>
                  <Text style={styles.formLabel}>Account type</Text>
                  <View style={styles.roleChoices}>
                    {userRoleOptions.map((option) => (
                      <Pressable
                        key={option.role}
                        onPress={() => setFormRole(option.role)}
                        style={[
                          styles.roleChoice,
                          formRole === option.role && styles.roleChoiceSelected,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: formRole === option.role,
                        }}
                      >
                        <Text
                          style={[
                            styles.roleChoiceText,
                            formRole === option.role &&
                              styles.roleChoiceTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.formLabel}>Email</Text>
                  <Text style={styles.readOnlyEmail}>{formEmail}</Text>
                </>
              )}
              {userFormError ? (
                <Text style={styles.formError}>{userFormError}</Text>
              ) : null}
              <View style={styles.formActions}>
                <Pressable
                  onPress={() => setUserFormMode(null)}
                  style={styles.cancelFormButton}
                  disabled={savingUser}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelFormText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void submitUserForm()}
                  style={styles.saveFormButton}
                  disabled={savingUser}
                  accessibilityRole="button"
                >
                  {savingUser ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.saveFormText}>
                      {userFormMode === "invite"
                        ? "Create account"
                        : "Save changes"}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={deletingProfile !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!deletingUser) setDeletingProfile(null);
        }}
      >
        <View style={styles.usersModalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!deletingUser) setDeletingProfile(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Close delete confirmation"
          />
          <View
            style={[
              styles.userFormCard,
              styles.deleteConfirmCard,
              compact && styles.userFormCardCompact,
              { width: compact ? width - 32 : 440 },
            ]}
          >
            <View style={styles.deleteConfirmIcon}>
              <Ionicons name="warning-outline" size={26} color={colors.sos} />
            </View>
            <Text style={styles.usersModalTitle}>Delete this account?</Text>
            <Text style={styles.deleteConfirmMessage}>
              This permanently deletes the Auth account and profile for{" "}
              <Text style={styles.deleteConfirmName}>
                {deletingProfile?.full_name || deletingProfile?.email}
              </Text>
              . This action cannot be undone.
            </Text>
            {userActionError ? (
              <Text style={styles.formError}>{userActionError}</Text>
            ) : null}
            <View style={styles.formActions}>
              <Pressable
                onPress={() => setDeletingProfile(null)}
                style={styles.cancelFormButton}
                disabled={deletingUser}
                accessibilityRole="button"
              >
                <Text style={styles.cancelFormText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmDeleteUser()}
                style={styles.deleteConfirmButton}
                disabled={deletingUser}
                accessibilityRole="button"
              >
                {deletingUser ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.saveFormText}>Delete account</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={signingOut}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => undefined}
      >
        <View style={styles.signOutOverlay}>
          <View style={styles.signOutCard}>
            <ActivityIndicator size="large" color={colors.amber} />
            <Text style={styles.signOutTitle}>Logging out...</Text>
            <Text style={styles.signOutMessage}>
              Please wait while we securely sign you out.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({
  label,
  value,
  icon,
  compact,
  styles,
}: {
  label: string;
  value: number;
  icon: ImageSourcePropType;
  compact: boolean;
  styles: AdminStyles;
}) {
  return (
    <View style={[styles.stat, compact && styles.statCompact]}>
      <View style={styles.statHeader}>
        <View style={styles.statIcon}>
          <Image source={icon} style={styles.statImage} resizeMode="contain" />
        </View>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function UserAvatar({
  name,
  avatarPath,
  colors,
  styles,
}: {
  name: string | null;
  avatarPath: string | null;
  colors: AdminColors;
  styles: AdminStyles;
}) {
  const [imageFailedFor, setImageFailedFor] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<{
    path: string;
    url: string;
  } | null>(() => {
    const url = getCachedAvatarUrl(avatarPath);
    return avatarPath && url ? { path: avatarPath, url } : null;
  });

  useEffect(() => {
    let active = true;

    if (!avatarPath) return;

    const cachedUrl = getCachedAvatarUrl(avatarPath);
    if (cachedUrl) return;

    void loadAvatarUrl(avatarPath).then((url) => {
      if (active && url) setAvatar({ path: avatarPath, url });
    });

    return () => {
      active = false;
    };
  }, [avatarPath]);

  const avatarUrl = avatar?.path === avatarPath ? avatar.url : null;
  const imageFailed = imageFailedFor === avatarPath;

  return (
    <View style={styles.userAvatar}>
      {avatarUrl && !imageFailed ? (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.userAvatarImage}
          resizeMode="cover"
          onError={() => setImageFailedFor(avatarPath)}
          accessibilityLabel={`${name || "User"} profile photo`}
        />
      ) : (
        <Ionicons
          name="person"
          size={25}
          color={colors.amberMuted}
          accessibilityLabel={`${name || "User"} profile placeholder`}
        />
      )}
    </View>
  );
}

function createStyles(colors: AdminColors) {
  return StyleSheet.create({
  page: { flex: 1, flexDirection: "row", backgroundColor: colors.bg },
  pageCompact: { flexDirection: "column" },
  mobileBar: { height: 96, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.bgElevated, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.md },
  brandIconButton: { position: "absolute", left: spacing.md, top: 0, width: 190, height: 96, justifyContent: "center" },
  brandIcon: { position: "absolute", left: 0, top: 26, width: 190, height: 76 },
  sidebar: { width: 240, backgroundColor: colors.bgElevated, borderRightWidth: 1, borderRightColor: colors.border, padding: spacing.xl, gap: spacing.md },
  sidebarThemeRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  sidebarThemeIcon: { width: 24, height: 24 },
  sidebarThemeLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "700" },
  sidebarBrandIcon: { width: 168, height: 64, alignSelf: "flex-start", marginBottom: spacing.sm },
  sidebarOverlay: { flex: 1, flexDirection: "row", backgroundColor: "rgba(0, 0, 0, 0.52)" },
  mobileSidebar: { backgroundColor: colors.bgElevated, paddingHorizontal: spacing.lg },
  sidebarDismiss: { flex: 1 },
  drawerAccount: { paddingVertical: spacing.md },
  drawerBrandIcon: { width: 168, height: 64, marginBottom: spacing.md },
  drawerAccountName: { color: colors.text, fontSize: 17, fontWeight: "800" },
  drawerAccountRole: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  drawerDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  drawerThemeRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  drawerThemeIcon: { width: 24, height: 24 },
  drawerRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  drawerRowText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "700" },
  drawerLogout: { marginTop: "auto", marginBottom: spacing.xl },
  drawerLogoutText: { color: colors.sos },
  navText: { color: colors.text, fontWeight: "700" },
  logout: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: "auto", paddingVertical: spacing.sm },
  content: { flex: 1 },
  contentInner: { maxWidth: 1200, width: "100%", alignSelf: "center", padding: spacing.xl, gap: spacing.xl },
  contentInnerCompact: { padding: spacing.md, gap: spacing.md },
  overviewTitle: { color: colors.textMuted, fontSize: 13, fontWeight: "800", letterSpacing: 1.4, marginTop: spacing.xs },
  muted: { color: colors.textMuted, marginTop: 4 },
  stats: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  stat: { flex: 1, minWidth: 180, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, shadowColor: "#101828", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  statCompact: { flexBasis: "45%", minWidth: 0, minHeight: 116, padding: spacing.md },
  statHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  statIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  statImage: { width: "100%", height: "100%" },
  statValue: { color: colors.text, fontSize: 26, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "700", lineHeight: 18, marginTop: spacing.md },
  section: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md, shadowColor: "#101828", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  userFilters: { flexDirection: "row", gap: spacing.xs, padding: 4, borderRadius: radii.md, backgroundColor: colors.bg },
  userFilter: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: spacing.xs, borderRadius: radii.sm, borderWidth: 1, borderColor: "transparent" },
  userFilterSelected: { backgroundColor: colors.bgElevated, borderColor: colors.border, shadowColor: "#101828", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  userFilterLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
  userFilterLabelSelected: { color: colors.text },
  userFilterCount: { minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.bgElevated },
  userFilterCountSelected: { backgroundColor: colors.blueSoft },
  userFilterCountText: { color: colors.textMuted, fontSize: 10, fontWeight: "800" },
  userFilterCountTextSelected: { color: colors.blue },
  emptyUsers: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  emptyUsersText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  usersModalOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md, backgroundColor: "rgba(16, 24, 40, 0.58)" },
  usersModalCard: { overflow: "hidden", borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, shadowColor: "#101828", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  usersModalCardCompact: { paddingBottom: spacing.sm },
  usersModalHeader: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  usersModalHeading: { flex: 1 },
  usersModalBack: { width: 42, height: 42, alignItems: "center", justifyContent: "center", marginRight: spacing.sm, borderRadius: 21, backgroundColor: colors.bg },
  usersModalTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  usersModalSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  usersModalClose: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: colors.bg },
  usersModalList: { flexGrow: 0 },
  usersModalListContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  inviteButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: colors.blue },
  inviteButtonText: { color: colors.white, fontSize: 14, fontWeight: "800" },
  applicationsHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.xs },
  applicationsIconWrap: { width: 46, height: 46, overflow: "hidden", borderRadius: 14, backgroundColor: colors.bg },
  applicationsIcon: { width: "100%", height: "100%" },
  applicationsHeading: { flex: 1 },
  applicationsSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: -15 },
  pendingBadge: { minWidth: 30, height: 30, marginTop: 1, paddingHorizontal: spacing.xs, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.amberSoft },
  pendingBadgeText: { color: colors.amberMuted, fontSize: 13, fontWeight: "900" },
  emptyApplications: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: colors.successSoft },
  emptyApplicationsText: { color: colors.success, fontSize: 14, fontWeight: "700" },
  application: { gap: spacing.md, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  applicationTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  applicationTopCompact: { flexDirection: "column" },
  applicationInfo: { flex: 1 },
  name: { color: colors.text, fontWeight: "800", fontSize: 15 },
  applicationEmail: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  reviewBadge: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.amberSoft },
  reviewBadgeText: { color: colors.amberMuted, fontSize: 11, fontWeight: "800" },
  applicationDetails: { gap: spacing.sm, paddingVertical: spacing.xs },
  detailItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  detail: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radii.md, paddingHorizontal: spacing.sm, borderWidth: 1 },
  approve: { backgroundColor: colors.successSoft, borderColor: "rgba(39, 174, 96, 0.25)" },
  reject: { backgroundColor: colors.sosSoft, borderColor: "rgba(255, 77, 79, 0.2)" },
  actionText: { fontWeight: "800" },
  approveText: { color: colors.success },
  rejectText: { color: colors.sos },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md },
  userIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  userAvatar: { width: 46, height: 46, flexShrink: 0, overflow: "hidden", borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: colors.amberSoft },
  userAvatarImage: { width: "100%", height: "100%" },
  userInfo: { flex: 1, minWidth: 0 },
  userEmail: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  userMeta: { flexDirection: "row", alignItems: "center" },
  userActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  userActionButton: { width: 40, height: 40, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  deleteUserAction: { borderColor: colors.sosSoft, backgroundColor: colors.sosSoft },
  userActionImage: { width: 23, height: 23 },
  userActionDisabled: { opacity: 0.4 },
  userFormCard: { overflow: "hidden", borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, shadowColor: "#101828", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  userFormCardCompact: { maxWidth: 480 },
  userFormFields: { gap: spacing.sm, padding: spacing.lg },
  formLabel: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: spacing.xs },
  formInput: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, backgroundColor: colors.bgInput, color: colors.text, fontSize: 15 },
  readOnlyEmail: { minHeight: 44, paddingVertical: spacing.sm, color: colors.textMuted, fontSize: 15 },
  passwordHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  roleChoices: { flexDirection: "row", gap: spacing.xs },
  roleChoice: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.bg },
  roleChoiceSelected: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  roleChoiceText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  roleChoiceTextSelected: { color: colors.blue },
  formError: { color: colors.sos, fontSize: 13, lineHeight: 18 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  cancelFormButton: { minHeight: 46, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  cancelFormText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  saveFormButton: { minWidth: 126, minHeight: 46, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: colors.blue },
  saveFormText: { color: colors.white, fontSize: 14, fontWeight: "800" },
  deleteConfirmCard: { alignItems: "center", padding: spacing.lg, gap: spacing.md },
  deleteConfirmIcon: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 27, backgroundColor: colors.sosSoft },
  deleteConfirmMessage: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  deleteConfirmName: { color: colors.text, fontWeight: "800" },
  deleteConfirmButton: { minWidth: 146, minHeight: 46, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: colors.sos },
  signOutOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(16, 24, 40, 0.58)" },
  signOutCard: { width: "100%", maxWidth: 340, alignItems: "center", gap: spacing.md, padding: spacing.xl, borderRadius: radii.lg, backgroundColor: colors.bgElevated, shadowColor: "#101828", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  signOutTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  signOutMessage: { color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  role: { color: colors.amber, fontWeight: "800", textTransform: "capitalize" },
  status: { color: colors.textMuted, textTransform: "capitalize" },
  error: { color: colors.sos, backgroundColor: colors.sosSoft, padding: spacing.md, borderRadius: radii.md },
  });
}
