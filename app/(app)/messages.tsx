import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';

type ChatMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
};

type Conversation = {
  id: string;
  counterpartId: string;
  counterpartName: string;
};

const ACTIVE_STATUSES = [
  'scheduled',
  'pending',
  'accepted',
  'arrived',
  'in_transit',
  'in_progress',
];

export default function MessagesScreen() {
  const { session } = useAuth();
  const { colors } = useAppTheme();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadConversation = async () => {
      if (!session?.user.id) {
        setConversation(null);
        setMessages([]);
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!active) return;
      if (profileError) {
        setError(profileError.message);
        setConversation(null);
        setLoading(false);
        return;
      }

      const isMechanic = profile?.role?.toLowerCase() === 'mechanic';
      setLoading(true);
      setError(null);
      const { data: request, error: requestError } = await supabase
        .from('service_requests')
        .select('id,mechanic_id,motorist_id')
        .eq(isMechanic ? 'mechanic_id' : 'motorist_id', session.user.id)
        .not(isMechanic ? 'motorist_id' : 'mechanic_id', 'is', null)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (requestError) {
        setError(requestError.message);
        setConversation(null);
        setLoading(false);
        return;
      }
      const counterpartId = isMechanic ? request?.motorist_id : request?.mechanic_id;
      if (!request || !counterpartId) {
        setConversation(null);
        setMessages([]);
        setLoading(false);
        return;
      }

      const { data: mechanic, error: mechanicError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', counterpartId)
        .maybeSingle();

      if (!active) return;
      if (mechanicError) {
        setError(mechanicError.message);
        setConversation(null);
        setLoading(false);
        return;
      }

      setConversation({
        id: request.id,
        counterpartId,
        counterpartName: mechanic?.full_name || (isMechanic ? 'Motorist' : 'Mechanic'),
      });
      setLoading(false);
    };

    void loadConversation();
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (!conversation) return;
    let active = true;

    const loadMessages = async () => {
      setLoading(true);
      const { data, error: messagesError } = await supabase
        .from('chat_messages')
        .select('id,sender_id,recipient_id,body,created_at')
        .eq('service_request_id', conversation.id)
        .order('created_at', { ascending: true });

      if (!active) return;
      if (messagesError) {
        setError(messagesError.message);
      } else {
        setMessages((data ?? []) as ChatMessage[]);
      }
      setLoading(false);
    };

    const channel = supabase
      .channel(`motorist_chat_${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `service_request_id=eq.${conversation.id}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          setMessages((current) =>
            current.some((message) => message.id === incoming.id)
              ? current
              : [...current, incoming],
          );
        },
      )
      .subscribe();

    void loadMessages();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [conversation]);

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || !session?.user.id || !conversation || sending) return;

    setSending(true);
    setError(null);
    const { data, error: sendError } = await supabase
      .from('chat_messages')
      .insert({
        service_request_id: conversation.id,
        sender_id: session.user.id,
        recipient_id: conversation.counterpartId,
        body,
      })
      .select('id,sender_id,recipient_id,body,created_at')
      .single();

    if (sendError) {
      setError(sendError.message);
    } else if (data) {
      setMessages((current) =>
        current.some((message) => message.id === data.id)
          ? current
          : [...current, data as ChatMessage],
      );
      setDraft('');
    }
    setSending(false);
  };

  return (
    <MechanicScreen back title="Chat">
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : !conversation ? (
          <View style={styles.emptyState}>
            <View style={[styles.iconCircle, { backgroundColor: colors.btnSecondary }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={34} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No active conversation</Text>
            <Text style={[styles.emptyMessage, { color: colors.textMuted }]}>
              Your mechanic chat will appear here after a mechanic accepts your booking.
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.conversationHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <View style={[styles.mechanicAvatar, { backgroundColor: colors.btnSecondary }]}>
                <Ionicons name="person" size={20} color={colors.primary} />
              </View>
              <View style={styles.conversationCopy}>
                <Text style={[styles.mechanicName, { color: colors.text }]}>{conversation.counterpartName}</Text>
                <Text style={[styles.conversationStatus, { color: colors.textMuted }]}>Booking conversation</Text>
              </View>
            </View>
            {error ? <Text style={[styles.error, { color: '#EF4444' }]}>{error}</Text> : null}
            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messageList}
              automaticallyAdjustKeyboardInsets
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={[styles.emptyChat, { color: colors.textMuted }]}>
                  Send a message to your mechanic.
                </Text>
              }
              renderItem={({ item }) => {
                const isMine = item.sender_id === session?.user.id;
                return (
                  <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowTheirs]}>
                    <View
                      style={[
                        styles.bubble,
                        { backgroundColor: isMine ? colors.primary : colors.card },
                        !isMine && { borderColor: colors.border, borderWidth: 1 },
                      ]}
                    >
                      <Text style={[styles.messageText, { color: isMine ? '#FFFFFF' : colors.text }]}>
                        {item.body}
                      </Text>
                      <Text style={[styles.timestamp, { color: isMine ? 'rgba(255,255,255,0.75)' : colors.textMuted }]}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
            <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
                multiline
                maxLength={500}
                editable={!sending}
              />
              <Pressable
                onPress={() => void sendMessage()}
                disabled={!draft.trim() || sending}
                style={[styles.sendButton, { backgroundColor: colors.primary }, (!draft.trim() || sending) && styles.disabled]}
                accessibilityLabel="Send message"
              >
                {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={19} color="#FFFFFF" />}
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loader: { marginTop: 40 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  emptyMessage: { fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: 'center' },
  conversationHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1 },
  mechanicAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  conversationCopy: { marginLeft: 10 },
  mechanicName: { fontSize: 16, fontWeight: '800' },
  conversationStatus: { fontSize: 12, marginTop: 2 },
  error: { paddingHorizontal: 16, paddingTop: 8, fontSize: 12 },
  messageList: { flexGrow: 1, padding: 16, paddingBottom: 24 },
  emptyChat: { marginTop: 24, textAlign: 'center', fontSize: 14 },
  messageRow: { width: '100%', marginBottom: 10 },
  messageRowMine: { alignItems: 'flex-end' },
  messageRowTheirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  messageText: { fontSize: 15, lineHeight: 20 },
  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 42, maxHeight: 100, borderWidth: 1, borderRadius: 20, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
});
