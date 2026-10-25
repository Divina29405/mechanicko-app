import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MotoristHomeHeader } from '@/components/MotoristHomeHeader';
import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { imageAssetToBytes } from '@/lib/chatMedia';
import { useLocalSearchParams } from 'expo-router';

type ChatMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  image_url?: string | null;
  created_at: string;
};

type Conversation = {
  id: string;
  counterpartId: string;
  counterpartName: string;
  counterpartRole: string;
  counterpartAvatarUrl: string | null;
};

type MessageFilter = 'all' | 'active';

const ACTIVE_STATUSES = [
  'scheduled',
  'pending',
  'accepted',
  'arrived',
  'in_transit',
  'in_progress',
  'ongoing',
];

export default function MessagesScreen() {
  const { session } = useAuth();
  const { colors } = useAppTheme();
  const { serviceRequestId } = useLocalSearchParams<{ serviceRequestId?: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');
  const [conversationOpen, setConversationOpen] = useState(false);
  const [isMechanic, setIsMechanic] = useState<boolean | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      const screenHeight = Dimensions.get('screen').height;
      setKeyboardHeight(
        Math.max(0, screenHeight - event.endCoordinates.screenY),
      );
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const conversationMatchesSearch = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return !normalizedQuery || Boolean(
      conversation?.counterpartName.toLowerCase().includes(normalizedQuery),
    );
  }, [conversation?.counterpartName, searchQuery]);

  useEffect(() => {
    let active = true;
    const loadConversation = async () => {
      setIsMechanic(null);
      setLoading(true);
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
      setIsMechanic(isMechanic);
      setError(null);
      let requestQuery = supabase
        .from('service_requests')
        .select('id,mechanic_id,motorist_id,status')
        .eq(isMechanic ? 'mechanic_id' : 'motorist_id', session.user.id);
      const { data: request, error: requestError } = serviceRequestId
        ? await requestQuery
            .eq('id', serviceRequestId)
            .in('status', ACTIVE_STATUSES)
            .maybeSingle()
        : await requestQuery
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

      const { data: counterpart, error: mechanicError } = await supabase
        .from('profiles')
        .select('full_name,role,avatar_path')
        .eq('id', counterpartId)
        .maybeSingle();

      if (!active) return;
      if (mechanicError) {
        setError(mechanicError.message);
        setConversation(null);
        setLoading(false);
        return;
      }

      let counterpartAvatarUrl: string | null = null;
      if (counterpart?.avatar_path) {
        const { data: signedAvatar } = await supabase.storage
          .from('mechanic-avatars')
          .createSignedUrl(counterpart.avatar_path, 60 * 60);
        counterpartAvatarUrl = signedAvatar?.signedUrl ?? null;
      }

      setConversation({
        id: request.id,
        counterpartId,
        counterpartName: counterpart?.full_name || (isMechanic ? 'Motorist' : 'Mechanic'),
        counterpartRole: counterpart?.role?.toLowerCase() === 'mechanic' ? 'Mechanic' : 'Motorist',
        counterpartAvatarUrl,
      });
      setConversationOpen(isMechanic || Boolean(serviceRequestId));
      setLoading(false);
    };

    void loadConversation();
    return () => {
      active = false;
    };
  }, [serviceRequestId, session?.user.id]);

  useEffect(() => {
    if (!session?.user.id || isMechanic === null) return;
    const ownerColumn = isMechanic ? 'mechanic_id' : 'motorist_id';
    const channel = supabase
      .channel(`message_booking_status_${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests',
          filter: `${ownerColumn}=eq.${session.user.id}`,
        },
        (payload) => {
          const updatedStatus = String(payload.new.status ?? '').toLowerCase();
          if (ACTIVE_STATUSES.includes(updatedStatus)) return;
          setConversation((current) => {
            if (current?.id !== String(payload.new.id)) return current;
            setMessages([]);
            setConversationOpen(false);
            return null;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isMechanic, session?.user.id]);

  useEffect(() => {
    if (!conversation) return;
    let active = true;

    const loadMessages = async () => {
      setLoading(true);
      let { data, error: messagesError } = await supabase
        .from('chat_messages')
        .select('id,sender_id,recipient_id,body,image_url,created_at')
        .eq('service_request_id', conversation.id)
        .order('created_at', { ascending: true });
      if (messagesError?.message.includes('image_url does not exist')) {
        const fallback = await supabase
          .from('chat_messages')
          .select('id,sender_id,recipient_id,body,created_at')
          .eq('service_request_id', conversation.id)
          .order('created_at', { ascending: true });
        data = fallback.data?.map((message) => ({
          ...message,
          image_url: null,
        })) ?? null;
        messagesError = fallback.error;
      }

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
    let { data, error: sendError } = await supabase
      .from('chat_messages')
      .insert({
        service_request_id: conversation.id,
        sender_id: session.user.id,
        recipient_id: conversation.counterpartId,
        body,
      })
      .select('id,sender_id,recipient_id,body,image_url,created_at')
      .single();
    if (sendError?.message.includes('image_url does not exist')) {
      const fallback = await supabase
        .from('chat_messages')
        .insert({
          service_request_id: conversation.id,
          sender_id: session.user.id,
          recipient_id: conversation.counterpartId,
          body,
        })
        .select('id,sender_id,recipient_id,body,created_at')
        .single();
      data = fallback.data
        ? { ...fallback.data, image_url: null }
        : null;
      sendError = fallback.error;
    }

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

  const sendImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!session?.user.id || !conversation || uploadingImage) return;
    setUploadingImage(true);
    setError(null);
    try {
      const { body, contentType } = await imageAssetToBytes(asset);
      const path = `${session.user.id}/${conversation.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(path, body, { contentType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { data: signedImage, error: signedError } = await supabase.storage
        .from('chat-media')
        .createSignedUrl(path, 60 * 60 * 24);
      if (signedError || !signedImage?.signedUrl) {
        throw new Error(signedError?.message || 'Unable to prepare the image.');
      }
      const { data, error: sendError } = await supabase
        .from('chat_messages')
        .insert({
          service_request_id: conversation.id,
          sender_id: session.user.id,
          recipient_id: conversation.counterpartId,
          body: null,
          image_url: signedImage.signedUrl,
        })
        .select('id,sender_id,recipient_id,body,image_url,created_at')
        .single();
      if (sendError) throw new Error(sendError.message);
      if (data) setMessages((current) => [...current, data as ChatMessage]);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Unable to send the image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const chooseImage = () => {
    Alert.alert('Send photo', 'Choose a photo source.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Camera',
        onPress: () => void (async () => {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            base64: true,
          });
          if (!result.canceled && result.assets[0]) await sendImage(result.assets[0]);
        })(),
      },
      {
        text: 'Gallery',
        onPress: () => void (async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            base64: true,
          });
          if (!result.canceled && result.assets[0]) await sendImage(result.assets[0]);
        })(),
      },
    ]);
  };

  return (
    <MechanicScreen
      back
      title="Chat"
      profileHeader={isMechanic === true}
      hideHeader={isMechanic !== true}
      safeAreaTop={isMechanic !== false}
    >
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {isMechanic === false ? (
        <MotoristHomeHeader />
      ) : null}
      {isMechanic === false && !conversationOpen && <View style={[styles.messagesHeader, { backgroundColor: colors.bg }]}>
        <View style={styles.messagesTitleRow}>
          <View>
            <Text style={[styles.messagesTitle, { color: colors.text }]}>Messages</Text>
            <Text style={[styles.messagesSubtitle, { color: colors.textMuted }]}>
              Direct chat with assigned mechanics &{"\n"}24/7 Roadside Support
            </Text>
          </View>
        </View>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={17} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search mechanic name..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
          />
          {searchQuery ? (
            <Pressable
              onPress={() => setSearchQuery('')}
              accessibilityLabel="Clear message search"
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setMessageFilter('all')}
            style={[styles.filterPill, { backgroundColor: messageFilter === 'all' ? colors.primary : colors.btnSecondary }]}
            accessibilityRole="button"
            accessibilityState={{ selected: messageFilter === 'all' }}
          >
            <Text style={[styles.activeFilterText, { color: messageFilter === 'all' ? "#FFFFFF" : colors.text } ]}>All</Text>
            <Text style={[styles.activeFilterCount, { color: messageFilter === 'all' ? "#FFFFFF" : colors.textMuted }]}>
              {conversation ? '1' : '0'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMessageFilter('active')}
            style={[
              styles.filterPill,
              { backgroundColor: messageFilter === 'active' ? colors.primary : colors.btnSecondary },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: messageFilter === 'active' }}
          >
            <View style={[styles.greenDot, messageFilter === 'active' && styles.selectedGreenDot]} />
            <Text style={[styles.serviceFilterText, { color: messageFilter === 'active' ? "#FFFFFF" : colors.text }]}>
              Active Service
            </Text>
            <Text style={[styles.serviceFilterCount, { color: messageFilter === 'active' ? "#FFFFFF" : colors.textMuted }]}>
              {conversation ? '1' : '0'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.recentRow}>
          <Text style={[styles.recentTitle, { color: colors.text }]}>RECENT CONVERSATIONS</Text>
        </View>
      </View>}
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {loading || isMechanic === null ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : !conversation ? (
          <View style={styles.emptyState}>
            <View style={[styles.iconCircle, { backgroundColor: colors.btnSecondary }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={34} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No active conversation</Text>
            <Text style={[styles.emptyMessage, { color: colors.textMuted }]}>
              {isMechanic
                ? 'Your motorist chat will appear here when you have an active booking.'
                : 'Your mechanic chat will appear here after a mechanic accepts your booking.'}
            </Text>
          </View>
        ) : !conversationOpen && !conversationMatchesSearch ? (
          <View style={styles.emptySearchState}>
            <Ionicons name="search-outline" size={30} color={colors.textMuted} />
            <Text style={[styles.emptySearchTitle, { color: colors.text }]}>No mechanic found</Text>
            <Text style={[styles.emptySearchMessage, { color: colors.textMuted }]}>
              Try searching with a different mechanic name.
            </Text>
          </View>
        ) : !conversationOpen ? (
          <Pressable
            onPress={() => setConversationOpen(true)}
            style={[styles.conversationPreview, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Open conversation with ${conversation.counterpartName}`}
          >
            <View style={styles.previewAvatarWrap}>
              {conversation.counterpartAvatarUrl ? (
                <ProfileAvatar
                  uri={conversation.counterpartAvatarUrl}
                  size={48}
                  backgroundColor={colors.btnSecondary}
                />
              ) : (
                <View style={[styles.mechanicAvatar, styles.largeMechanicAvatar, { backgroundColor: colors.btnSecondary }]}>
                  <Ionicons name="person" size={23} color={colors.primary} />
                </View>
              )}
              <View style={styles.onlineDot} />
            </View>
            <View style={styles.conversationCopy}>
              <View style={styles.previewNameRow}>
                <Text style={[styles.mechanicName, { color: colors.text }]}>{conversation.counterpartName}</Text>
                <Text style={[styles.previewTime, { color: colors.primary }]}>
                  {messages.length ? 'now' : ''}
                </Text>
              </View>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{conversation.counterpartRole}</Text>
              </View>
              <Text style={[styles.conversationStatus, { color: colors.textMuted }]}>
                {messages.length ? messages[messages.length - 1].body : 'Start a conversation'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        ) : (
          <>
            <View style={[styles.conversationHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {!isMechanic ? (
                <Pressable
                  onPress={() => setConversationOpen(false)}
                  accessibilityLabel="Back to conversations"
                  hitSlop={8}
                  style={styles.backButton}
                >
                  <Ionicons name="chevron-back" size={21} color="#000000" />
                </Pressable>
              ) : null}
              {conversation.counterpartAvatarUrl ? (
                <ProfileAvatar
                  uri={conversation.counterpartAvatarUrl}
                  size={42}
                  backgroundColor={colors.btnSecondary}
                />
              ) : (
                <View style={[styles.mechanicAvatar, { backgroundColor: colors.btnSecondary }]}>
                  <Ionicons name="person" size={20} color={colors.primary} />
                </View>
              )}
              <View style={styles.conversationCopy}>
                <Text style={[styles.mechanicName, { color: colors.text }]}>{conversation.counterpartName}</Text>
                <Text style={[styles.conversationStatus, { color: colors.textMuted }]}>
                  {conversation.counterpartRole} · Booking conversation
                </Text>
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
                      {item.image_url ? (
                        <Image source={{ uri: item.image_url }} style={styles.messageImage} />
                      ) : null}
                      {item.body ? (
                        <Text style={[styles.messageText, { color: isMine ? '#FFFFFF' : colors.text }]}>
                          {item.body}
                        </Text>
                      ) : null}
                      <Text style={[styles.timestamp, { color: isMine ? 'rgba(255,255,255,0.75)' : colors.textMuted }]}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
            <View
              style={[
                styles.composer,
                { backgroundColor: colors.card, borderTopColor: colors.border },
                Platform.OS === 'android' && keyboardHeight > 0 && {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: keyboardHeight,
                },
              ]}
            >
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
                onPress={chooseImage}
                disabled={sending || uploadingImage}
                style={styles.attachButton}
                accessibilityLabel="Send photo"
              >
                {uploadingImage ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="camera-outline" size={22} color={colors.primary} />}
              </Pressable>
              <Pressable
                onPress={() => void sendMessage()}
                disabled={!draft.trim() || sending || uploadingImage}
                style={[styles.sendButton, { backgroundColor: colors.primary }, (!draft.trim() || sending) && styles.disabled]}
                accessibilityLabel="Send message"
              >
                {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={19} color="#FFFFFF" />}
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
      </View>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  mechanicHeader: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  mechanicBackButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  mechanicHeaderTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  mechanicHeaderSpacer: { width: 40 },
  root: { flex: 1 },
  loader: { marginTop: 40 },
  messagesHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  messagesTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  messagesTitle: { fontSize: 26, lineHeight: 31, fontWeight: '800' },
  messagesSubtitle: { fontSize: 13, lineHeight: 17, marginTop: 4 },
  searchBar: { height: 44, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, marginTop: 14 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 0, paddingHorizontal: 9 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  filterPill: { height: 32, borderRadius: 16, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeFilterText: { color: '#172B66', fontSize: 13, fontWeight: '800' },
  activeFilterCount: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  selectedFilterText: { color: '#FFFFFF' },
  serviceFilterPill: { backgroundColor: '#E8ECFF' },
  selectedServiceFilter: { backgroundColor: '#1E3A8A' },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#19A957' },
  selectedGreenDot: { backgroundColor: '#86EFAC' },
  serviceFilterText: { color: '#172B66', fontSize: 13, fontWeight: '700' },
  serviceFilterCount: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  selectedServiceFilterText: { color: '#FFFFFF' },
  recentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
  recentTitle: { fontSize: 12, letterSpacing: 0.6, fontWeight: '800' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptySearchState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: 40 },
  emptySearchTitle: { fontSize: 17, fontWeight: '800', marginTop: 10 },
  emptySearchMessage: { fontSize: 13, textAlign: 'center', marginTop: 5 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  emptyMessage: { fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: 'center' },
  conversationHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderRadius: 12, marginHorizontal: 10, marginTop: 14, marginBottom: 4 },
  conversationPreview: { flexDirection: 'row', alignItems: 'center', padding: 16, borderWidth: 1, borderRadius: 14, marginHorizontal: 16, marginTop: 4 },
  previewAvatarWrap: { width: 50, height: 50, position: 'relative' },
  largeMechanicAvatar: { width: 48, height: 48, borderRadius: 24 },
  onlineDot: { position: 'absolute', right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, backgroundColor: '#16A34A', borderWidth: 2, borderColor: '#FFFFFF' },
  backButton: { marginRight: 5 },
  mechanicAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  conversationCopy: { flex: 1, marginLeft: 10 },
  mechanicName: { fontSize: 16, fontWeight: '800' },
  previewNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  previewTime: { fontSize: 12, fontWeight: '800' },
  roleBadge: { alignSelf: 'flex-start', backgroundColor: '#FEEDD5', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4, marginBottom: 4 },
  roleBadgeText: { color: '#E98200', fontSize: 11, fontWeight: '800' },
  conversationStatus: { fontSize: 12, marginTop: 2 },
  openConversationHint: { fontSize: 11, fontWeight: '700', marginTop: 7 },
  error: { paddingHorizontal: 16, paddingTop: 8, fontSize: 12 },
  messageList: { flexGrow: 1, padding: 12, paddingBottom: 24 },
  emptyChat: { marginTop: 24, textAlign: 'center', fontSize: 14 },
  messageRow: { width: '100%', marginBottom: 10 },
  messageRowMine: { alignItems: 'flex-end' },
  messageRowTheirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9 },
  messageText: { fontSize: 15, lineHeight: 20 },
  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 42, maxHeight: 100, borderWidth: 1, borderRadius: 20, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  attachButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  messageImage: { width: 220, height: 165, borderRadius: 12, marginBottom: 6 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
});
