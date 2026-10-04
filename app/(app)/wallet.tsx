import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { useMechanic } from '@/contexts/MechanicContext';
import { formatPeso } from '@/lib/mechanic-mock';
import { colors, radii, spacing } from '@/lib/theme';

export default function WalletScreen() {
  const { walletBalance, payouts } = useMechanic();

  return (
    <MechanicScreen back title="Wallet" subtitle="Balanse at cashout (GCash / Bank)">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.label}>Available</Text>
          <Text style={styles.value}>{formatPeso(walletBalance)}</Text>
        </View>
        {payouts.map((row) => (
          <View key={row.id} style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.title}>{row.label}</Text>
              <Text style={styles.meta}>
                {row.method} · {row.date}
              </Text>
            </View>
            <Text style={styles.amount}>{formatPeso(row.amount)}</Text>
          </View>
        ))}
      </ScrollView>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: 10,
  },
  hero: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: 6,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  value: {
    marginTop: 4,
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  flex: {
    flex: 1,
  },
  title: {
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
  },
});
