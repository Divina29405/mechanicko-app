import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MiniMapPreview } from '@/components/mechanic/MiniMapPreview';
import { useMechanic } from '@/contexts/MechanicContext';
import { colors, radii, spacing } from '@/lib/theme';

function formatSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SosCard() {
  const { online, sosOffer, acceptedSos, sosExpired, acceptSos, declineSos } = useMechanic();
  const [showMap, setShowMap] = useState(true);

  if (!online) {
    return (
      <View style={styles.idle}>
        <Ionicons name="radio-outline" size={20} color={colors.textMuted} />
        <Text style={styles.idleText}>
          I-on ang availability para lumabas sa radar at makatanggap ng SOS.
        </Text>
      </View>
    );
  }

  if (acceptedSos) {
    return (
      <View style={styles.accepted}>
        <View style={styles.row}>
          <View style={styles.badgeOk}>
            <Ionicons name="navigate" size={16} color={colors.bg} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.kickerOk}>ACTIVE SOS</Text>
            <Text style={styles.title}>
              {acceptedSos.issue} · {acceptedSos.customerName}
            </Text>
            <Text style={styles.meta}>
              {acceptedSos.vehicle} · {acceptedSos.distanceKm} km · ~{acceptedSos.etaMinutes} min
            </Text>
          </View>
        </View>
        {showMap ? <MiniMapPreview /> : null}
      </View>
    );
  }

  if (!sosOffer) {
    return (
      <View style={styles.idle}>
        <Ionicons
          name={sosExpired ? 'time-outline' : 'shield-checkmark-outline'}
          size={20}
          color={colors.success}
        />
        <Text style={styles.idleText}>
          {sosExpired
            ? 'Nag-expire ang huling SOS offer. Handa ka pa rin sa susunod.'
            : 'Walang live SOS malapit sa iyo. Naka-standby ang radar.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.liveRow}>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE SOS</Text>
        </View>
        <View style={styles.timer}>
          <Ionicons name="timer-outline" size={14} color={colors.sos} />
          <Text style={styles.timerText}>{formatSeconds(sosOffer.secondsLeft)}</Text>
        </View>
      </View>

      <Text style={styles.title}>{sosOffer.issue}</Text>
      <Text style={styles.meta}>
        {sosOffer.customerName} · {sosOffer.vehicle}
      </Text>
      <Text style={styles.distance}>{sosOffer.distanceKm} km ang layo · ~{sosOffer.etaMinutes} min</Text>

      <Pressable
        onPress={() => setShowMap((v) => !v)}
        style={styles.mapToggle}
        accessibilityRole="button">
        <Ionicons name="map-outline" size={16} color={colors.amber} />
        <Text style={styles.mapToggleText}>{showMap ? 'Itago ang mini-map' : 'Tingnan ang mini-map'}</Text>
      </Pressable>
      {showMap ? <MiniMapPreview /> : null}

      <View style={styles.actions}>
        <Pressable onPress={declineSos} style={({ pressed }) => [styles.decline, pressed && styles.pressed]}>
          <Text style={styles.declineText}>Decline</Text>
        </Pressable>
        <Pressable onPress={acceptSos} style={({ pressed }) => [styles.accept, pressed && styles.pressed]}>
          <Ionicons name="flash" size={16} color={colors.white} />
          <Text style={styles.acceptText}>Grab Job</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.sosSoft,
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 79, 0.45)',
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  accepted: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: 'rgba(125, 206, 130, 0.4)',
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  idle: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  idleText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  liveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.sos,
  },
  liveText: {
    color: colors.sos,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerText: {
    color: colors.sos,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  title: {
    marginTop: 10,
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  meta: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
  },
  distance: {
    marginTop: 2,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  mapToggle: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapToggleText: {
    color: colors.amber,
    fontWeight: '700',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  decline: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  declineText: {
    color: colors.text,
    fontWeight: '700',
  },
  accept: {
    flex: 1.2,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.sos,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  acceptText: {
    color: colors.white,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  badgeOk: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  kickerOk: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
});
