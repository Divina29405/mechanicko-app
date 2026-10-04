import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { useMechanic } from '@/contexts/MechanicContext';
import { colors, radii, spacing } from '@/lib/theme';

export default function NotificationsScreen() {
  const { notifications, markNotificationsRead } = useMechanic();

  useEffect(() => {
    markNotificationsRead();
  }, [markNotificationsRead]);

  return (
    <MechanicScreen back title="Notifications" subtitle="SOS, admin, at system updates">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {notifications.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.time}>{item.time}</Text>
            </View>
            <Text style={styles.body}>{item.body}</Text>
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
  title: {
    color: colors.text,
    fontWeight: '800',
    flex: 1,
  },
  time: {
    color: colors.textDim,
    fontSize: 12,
  },
  body: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
