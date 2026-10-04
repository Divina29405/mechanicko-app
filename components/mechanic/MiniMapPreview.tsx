import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

export function MiniMapPreview() {
  return (
    <View style={styles.map} accessibilityLabel="Preview ng ruta papunta sa customer">
      <View style={[styles.road, styles.hRoad]} />
      <View style={[styles.road, styles.vRoad]} />
      <View style={[styles.road, styles.diag]} />
      <View style={[styles.pin, styles.you]}>
        <View style={styles.pinDot} />
      </View>
      <View style={[styles.pin, styles.customer]}>
        <View style={[styles.pinDot, styles.sosDot]} />
      </View>
      <View style={styles.youLabel}>
        <Text style={styles.label}>Ikaw</Text>
      </View>
      <View style={styles.custLabel}>
        <Text style={styles.label}>SOS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 148,
    borderRadius: 14,
    backgroundColor: colors.mapBg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: 12,
  },
  road: {
    position: 'absolute',
    backgroundColor: '#2C3340',
  },
  hRoad: {
    top: 72,
    left: 0,
    right: 0,
    height: 10,
  },
  vRoad: {
    left: 118,
    top: 0,
    bottom: 0,
    width: 8,
  },
  diag: {
    width: 180,
    height: 7,
    top: 96,
    left: 40,
    transform: [{ rotate: '-18deg' }],
    backgroundColor: '#3A4252',
  },
  pin: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  you: {
    left: 108,
    top: 58,
    backgroundColor: colors.amber,
  },
  customer: {
    right: 36,
    top: 28,
    backgroundColor: colors.sos,
  },
  pinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bg,
  },
  sosDot: {
    backgroundColor: colors.white,
  },
  youLabel: {
    position: 'absolute',
    left: 96,
    top: 84,
  },
  custLabel: {
    position: 'absolute',
    right: 32,
    top: 54,
  },
  label: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
});
