import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { MotoristHomeHeader } from "@/components/MotoristHomeHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";

type ActivityRequest = {
  id: string;
  status: string;
  created_at: string;
  vehicle_type: string | null;
  plate_number: string | null;
  vehicle_issue: string | null;
  estimated_total: number | null;
  mechanic_id: string | null;
  mechanicName?: string;
};

const ONGOING_STATUSES = ["accepted", "in_transit", "arrived", "in_progress"];

export default function ActivityScreen() {
  const { session } = useAuth();
  const { colors } = useAppTheme();
  const router = useRouter();
  const [requests, setRequests] = useState<ActivityRequest[]>([]);
  const [filter, setFilter] = useState<"ongoing" | "resolved" | "revoked">("ongoing");
  const [period, setPeriod] = useState<"today" | "week" | "month">("month");
  const [periodMenuVisible, setPeriodMenuVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(async () => {
    if (!session?.user.id) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("service_requests")
      .select("id,status,created_at,vehicle_type,plate_number,vehicle_issue,estimated_total,mechanic_id")
      .eq("motorist_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error || !data) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const mechanicIds = [...new Set(data.map((item) => item.mechanic_id).filter(Boolean))] as string[];
    const { data: profiles } = mechanicIds.length
      ? await supabase.from("profiles").select("id,full_name").in("id", mechanicIds)
      : { data: [] };
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

    setRequests(
      data.map((item) => ({
        ...(item as ActivityRequest),
        mechanicName: item.mechanic_id ? names.get(item.mechanic_id) ?? "Mechanic" : "Mechanic",
      })),
    );
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void loadActivity();
    }, [loadActivity]),
  );

  const completedCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    if (period === "today") {
      start.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }
    return requests.filter((item) => {
      const isCompleted = ["completed", "done", "resolved", "closed"].includes(item.status.toLowerCase());
      return isCompleted && new Date(item.created_at) >= start;
    }).length;
  }, [period, requests]);
  const periodLabel = period === "today" ? "Today" : period === "week" ? "This Week" : "This Month";
  const visibleRequests = useMemo(() => {
    return requests.filter((item) => {
      const status = item.status.toLowerCase();
      const matchesFilter =
        filter === "resolved"
          ? ["completed", "done", "resolved", "closed"].includes(status)
          : filter === "revoked"
            ? ["cancelled", "canceled", "revoked"].includes(status)
            : ONGOING_STATUSES.includes(status);
      return matchesFilter;
    });
  }, [filter, requests]);

  return (
    <View style={[styles.root, { backgroundColor: "#F5F6F8" }]}>
      <MotoristHomeHeader />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Activity</Text>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Services Booked</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{completedCount} completed</Text>
            <View>
              <Pressable onPress={() => setPeriodMenuVisible((visible) => !visible)} style={styles.periodPill}>
                <Text style={styles.periodText}>{periodLabel}</Text>
                <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
              </Pressable>
              {periodMenuVisible ? (
                <View style={[styles.periodMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {([
                    ["today", "Today"],
                    ["week", "This Week"],
                    ["month", "This Month"],
                  ] as const).map(([value, label]) => (
                    <Pressable
                      key={value}
                      onPress={() => {
                        setPeriod(value);
                        setPeriodMenuVisible(false);
                      }}
                      style={styles.periodOption}
                    >
                      <Text style={[styles.periodOptionText, { color: colors.text }]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setFilter("ongoing")}
            style={[styles.filterPill, filter === "ongoing" && styles.filterPillActive]}
          >
            <Text style={[styles.filterText, filter === "ongoing" && styles.filterTextActive]}>On going</Text>
          </Pressable>
          <Pressable
            onPress={() => setFilter("resolved")}
            style={[styles.filterPill, filter === "resolved" && styles.filterPillActive]}
          >
            <Text style={[styles.filterText, filter === "resolved" && styles.filterTextActive]}>Resolved</Text>
          </Pressable>
          <Pressable
            onPress={() => setFilter("revoked")}
            style={[styles.filterPill, filter === "revoked" && styles.filterPillActive]}
          >
            <Text style={[styles.filterText, filter === "revoked" && styles.filterTextActive]}>Revoked</Text>
          </Pressable>
        </View>

        <Text style={[styles.dateHeading, { color: colors.text }]}>
          <Text style={styles.dateDot}>● </Text>TODAY, {new Date().toLocaleDateString([], { month: "short", day: "2-digit" }).toUpperCase()}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : visibleRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={42} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No activity found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Your booking activity will appear here.
            </Text>
          </View>
        ) : (
          visibleRequests.map((item) => {
            const isCompleted = ["completed", "done", "resolved", "closed"].includes(item.status.toLowerCase());
            return (
              <View key={item.id} style={[styles.activityCard, { backgroundColor: colors.card }]}>
                <View style={styles.activityHeader}>
                  <View>
                    <Text style={styles.jobId}>#MK-{item.id.slice(0, 5).toUpperCase()}</Text>
                    <Text style={[styles.jobTime, { color: colors.textMuted }]}>
                      {new Date(item.created_at).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <View style={styles.amountCopy}>
                    <Text style={[styles.amount, { color: colors.text }]}>
                      ₱{Number(item.estimated_total ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </Text>
                    <Text style={[styles.cashText, { color: colors.textMuted }]}>Cash</Text>
                  </View>
                </View>
                <Text style={[styles.mechanicName, { color: colors.text }]}>{item.mechanicName}</Text>
                <Text style={[styles.vehicleLine, { color: colors.textMuted }]}>
                  {item.vehicle_type || "Vehicle"} • {item.plate_number || "Plate unavailable"}
                </Text>
                <View style={styles.issueBox}>
                  <Ionicons name="location-outline" size={15} color="#D92D20" />
                  <Text style={[styles.issueText, { color: colors.text }]}>
                    {item.vehicle_issue || "Emergency Alternator & Battery Jumpstart"}
                  </Text>
                </View>
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/MotoristMap",
                        params: { bookingId: item.id },
                      })
                    }
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isCompleted ? "Book Again" : filter === "revoked" ? "Book Again" : "Track Mechanic"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 30 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  pageTitle: { fontSize: 27, fontWeight: "800" },
  summaryCard: { borderRadius: 14, padding: 16, marginBottom: 26 },
  summaryLabel: { fontSize: 12, fontWeight: "700" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  summaryValue: { fontSize: 21, fontWeight: "800" },
  periodPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#0037B0", borderRadius: 8, paddingHorizontal: 13, paddingVertical: 10 },
  periodText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  periodMenu: { position: "absolute", zIndex: 20, top: 46, right: 0, width: 125, borderWidth: 1, borderRadius: 9, paddingVertical: 4, elevation: 5 },
  periodOption: { paddingHorizontal: 12, paddingVertical: 10 },
  periodOptionText: { fontSize: 12, fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  filterPill: { borderRadius: 18, backgroundColor: "#E8ECFF", paddingHorizontal: 17, paddingVertical: 10 },
  filterPillActive: { backgroundColor: "#0037B0" },
  filterText: { color: "#667085", fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: "#FFFFFF" },
  dateHeading: { fontSize: 10, fontWeight: "800", marginBottom: 8 },
  dateDot: { color: "#0037B0" },
  loader: { marginTop: 30 },
  activityCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#1F2937",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 4,
  },
  activityHeader: { flexDirection: "row", justifyContent: "space-between" },
  jobId: { color: "#0037B0", fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },
  jobTime: { fontSize: 12, marginTop: 4 },
  amountCopy: { alignItems: "flex-end" },
  amount: { fontSize: 17, fontWeight: "800" },
  cashText: { fontSize: 11 },
  mechanicName: { fontSize: 17, fontWeight: "800", marginTop: 6 },
  vehicleLine: { fontSize: 12, marginTop: 3 },
  issueBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EEF0FF", borderRadius: 8, padding: 11, marginTop: 12 },
  issueText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  primaryButton: { backgroundColor: "#0037B0", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  emptyState: { alignItems: "center", paddingTop: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", marginTop: 10 },
  emptySubtitle: { fontSize: 12, marginTop: 4 },
});
