import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { BookingCard } from "@/components/mechanic/BookingCard";
import { MechanicScreen } from "@/components/mechanic/MechanicScreen";
import { useMechanic } from "@/contexts/MechanicContext";
import { colors, radii, spacing } from "@/lib/theme";

export default function JobsScreen() {
  const { bookings, history, acceptedSos } = useMechanic();

  const onGoingJobs = bookings.filter((booking) => booking.status !== "done");
  const resolvedJobs = history;
  const droppedJobs: Array<{ id: string; label: string; note: string }> = [];

  return (
    <MechanicScreen title="Jobs" subtitle="Status ng mga trabaho">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {acceptedSos ? (
          <View style={styles.sos}>
            <Text style={styles.kicker}>ACTIVE EMERGENCY</Text>
            <Text style={styles.sosTitle}>{acceptedSos.issue}</Text>
            <Text style={styles.meta}>
              {acceptedSos.customerName} · {acceptedSos.vehicle} ·{" "}
              {acceptedSos.distanceKm} km
            </Text>
          </View>
        ) : null}

        <Text style={styles.section}>On Going</Text>
        <View style={styles.stack}>
          {onGoingJobs.length > 0 ? (
            onGoingJobs.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onChat={() => router.push("./messages")}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                Walang kasalukuyang on-going job.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.section}>Resolved</Text>
        <View style={styles.stack}>
          {resolvedJobs.length > 0 ? (
            resolvedJobs.map((job) => (
              <View key={job.id} style={styles.past}>
                <Text style={styles.pastTitle}>{job.service}</Text>
                <Text style={styles.meta}>
                  {job.clientName} · {job.date}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Walang resolved jobs.</Text>
            </View>
          )}
        </View>

        <Text style={styles.section}>Dropped</Text>
        <View style={styles.stack}>
          {droppedJobs.length > 0 ? (
            droppedJobs.map((job) => (
              <View key={job.id} style={styles.past}>
                <Text style={styles.pastTitle}>{job.label}</Text>
                <Text style={styles.meta}>{job.note}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Walang dropped job.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sos: {
    backgroundColor: colors.sosSoft,
    borderWidth: 1,
    borderColor: "rgba(255, 77, 79, 0.4)",
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  kicker: {
    color: colors.sos,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  sosTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  section: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  stack: {
    gap: 10,
  },
  past: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  pastTitle: {
    color: colors.text,
    fontWeight: "700",
  },
  meta: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
  },
  emptyState: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
