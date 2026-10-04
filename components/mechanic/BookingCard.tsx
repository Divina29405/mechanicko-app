import { Ionicons } from '@expo/vector-icons';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Booking } from '@/lib/mechanic-mock';
import { colors, radii, spacing } from '@/lib/theme';

type Props = {
  booking: Booking;
  onChat: () => void;
};

function openMaps(booking: Booking) {
  const { lat, lng, address } = booking;
  Alert.alert('Directions', `Papunta sa ${address}`, [
    {
      text: 'Google Maps',
      onPress: () => {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
      },
    },
    {
      text: 'Waze',
      onPress: () => {
        Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`);
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

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
        <Pressable
          onPress={() => openMaps(booking)}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Ionicons name="navigate-outline" size={16} color={colors.amber} />
          <Text style={styles.actionText}>Navigate</Text>
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
    fontSize: 12,
  },
  service: {
    color: colors.text,
    fontWeight: '700',
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
    gap: 4,
  },
  actionText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  pressed: {
    opacity: 0.8,
  },
});
