import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { MechanicScreen } from "@/components/mechanic/MechanicScreen";
import { useMechanic } from "@/contexts/MechanicContext";
import { colors, spacing } from "@/lib/theme";

type EarningsPeriod = "today" | "week" | "month";

function formatPeso(value: number) {
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
  })}`;
}

export default function EarningsScreen() {
  const {
    todayEarnings,
    weeklyEarnings,
    monthlyEarnings,
    completedToday,
    completedThisWeek,
    completedThisMonth,
    payouts,
    refreshEarnings,
  } = useMechanic();
  const [period, setPeriod] = useState<EarningsPeriod>("today");

  useFocusEffect(
    useCallback(() => {
      void refreshEarnings();
    }, [refreshEarnings]),
  );

  const summary = {
    today: { total: todayEarnings, completed: completedToday, label: "Today" },
    week: {
      total: weeklyEarnings,
      completed: completedThisWeek,
      label: "This Week",
    },
    month: {
      total: monthlyEarnings,
      completed: completedThisMonth,
      label: "This Month",
    },
  }[period];

  const visiblePayouts = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start =
      period === "today"
        ? startOfToday
        : period === "week"
          ? startOfWeek
          : startOfMonth;
    return payouts.filter((payout) => new Date(payout.date) >= start);
  }, [payouts, period]);

  return (
    <MechanicScreen back title="Earnings" profileHeader>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Earnings Overview</Text>
        <View style={styles.periodSelector}>
          {(
            [
              ["today", "Today"],
              ["week", "This Week"],
              ["month", "This Month"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setPeriod(value)}
              style={[
                styles.periodButton,
                period === value && styles.periodButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.periodText,
                  period === value && styles.periodTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.totalCard}>
          <View style={styles.totalIcon}>
            <Ionicons name="wallet-outline" size={22} color={colors.blue} />
          </View>
          <View style={styles.totalText}>
            <Text style={styles.totalLabel}>{summary.label} earnings</Text>
            <Text style={styles.totalValue}>{formatPeso(summary.total)}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{summary.completed}</Text>
            <Text style={styles.statLabel}>Completed services</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {formatPeso(summary.total / Math.max(summary.completed, 1))}
            </Text>
            <Text style={styles.statLabel}>Average per service</Text>
          </View>
        </View>
      </ScrollView>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  pageTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: spacing.md,
  },
  periodSelector: {
    flexDirection: "row",
    padding: 4,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  periodButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  periodButtonActive: { backgroundColor: colors.blue },
  periodText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  periodTextActive: { color: colors.white },
  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.md,
    marginTop: spacing.md,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
  },
  totalIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  totalText: { flex: 1 },
  totalLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  totalValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 2,
  },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
  },
  statValue: { color: colors.text, fontSize: 17, fontWeight: "800" },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  payoutCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  payoutIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  payoutInfo: { flex: 1 },
  payoutTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  payoutDate: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  payoutAmount: { color: colors.success, fontSize: 14, fontWeight: "900" },
});
