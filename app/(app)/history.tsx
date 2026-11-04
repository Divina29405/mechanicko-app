import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { MechanicText as Text } from '@/components/mechanic/MechanicText';
import { useMechanic } from '@/contexts/MechanicContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { formatPeso } from '@/lib/mechanic-mock';
import { getMechanicThemeColors, radii, spacing } from '@/lib/theme';

export default function HistoryScreen() {
  const { history } = useMechanic();
  const { colors: themeColors } = useAppTheme();
  const colors = getMechanicThemeColors(themeColors);
  const styles = createStyles(colors);

  return (
    <MechanicScreen back title="Job history" subtitle="Completed work and reviews">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {history.map((job) => (
          <View key={job.id} style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.service}>{job.service}</Text>
              <Text style={styles.amount}>{formatPeso(job.amount)}</Text>
            </View>
            <Text style={styles.meta}>
              {job.clientName} · {job.date}
            </Text>
            <View style={styles.stars}>
              {Array.from({ length: 5 }).map((_, index) => (
                <Ionicons
                  key={index}
                  name={index < job.rating ? 'star' : 'star-outline'}
                  size={14}
                  color={colors.amber}
                />
              ))}
            </View>
            <Text style={styles.feedback}>“{job.feedback}”</Text>
          </View>
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
    gap: 10,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  service: {
    color: colors.text,
    fontWeight: '800',
    flex: 1,
  },
  amount: {
    color: colors.amber,
    fontWeight: '800',
  },
  meta: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 8,
  },
  feedback: {
    marginTop: 6,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  });
}
