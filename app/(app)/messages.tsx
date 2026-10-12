import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';

type OngoingChat = {
  id: string;
  customerName: string;
  preview: string;
  time: string;
};

export default function MessagesScreen() {
  const { session } = useAuth();
  const [chats, setChats] = useState<OngoingChat[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChats = useCallback(async () => {
    const mechanicId = session?.user.id;
    if (!mechanicId) {
      setChats([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data: jobs, error: jobsError } = await supabase
      .from('service_requests')
      .select('id,motorist_id,status')
      .eq('mechanic_id', mechanicId);

    if (jobsError) {
      setChats([]);
      setLoading(false);
      return;
    }

    const ongoingStatuses = new Set(['pending', 'accepted', 'arrived', 'in_transit', 'in_progress', 'ongoing']);
    const ongoingJobs = (jobs ?? []).filter((job) =>
      ongoingStatuses.has(String(job.status ?? '').toLowerCase()),
    );
    if (ongoingJobs.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }

    const motoristIds = [...new Set(ongoingJobs.map((job) => job.motorist_id))];
    const [{ data: profiles }, { data: messages }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email').in('id', motoristIds),
      supabase
        .from('chat_messages')
        .select('service_request_id,body,created_at')
        .in('service_request_id', ongoingJobs.map((job) => job.id))
        .order('created_at', { ascending: false }),
    ]);
    const profileMap = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.full_name || profile.email || 'Customer']),
    );
    const latestByJob = new Map<string, { body: string; created_at: string }>();
    (messages ?? []).forEach((message) => {
      if (!latestByJob.has(message.service_request_id)) {
        latestByJob.set(message.service_request_id, message);
      }
    });
    setChats(
      ongoingJobs.map((job) => {
        const latest = latestByJob.get(job.id);
        return {
          id: job.id,
          customerName: profileMap.get(job.motorist_id) ?? 'Customer',
          preview: latest?.body ?? 'No messages yet. Open the ongoing booking to chat.',
          time: latest ? new Date(latest.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '',
        };
      }),
    );
    setLoading(false);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => {
    void loadChats();
  }, [loadChats]));

  return (
    <MechanicScreen title="Messages" subtitle="Motorist chats from ongoing bookings">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={colors.amber} /> : null}
        {!loading && chats.length === 0 ? (
          <Text style={styles.empty}>No ongoing motorist chats.</Text>
        ) : null}
        {chats.map((chat) => (
          <View key={chat.id} style={styles.row}>
            <View style={styles.avatar}>
              <Ionicons name="person-outline" size={18} color={colors.amber} />
            </View>
            <View style={styles.body}>
              <View style={styles.top}>
                <Text style={styles.name}>{chat.customerName}</Text>
                <Text style={styles.time}>{chat.time}</Text>
              </View>
              <Text style={styles.preview} numberOfLines={1}>
                {chat.preview}
              </Text>
            </View>
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
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
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
