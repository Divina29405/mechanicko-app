import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Booking } from '@/lib/mechanic-mock';
import { colors, radii, spacing } from '@/lib/theme';
import { normalizeText } from '@/lib/typography';

type Props = {
  booking: Booking;
  onChat: () => void;
};

export function BookingCard({ booking, onChat }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.timePill}>
          <Text style={styles.time}>{booking.time}</Text>
        </View>
        <Text style={styles.service}>{booking.service}</Text>
      </View>
      <Text style={styles.name}>{booking.clientName}</Text>
      <Text style={styles.meta}>
        {booking.vehicle} · {booking.address}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => Linking.openURL(`tel:${booking.phone}`)}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Ionicons name="call-outline" size={16} color={colors.amber} />
          <Text style={styles.actionText}>Call</Text>
        </Pressable>
        <Pressable onPress={onChat} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.amber} />
          <Text style={styles.actionText}>Chat</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  timePill: {
    backgroundColor: colors.amberSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  time: {
    color: colors.amber,
    fontWeight: '800',
    fontSize: normalizeText(12),
  },
  service: {
    color: colors.text,
    fontWeight: '700',
    flex: 1,
    fontSize: normalizeText(14),
  },
  name: {
    color: colors.text,
    fontSize: normalizeText(16),
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: normalizeText(13),
    lineHeight: normalizeText(18),
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  action: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: normalizeText(12),
  },
  pressed: {
    opacity: 0.8,
  },
});