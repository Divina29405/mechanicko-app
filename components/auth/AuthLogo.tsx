import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/lib/theme';

export function AuthLogo() {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <View style={styles.badgeInner}>
          <Ionicons name="construct" size={28} color={colors.bg} />
        </View>
      </View>
      <Text style={styles.wordmark}>MECHANIKO</Text>
      <Text style={styles.tagline}>Hanapin ang mekaniko malapit sa’yo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(240, 162, 2, 0.28)',
  },
  badgeInner: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    color: colors.text,
    fontSize: 28,
    letterSpacing: 4,
    fontFamily: 'SpaceMono',
    fontWeight: '700',
  },
  tagline: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
});
