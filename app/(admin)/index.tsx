import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { colors, radii, spacing } from "@/lib/theme";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "mechanic" | "customer";
  application_status: "pending" | "approved" | "rejected";
  skills: string | null;
  experience: string | null;
  created_at: string;
};

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
  const { signOut } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProfiles() {
    setLoading(true);
    const [{ data, error: queryError }, applicationsResult] = await Promise.all([
      supabase
      .from("profiles")
      .select("id,email,full_name,role,application_status,skills,experience,created_at")
      .order("created_at", { ascending: false }),
      supabase.rpc("admin_list_mechanic_applications"),
    ]);
    const nextProfiles = (data ?? []) as Profile[];
    setProfiles(nextProfiles);
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
    setLoading(false);
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
      await loadProfiles();
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
    await loadProfiles();
  }

  const pendingMechanics = useMemo(
    () => applications.filter((application) => application.status === "pending"),
    [applications],
  );
  const mechanics = profiles.filter((profile) => profile.role === "mechanic");
  const customers = profiles.filter((profile) => profile.role === "customer");

  if (Platform.OS !== "web") {
    return (
      <View style={styles.centered}>
        <Ionicons name="desktop-outline" size={42} color={colors.amber} />
        <Text style={styles.title}>Admin web dashboard</Text>
        <Text style={styles.muted}>Open this account in a web browser.</Text>
        <Pressable onPress={() => void signOut()} style={styles.button}>
          <Text style={styles.buttonText}>Log out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.sidebar}>
        <Text style={styles.brand}>MEKANIKO</Text>
        <Text style={styles.sidebarLabel}>ADMIN CONSOLE</Text>
        <View style={styles.navItem}>
          <Ionicons name="grid-outline" size={18} color={colors.amber} />
          <Text style={styles.navText}>Overview</Text>
        </View>
        <View style={styles.navItem}>
          <Ionicons name="document-text-outline" size={18} color={colors.textMuted} />
          <Text style={styles.navText}>Applications</Text>
        </View>
        <View style={styles.navItem}>
          <Ionicons name="people-outline" size={18} color={colors.textMuted} />
          <Text style={styles.navText}>Users</Text>
        </View>
        <Pressable onPress={() => void signOut()} style={styles.logout}>
          <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
          <Text style={styles.navText}>Log out</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <View style={styles.header}>
          <View>
            <Text style={styles.heading}>Admin overview</Text>
            <Text style={styles.muted}>Manage applications, mechanics, and customers.</Text>
          </View>
          <Pressable onPress={() => void loadProfiles()} style={styles.refresh}>
            <Ionicons name="refresh-outline" size={18} color={colors.text} />
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.stats}>
          <Stat label="Pending applications" value={pendingMechanics.length} icon="time-outline" />
          <Stat label="Mechanics" value={mechanics.length} icon="construct-outline" />
          <Stat label="Customers" value={customers.length} icon="person-outline" />
          <Stat label="Total profiles" value={profiles.length} icon="people-outline" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mechanic applications</Text>
          {loading ? (
            <ActivityIndicator color={colors.amber} />
          ) : pendingMechanics.length === 0 ? (
            <Text style={styles.muted}>No pending applications.</Text>
          ) : (
            pendingMechanics.map((application) => (
              <View key={application.id} style={styles.application}>
                <View style={styles.applicationInfo}>
                  <Text style={styles.name}>{application.full_name || "Unnamed mechanic"}</Text>
                  <Text style={styles.muted}>{application.email}</Text>
                  <Text style={styles.detail}>
                    {application.skills || "No specialization"} · {application.experience || "Experience not provided"}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => void updateApplication(application, "approved")}
                    style={[styles.action, styles.approve]}
                  >
                    <Text style={styles.actionText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void updateApplication(application, "rejected")}
                    style={[styles.action, styles.reject]}
                  >
                    <Text style={styles.actionText}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Users</Text>
          {profiles.map((profile) => (
            <View key={profile.id} style={styles.userRow}>
              <View style={styles.userIcon}>
                <Ionicons
                  name={profile.role === "mechanic" ? "construct-outline" : "person-outline"}
                  size={18}
                  color={colors.amber}
                />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.name}>{profile.full_name || "Unnamed user"}</Text>
                <Text style={styles.muted}>{profile.email}</Text>
              </View>
              <Text style={styles.role}>{profile.role}</Text>
              <Text style={styles.status}>{profile.application_status}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={22} color={colors.amber} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: "row", backgroundColor: colors.bg },
  sidebar: { width: 240, backgroundColor: colors.bgElevated, borderRightWidth: 1, borderRightColor: colors.border, padding: spacing.xl, gap: spacing.md },
  brand: { color: colors.amber, fontSize: 22, fontWeight: "900", letterSpacing: 2 },
  sidebarLabel: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: spacing.lg },
  navItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  navText: { color: colors.text, fontWeight: "700" },
  logout: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: "auto", paddingVertical: spacing.sm },
  content: { flex: 1 },
  contentInner: { maxWidth: 1200, width: "100%", alignSelf: "center", padding: spacing.xl, gap: spacing.xl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heading: { color: colors.text, fontSize: 30, fontWeight: "900" },
  muted: { color: colors.textMuted, marginTop: 4 },
  refresh: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 10 },
  refreshText: { color: colors.text, fontWeight: "700" },
  stats: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  stat: { flex: 1, minWidth: 180, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg },
  statValue: { color: colors.text, fontSize: 28, fontWeight: "900", marginTop: 10 },
  section: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  application: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  applicationInfo: { flex: 1 },
  name: { color: colors.text, fontWeight: "800", fontSize: 15 },
  detail: { color: colors.textMuted, marginTop: 8 },
  actions: { flexDirection: "row", gap: 8, marginLeft: spacing.md },
  action: { borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 10 },
  approve: { backgroundColor: colors.success },
  reject: { backgroundColor: colors.sos },
  actionText: { color: colors.white, fontWeight: "800" },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  userIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.amberSoft },
  userInfo: { flex: 1 },
  role: { color: colors.amber, fontWeight: "800", textTransform: "capitalize" },
  status: { color: colors.textMuted, textTransform: "capitalize" },
  error: { color: colors.sos, backgroundColor: colors.sosSoft, padding: spacing.md, borderRadius: radii.md },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: spacing.md, padding: spacing.xl },
  title: { color: colors.text, fontSize: 24, fontWeight: "900" },
  button: { backgroundColor: colors.amber, borderRadius: radii.md, paddingHorizontal: 18, paddingVertical: 12 },
  buttonText: { color: colors.bg, fontWeight: "800" },
});
