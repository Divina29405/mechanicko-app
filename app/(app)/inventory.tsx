import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { MechanicText as Text } from '@/components/mechanic/MechanicText';
import { useMechanic } from '@/contexts/MechanicContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { getMechanicThemeColors, radii, spacing } from '@/lib/theme';

export default function InventoryScreen() {
  const { inventory, togglePacked } = useMechanic();
  const { colors: themeColors } = useAppTheme();
  const colors = getMechanicThemeColors(themeColors);
  const styles = createStyles(colors);
  const missing = inventory.filter((item) => !item.packed).length;

  return (
    <MechanicScreen
      back
      title="Tools & parts"
      subtitle={missing === 0 ? 'Kompleto ang checklist' : `${missing} item pa ang kulang`}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {inventory.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => togglePacked(item.id)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={[styles.check, item.packed && styles.checkOn]}>
              <Text style={styles.checkMark}>{item.packed ? '✓' : ''}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>
                {item.name} · x{item.qty}
              </Text>
              <Text style={styles.meta}>{item.neededFor}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </MechanicScreen>
  );
}

function createStyles(colors: ReturnType<typeof getMechanicThemeColors>) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgInput,
  },
  checkOn: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  checkMark: {
    color: colors.bg,
    fontWeight: '800',
  },
  flex: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  });
}
