import { Ionicons } from '@expo/vector-icons';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { useMechanic } from '@/contexts/MechanicContext';
import { colors, spacing } from '@/lib/theme';

export default function MessagesScreen() {
  const { threads } = useMechanic();

  return (
    <MechanicScreen title="Messages" subtitle="Clients and support">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {threads.map((thread) => (
          <View key={thread.id} style={styles.row}>
            <View style={styles.avatar}>
              <Ionicons
                name={thread.kind === 'support' ? 'headset-outline' : 'person-outline'}
                size={18}
                color={colors.amber}
              />
            </View>
            <View style={styles.body}>
              <View style={styles.top}>
                <Text style={styles.name}>{thread.name}</Text>
                <Text style={styles.time}>{thread.time}</Text>
              </View>
              <Text style={styles.preview} numberOfLines={1}>
                {thread.preview}
              </Text>
            </View>
            {thread.unread > 0 ? (
              <View style={styles.unread}>
                <Text style={styles.unreadText}>{thread.unread}</Text>
              </View>
            ) : null}
          </View>
        ))}
        <Text
          style={styles.soon}
          onPress={() => Alert.alert('Chat', 'Live chat thread, susunod na build.')}>
          Buksan ang thread sa susunod na update.
        </Text>
      </ScrollView>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    color: colors.text,
    fontWeight: '800',
  },
  time: {
    color: colors.textDim,
    fontSize: 12,
  },
  preview: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 13,
  },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: colors.bg,
    fontSize: 11,
    fontWeight: '800',
  },
  soon: {
    marginTop: spacing.lg,
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
  },
});
