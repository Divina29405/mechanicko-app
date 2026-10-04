import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { useMechanic } from '@/contexts/MechanicContext';
import { formatPeso } from '@/lib/mechanic-mock';
import { colors, radii, spacing } from '@/lib/theme';

export default function EarningsScreen() {
  const { todayEarnings, weeklyEarnings, completedToday, payouts, walletBalance } = useMechanic();

  return (
    <MechanicScreen title="Earnings" subtitle="Kita, payout, at cashout">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>This week</Text>
          <Text style={styles.heroValue}>{formatPeso(weeklyEarnings)}</Text>
          <Text style={styles.heroHint}>
            {formatPeso(todayEarnings)} ngayong araw · {completedToday} completed jobs
          </Text>
        </View>

        <View style={styles.row}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Wallet</Text>
            <Text style={styles.tileValue}>{formatPeso(walletBalance)}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Next payout</Text>
            <Text style={styles.tileValue}>Lunes</Text>
          </View>
        </View>

        <Text style={styles.section}>Payout history</Text>
        <View style={styles.stack}>
          {payouts.map((row) => (
            <View key={row.id} style={styles.item}>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{row.label}</Text>
                <Text style={styles.meta}>
                  {row.date} · {row.method}
                </Text>
              </View>
              <View>
                <Text style={styles.amount}>{formatPeso(row.amount)}</Text>
                <Text style={[styles.status, row.status === 'pending' && styles.pending]}>
                  {row.status === 'pending' ? 'Pending' : 'Completed'}
                </Text>
              </View>
            </View>
          ))}
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
  hero: {
    backgroundColor: colors.amberSoft,
    borderWidth: 1,
    borderColor: 'rgba(240, 162, 2, 0.35)',
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  heroLabel: {
    color: colors.amber,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heroValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    marginTop: 4,
  },
  heroHint: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.md,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  tileLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  tileValue: {
    marginTop: 4,
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
  },
  stack: {
    gap: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  flex: {
    flex: 1,
  },
  itemTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  amount: {
    color: colors.text,
    fontWeight: '800',
    textAlign: 'right',
  },
  status: {
    marginTop: 2,
    color: colors.success,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
  pending: {
    color: colors.amber,
  },
});
