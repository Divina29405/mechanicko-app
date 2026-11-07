import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import {
    MechanicText as Text,
    translateMechanicValue,
} from '@/components/mechanic/MechanicText';
import { MotoristHomeHeader } from '@/components/MotoristHomeHeader';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useMechanic } from '@/contexts/MechanicContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { imageAssetToBytes, refreshChatImageUrl } from '@/lib/chatMedia';
import { supabase } from '@/lib/supabase';
import { getMechanicThemeColors } from '@/lib/theme';
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
  requestIds: string[];
  bookings: { id: string; status: string; createdAt: string }[];
  historyStatus: string | null;
  counterpartId: string;
  counterpartName: string;
  counterpartRole: string;
  counterpartAvatarUrl: string | null;
  status: string;
  createdAt: string;
};

type MessageFilter = 'all' | 'active' | 'resolved' | 'cancelled';

const ACTIVE_STATUSES = [
  'scheduled',
  'pending',
  'accepted',
  'arrived',
  'in_transit',
  'in_progress',
  'ongoing',
];

const RESOLVED_STATUSES = [
  'completed',
  'done',
  'resolved',
  'closed',
];

const CANCELLED_STATUSES = [
  'cancelled',
  'canceled',
  'rejected',
  'dropped',
];

function formatChatDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getHistoryStatus(
  bookings: Conversation['bookings'],
): string | null {
  return (
    bookings.find(
      (booking) => !ACTIVE_STATUSES.includes(booking.status.toLowerCase()),
    )?.status ?? null
  );
}

function startsNewChatDate(messages: ChatMessage[], index: number) {
  if (index === 0) return true;
  return (
    new Date(messages[index - 1].created_at).toDateString() !==
    new Date(messages[index].created_at).toDateString()
  );
}

function getChatImageDisplaySize(width: number, height: number) {
  const aspectRatio = width / height;
  const displayHeight = Math.min(300, 220 / aspectRatio);
  return {
    width: displayHeight * aspectRatio,
    height: displayHeight,
  };
}

function isUuid(value: string | null): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
  );
}

export default function MessagesScreen() {
  const { session } = useAuth();
  const { isMechanic } = useMechanic();
  const { colors, language } = useAppTheme();
  const insets = useSafeAreaInsets();
  const palette = useMemo(() => getMechanicThemeColors(colors), [colors]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { serviceRequestId, counterpartId } = useLocalSearchParams<{
    serviceRequestId?: string;
    counterpartId?: string;
  }>();
  const requestedServiceRequestId = Array.isArray(serviceRequestId)
    ? serviceRequestId[0]
    : serviceRequestId;
  const requestedCounterpartId = Array.isArray(counterpartId)
    ? counterpartId[0]
    : counterpartId;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageFilter, setMessageFilter] = useState<MessageFilter | null>(null);
  const activeMessageFilter =
    messageFilter ?? (isMechanic ? 'resolved' : 'all');
  const [conversationOpen, setConversationOpen] = useState(false);
  const [showRecentConversations, setShowRecentConversations] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);
  const [hasUnlinkedBookings, setHasUnlinkedBookings] = useState(false);
  const [waitingForMechanic, setWaitingForMechanic] = useState(false);
  const [chatImageSizes, setChatImageSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [chatImageErrors, setChatImageErrors] = useState<
    Record<string, boolean>
  >({});
  const [viewingChatImage, setViewingChatImage] = useState<string | null>(null);
  const chatImageRefreshRequests = useRef(new Set<string>());
  const chatImageRefreshAttempts = useRef(new Set<string>());
  const historyListRef = useRef<FlatList<ChatMessage>>(null);
  const initialHistoryPositionSet = useRef(false);
  const requestedConversationResolved = useRef(false);
  const newestFirstMessages = useMemo(() => [...messages].reverse(), [messages]);

  const visibleConversations = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return conversations.filter((item) => {
      const normalizedStatus = item.status.trim().toLowerCase();
      const historyStatus = item.historyStatus?.toLowerCase() ?? '';
      const matchesFilter = isMechanic
        ? activeMessageFilter === 'resolved'
          ? RESOLVED_STATUSES.includes(historyStatus)
          : activeMessageFilter === 'cancelled'
            ? CANCELLED_STATUSES.includes(historyStatus)
            : false
        : activeMessageFilter === 'all' ||
          (activeMessageFilter === 'active' &&
            ACTIVE_STATUSES.includes(normalizedStatus));
      const matchesSearch =
        !normalizedQuery ||
        item.counterpartName.toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesSearch;
    });
  }, [activeMessageFilter, conversations, isMechanic, searchQuery]);

  const activeConversationCount = useMemo(
    () =>
      conversations.filter((item) =>
        ACTIVE_STATUSES.includes(item.status.toLowerCase()),
      ).length,
    [conversations],
  );
  const requestedConversationLoading = Boolean(
    !showRecentConversations &&
      (requestedServiceRequestId || requestedCounterpartId) &&
      loading &&
      !conversation &&
      !waitingForMechanic &&
      !error,
  );

  const conversationIsActive = Boolean(
    conversation && ACTIVE_STATUSES.includes(conversation.status.toLowerCase()),
  );
  const mechanicHasActiveBooking = Boolean(
    isMechanic &&
      conversation?.bookings.some((booking) =>
        ACTIVE_STATUSES.includes(booking.status.toLowerCase()),
      ),
  );
  const isOngoingBookingChat = Boolean(
    isMechanic &&
      requestedServiceRequestId &&
      conversation?.id === requestedServiceRequestId,
  );
  const canReplyInConversation =
    conversationIsActive &&
    (!mechanicHasActiveBooking || isOngoingBookingChat);

  const openConversation = (item: Conversation) => {
    chatImageRefreshAttempts.current.clear();
    setChatImageErrors({});
    setConversation(item);
    setConversationOpen(true);
    setMessages([]);
    setLoadingMessages(true);
    initialHistoryPositionSet.current = false;
    setError(null);
  };

  useEffect(() => {
    let active = true;
    requestedConversationResolved.current = false;
    const activeRequestedServiceRequestId = showRecentConversations
      ? undefined
      : requestedServiceRequestId;
    const activeRequestedCounterpartId = showRecentConversations
      ? undefined
      : requestedCounterpartId;
    const loadConversation = async () => {
      setLoading(true);
      const isRefreshingRequestedConversation = Boolean(
        activeRequestedServiceRequestId || activeRequestedCounterpartId,
      );
      if (!isRefreshingRequestedConversation) {
        setConversation(null);
        setConversations([]);
        setMessages([]);
        setHasUnlinkedBookings(false);
        setWaitingForMechanic(false);
      }
      setError(null);
      if (!session?.user.id) {
        setLoading(false);
        return;
      }

      const counterpartColumn = isMechanic ? 'motorist_id' : 'mechanic_id';
      let requestQuery = supabase
        .from('service_requests')
        .select('id,mechanic_id,motorist_id,status,created_at')
        .eq(isMechanic ? 'mechanic_id' : 'motorist_id', session.user.id)
        .not(counterpartColumn, 'is', null);
      if (activeRequestedCounterpartId) {
        requestQuery = requestQuery.eq(counterpartColumn, activeRequestedCounterpartId);
      } else if (activeRequestedServiceRequestId) {
        requestQuery = requestQuery.eq('id', activeRequestedServiceRequestId);
      }
      const { data: requests, error: requestError } = await requestQuery.order(
        'created_at',
        { ascending: false },
      );

      if (!active) return;
      if (requestError) {
        setError(requestError.message);
        setLoading(false);
        return;
      }
      const requestRows = requests ?? [];
      const chatRequestRows = requestRows.filter((request) =>
        isUuid(isMechanic ? request.motorist_id : request.mechanic_id),
      );
      setHasUnlinkedBookings(chatRequestRows.length < requestRows.length);
      const counterpartIds = [
        ...new Set(
          chatRequestRows
            .map((request) =>
              isMechanic ? request.motorist_id : request.mechanic_id,
            )
            .filter(isUuid),
        ),
      ];
      if (counterpartIds.length === 0) {
        setWaitingForMechanic(Boolean(requestedServiceRequestId) && !isMechanic);
        setLoadingMessages(false);
        setLoading(false);
        return;
      }

      const { data: counterparts, error: counterpartError } = await supabase
        .from('profiles')
        .select('id,full_name,role,avatar_path')
        .in('id', counterpartIds);
      if (!active) return;
      if (counterpartError) {
        setError(counterpartError.message);
        setLoading(false);
        return;
      }
      const counterpartById = new Map(
        (counterparts ?? []).map((item) => [item.id, item]),
      );
      const conversationByCounterpart = new Map<string, Conversation>();
      for (const request of chatRequestRows) {
        const counterpartId = isMechanic
          ? request.motorist_id
          : request.mechanic_id;
        if (!counterpartId) continue;
        const counterpart = counterpartById.get(counterpartId);
        const counterpartAvatarUrl = counterpart?.avatar_path
          ? supabase.storage
              .from('mechanic-avatars')
              .getPublicUrl(counterpart.avatar_path).data.publicUrl
          : null;
        const status = String(request.status ?? '');
        const existingConversation =
          conversationByCounterpart.get(counterpartId);
        if (existingConversation) {
          existingConversation.requestIds.push(request.id);
          existingConversation.bookings.push({
            id: request.id,
            status,
            createdAt: request.created_at,
          });
          if (
            !existingConversation.historyStatus &&
            !ACTIVE_STATUSES.includes(status.toLowerCase())
          ) {
            existingConversation.historyStatus = status;
          }
        } else {
          conversationByCounterpart.set(counterpartId, {
            id: request.id,
            requestIds: [request.id],
            bookings: [{
              id: request.id,
              status,
              createdAt: request.created_at,
            }],
            historyStatus: ACTIVE_STATUSES.includes(status.toLowerCase())
              ? null
              : status,
            counterpartId,
            counterpartName:
              counterpart?.full_name || (isMechanic ? 'Motorist' : 'Mechanic'),
            counterpartRole:
              counterpart?.role?.toLowerCase() === 'mechanic'
                ? 'Mechanic'
                : 'Motorist',
            counterpartAvatarUrl,
            status,
            createdAt: request.created_at,
          });
        }
      }
      const availableConversations = [...conversationByCounterpart.values()];
      if (!active) return;
      setConversations(availableConversations);
      const requestedConversation = activeRequestedCounterpartId
        ? availableConversations.find(
            (item) => item.counterpartId === activeRequestedCounterpartId,
          ) ?? null
        : activeRequestedServiceRequestId
        ? availableConversations.find((item) =>
            item.requestIds.includes(activeRequestedServiceRequestId),
          ) ?? null
        : null;
      if (requestedConversation) {
        requestedConversationResolved.current = true;
      }
      setConversation(requestedConversation);
      setConversationOpen(Boolean(requestedConversation));
      if (!requestedConversation) {
        setLoadingMessages(false);
      }
      setWaitingForMechanic(false);
      initialHistoryPositionSet.current = false;
      setLoading(false);
    };

    void loadConversation();
    const refreshInterval =
      activeRequestedServiceRequestId && !isMechanic
        ? setInterval(() => {
            if (!requestedConversationResolved.current) {
              void loadConversation();
            }
          }, 2000)
        : null;
    return () => {
      active = false;
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [
    isMechanic,
    requestedCounterpartId,
    requestedServiceRequestId,
    showRecentConversations,
    session?.user.id,
  ]);

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    const ownerColumn = isMechanic ? 'mechanic_id' : 'motorist_id';
    const refreshBookingStatuses = async () => {
      const { data: currentRequests, error } = await supabase
        .from('service_requests')
        .select('id,status')
        .eq(ownerColumn, session.user.id);
      if (!active || error || !currentRequests) return;

      const statusById = new Map(
        currentRequests.map((request) => [request.id, String(request.status ?? '')]),
      );
      const updateConversation = (item: Conversation): Conversation => {
        const bookings = item.bookings.map((booking) => ({
          ...booking,
          status: statusById.get(booking.id) ?? booking.status,
        }));
        return {
          ...item,
          status: statusById.get(item.id) ?? item.status,
          bookings,
          historyStatus: getHistoryStatus(bookings),
        };
      };
      setConversations((current) => current.map(updateConversation));
      setConversation((current) =>
        current ? updateConversation(current) : current,
      );
    };
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
          const updatedStatus = String(payload.new.status ?? '');
          const updatedId = String(payload.new.id);
          setConversations((current) =>
            current.map((item) =>
              item.requestIds.includes(updatedId)
                ? {
                    ...item,
                    status:
                      item.id === updatedId ? updatedStatus : item.status,
                    bookings: item.bookings.map((booking) =>
                      booking.id === updatedId
                        ? { ...booking, status: updatedStatus }
                        : booking,
                    ),
                    historyStatus: getHistoryStatus(
                      item.bookings.map((booking) =>
                        booking.id === updatedId
                          ? { ...booking, status: updatedStatus }
                          : booking,
                      ),
                    ),
                  }
                : item,
            ),
          );
          setConversation((current) =>
            current?.requestIds.includes(updatedId)
              ? {
                  ...current,
                  status:
                    current.id === updatedId ? updatedStatus : current.status,
                  bookings: current.bookings.map((booking) =>
                    booking.id === updatedId
                      ? { ...booking, status: updatedStatus }
                      : booking,
                  ),
                  historyStatus: getHistoryStatus(
                    current.bookings.map((booking) =>
                      booking.id === updatedId
                        ? { ...booking, status: updatedStatus }
                        : booking,
                    ),
                  ),
                }
              : current,
          );
        },
      )
      .subscribe();
    const refreshInterval = setInterval(() => {
      void refreshBookingStatuses();
    }, 2000);

    return () => {
      active = false;
      clearInterval(refreshInterval);
      void supabase.removeChannel(channel);
    };
  }, [isMechanic, session?.user.id]);

  const conversationId = conversation?.id;
  const conversationRequestIds = useMemo(
    () => conversation?.requestIds ?? [],
    [conversation?.requestIds],
  );

  useEffect(() => {
    if (
      !conversationOpen ||
      conversationRequestIds.length === 0 ||
      !session?.user.id
    ) {
      return;
    }

    let active = true;
    const markConversationNotificationsRead = async () => {
      const { error: markReadError } = await supabase
        .from("app_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", session.user.id)
        .eq("type", "chat_message")
        .in("service_request_id", conversationRequestIds)
        .is("read_at", null);
      if (!active) return;
      if (markReadError) {
        console.warn(
          "Could not mark booking chat notifications as read:",
          markReadError.message,
        );
      }
    };

    void markConversationNotificationsRead();
    return () => {
      active = false;
    };
  }, [conversationOpen, conversationRequestIds, session?.user.id]);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;

    const loadMessages = async () => {
      setLoadingMessages(true);
      let { data, error: messagesError } = await supabase
        .from('chat_messages')
        .select('id,sender_id,recipient_id,body,image_url,created_at')
        .in('service_request_id', conversationRequestIds)
        .order('created_at', { ascending: true });
      if (messagesError?.message.includes('image_url does not exist')) {
        const fallback = await supabase
          .from('chat_messages')
          .select('id,sender_id,recipient_id,body,created_at')
          .in('service_request_id', conversationRequestIds)
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
        const loadedMessages = (data ?? []) as ChatMessage[];
        setMessages(loadedMessages);
        void Promise.all(
          loadedMessages.map(async (message) => {
            if (!message.image_url || message.image_url.includes('://')) {
              return null;
            }
            try {
              const imageUrl = await refreshChatImageUrl(message.image_url);
              return { id: message.id, imageUrl };
            } catch (imageError) {
              console.warn(
                `Could not load chat photo ${message.id}:`,
                imageError instanceof Error
                  ? imageError.message
                  : imageError,
              );
              return null;
            }
          }),
        ).then((refreshedImages) => {
          if (!active) return;
          const imageUrlById = new Map(
            refreshedImages
              .filter(
                (
                  image,
                ): image is { id: string; imageUrl: string } =>
                  image !== null,
              )
              .map((image) => [image.id, image.imageUrl]),
          );
          if (imageUrlById.size === 0) return;
          setMessages((current) =>
            current.map((message) => {
              const imageUrl = imageUrlById.get(message.id);
              return imageUrl ? { ...message, image_url: imageUrl } : message;
            }),
          );
        });
      }
      setLoadingMessages(false);
    };

    const channel = conversationRequestIds.reduce(
      (currentChannel, requestId) =>
        currentChannel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `service_request_id=eq.${requestId}`,
          },
          (payload) => {
            const incoming = payload.new as ChatMessage;
            setMessages((current) =>
              current.some((message) => message.id === incoming.id)
                ? current
                : [...current, incoming],
            );
            if (
              incoming.recipient_id === session?.user.id &&
              incoming.id &&
              session?.user.id
            ) {
              void supabase
                .from("app_notifications")
                .update({ read_at: new Date().toISOString() })
                .eq("user_id", session.user.id)
                .eq("type", "chat_message")
                .eq("chat_message_id", incoming.id)
                .is("read_at", null)
                .then(({ error: markReadError }) => {
                  if (markReadError) {
                    console.warn(
                      "Could not mark incoming chat notification as read:",
                      markReadError.message,
                    );
                  }
                });
            }
          },
        ),
      supabase.channel(`mechanic_pair_chat_${conversation?.counterpartId}`),
    ).subscribe();

    const refreshTimer = setInterval(() => {
      if (!active) return;
      void supabase
        .from('chat_messages')
        .select('id,sender_id,recipient_id,body,image_url,created_at')
        .in('service_request_id', conversationRequestIds)
        .order('created_at', { ascending: true })
        .then(({ data: latestData, error: latestError }) => {
          if (!active) return;
          if (latestError) {
            console.warn(
              'Could not refresh the open conversation:',
              latestError.message,
            );
            return;
          }
          const latestMessages = (latestData ?? []) as ChatMessage[];
          setMessages((current) => {
            const currentById = new Map(current.map((message) => [message.id, message]));
            return latestMessages.map((message) => ({
              ...message,
              image_url: currentById.get(message.id)?.image_url ?? message.image_url,
            }));
          });
        });
    }, 1500);

    void loadMessages();
    return () => {
      active = false;
      clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [
    conversation?.counterpartId,
    conversationId,
    conversationRequestIds,
    session?.user.id,
  ]);

  async function refreshConversationImage(messageId: string, imageUrl: string) {
    if (chatImageRefreshRequests.current.has(messageId)) return;
    if (chatImageRefreshAttempts.current.has(messageId)) {
      setChatImageErrors((current) => ({ ...current, [imageUrl]: true }));
      return;
    }
    chatImageRefreshAttempts.current.add(messageId);
    chatImageRefreshRequests.current.add(messageId);
    setChatImageErrors((current) => ({ ...current, [imageUrl]: false }));
    try {
      const refreshedUrl = await refreshChatImageUrl(imageUrl);
      if (refreshedUrl === imageUrl) {
        setChatImageErrors((current) => ({ ...current, [imageUrl]: true }));
        return;
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, image_url: refreshedUrl }
            : message,
        ),
      );
    } catch (imageError) {
      setError(
        imageError instanceof Error
          ? imageError.message
          : 'Unable to reload this chat photo.',
      );
      setChatImageErrors((current) => ({ ...current, [imageUrl]: true }));
    } finally {
      chatImageRefreshRequests.current.delete(messageId);
    }
  }

  async function retryConversationImage(messageId: string, imageUrl: string) {
    chatImageRefreshAttempts.current.delete(messageId);
    setChatImageErrors((current) => ({ ...current, [imageUrl]: false }));
    await refreshConversationImage(messageId, imageUrl);
  }

  const sendMessage = async () => {
    const body = draft.trim();
    if (
      !body ||
      !session?.user.id ||
      !conversation ||
      !canReplyInConversation ||
      sending
    ) {
      return;
    }

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
    if (
      !session?.user.id ||
      !conversation ||
      !canReplyInConversation ||
      uploadingImage
    ) {
      return;
    }
    setUploadingImage(true);
    setError(null);
    try {
      const { body, contentType } = await imageAssetToBytes(asset);
      const path = `${session.user.id}/${conversation.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(path, body, { contentType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { data, error: sendError } = await supabase
        .from('chat_messages')
        .insert({
          service_request_id: conversation.id,
          sender_id: session.user.id,
          recipient_id: conversation.counterpartId,
          body: null,
          image_url: path,
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

  const selectPhotoSource = async (source: 'camera' | 'gallery') => {
    setPhotoPickerVisible(false);
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            base64: true,
          });
    if (!result.canceled && result.assets[0]) {
      await sendImage(result.assets[0]);
    }
  };

  const chooseImage = () => setPhotoPickerVisible(true);

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
            placeholder={translateMechanicValue('Search mechanic name...', language)}
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
            style={[styles.filterPill, { backgroundColor: activeMessageFilter === 'all' ? colors.primary : colors.btnSecondary }]}
            accessibilityRole="button"
            accessibilityState={{ selected: activeMessageFilter === 'all' }}
          >
            <Text style={[styles.activeFilterText, { color: activeMessageFilter === 'all' ? "#FFFFFF" : colors.text } ]}>All</Text>
            <Text style={[styles.activeFilterCount, { color: activeMessageFilter === 'all' ? "#FFFFFF" : colors.textMuted }]}>
              {conversations.length}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMessageFilter('active')}
            style={[
              styles.filterPill,
              { backgroundColor: activeMessageFilter === 'active' ? colors.primary : colors.btnSecondary },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: activeMessageFilter === 'active' }}
          >
            <View style={[styles.greenDot, activeMessageFilter === 'active' && styles.selectedGreenDot]} />
            <Text style={[styles.serviceFilterText, { color: activeMessageFilter === 'active' ? "#FFFFFF" : colors.text }]}>
              Active Service
            </Text>
            <Text style={[styles.serviceFilterCount, { color: activeMessageFilter === 'active' ? "#FFFFFF" : colors.textMuted }]}>
              {activeConversationCount}
            </Text>
          </Pressable>
        </View>
        <View style={styles.recentRow}>
          <Text style={[styles.recentTitle, { color: colors.text }]}>RECENT CONVERSATIONS</Text>
        </View>
      </View>}
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {isMechanic && !conversationOpen ? (
          <View style={[styles.filterRow, styles.mechanicFilterRow]}>
            <Pressable
              onPress={() => setMessageFilter('resolved')}
              style={[
                styles.filterPill,
                {
                  backgroundColor:
                    activeMessageFilter === 'resolved'
                      ? palette.blue
                      : palette.blueSoft,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: activeMessageFilter === 'resolved' }}
            >
              <Text
                style={[
                  styles.mechanicFilterText,
                  {
                    color:
                      activeMessageFilter === 'resolved' ? '#FFFFFF' : palette.blue,
                  },
                ]}
              >
                Resolved
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMessageFilter('cancelled')}
              style={[
                styles.filterPill,
                {
                  backgroundColor:
                    activeMessageFilter === 'cancelled'
                      ? palette.blue
                      : palette.blueSoft,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: activeMessageFilter === 'cancelled' }}
            >
              <Text
                style={[
                  styles.mechanicFilterText,
                  {
                    color:
                      activeMessageFilter === 'cancelled' ? '#FFFFFF' : palette.blue,
                  },
                ]}
              >
                Cancelled
              </Text>
            </Pressable>
          </View>
        ) : null}
        {(loading || requestedConversationLoading) && !conversationOpen ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : conversations.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.iconCircle, { backgroundColor: colors.btnSecondary }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={34} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {error
                ? 'Unable to load conversations'
                : waitingForMechanic
                  ? 'Waiting for mechanic acceptance'
                : hasUnlinkedBookings
                  ? 'Some bookings are not chat-enabled'
                  : 'No conversations yet'}
            </Text>
            <Text style={[styles.emptyMessage, { color: colors.textMuted }]}>
              {error
                ? error
                : waitingForMechanic
                  ? 'Chat will be available here after a mechanic accepts your booking.'
                : hasUnlinkedBookings
                  ? 'Guest bookings do not have a motorist account to message.'
                  : isMechanic
                    ? 'Booking conversations with motorists will appear here.'
                    : 'Your conversations with mechanics will appear here after a booking is accepted.'}
            </Text>
          </View>
        ) : !conversationOpen || !conversation ? (
          <FlatList
            data={visibleConversations}
            keyExtractor={(item) => item.id}
            style={styles.conversationList}
            contentContainerStyle={[
              styles.conversationListContent,
              isMechanic && styles.mechanicConversationListContent,
            ]}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            ListEmptyComponent={
              <View style={styles.emptySearchState}>
                <Ionicons name="search-outline" size={30} color={colors.textMuted} />
                <Text style={[styles.emptySearchTitle, { color: colors.text }]}>
                  No conversations found
                </Text>
                <Text style={[styles.emptySearchMessage, { color: colors.textMuted }]}>
                  {isMechanic
                    ? 'Try switching between Resolved and Cancelled.'
                    : 'Try another search or select All to view past conversations.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isActive = !isMechanic && ACTIVE_STATUSES.includes(item.status.toLowerCase());
              return (
                <Pressable
                  onPress={() => openConversation(item)}
                  style={[
                    styles.conversationPreview,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${isActive ? 'active' : 'past'} conversation with ${item.counterpartName}`}
                >
                  <View style={styles.previewAvatarWrap}>
                    {item.counterpartAvatarUrl ? (
                      <ProfileAvatar
                        uri={item.counterpartAvatarUrl}
                        size={48}
                        backgroundColor={colors.btnSecondary}
                      />
                    ) : (
                      <View
                        style={[
                          styles.mechanicAvatar,
                          styles.largeMechanicAvatar,
                          { backgroundColor: colors.btnSecondary },
                        ]}
                      >
                        <Ionicons name="person" size={23} color={colors.primary} />
                      </View>
                    )}
                  </View>
                  <View style={styles.conversationCopy}>
                    <Text style={[styles.mechanicName, { color: colors.text }]}>
                      {item.counterpartName}
                    </Text>
                    <Text style={[styles.conversationStatus, { color: colors.textMuted }]}>
                      {item.counterpartRole} · {formatChatDate(item.createdAt)}
                    </Text>
                    <Text
                      style={[
                        styles.conversationStatus,
                        { color: isActive ? colors.primary : colors.textMuted },
                      ]}
                    >
                      {isMechanic
                        ? `Chat history · ${item.historyStatus || 'Booking'}`
                        : isActive
                          ? 'Active booking'
                          : `Past booking · ${item.status}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </Pressable>
              );
            }}
          />
        ) : (
          <>
            <View style={[styles.conversationHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                onPress={() => {
                  setConversationOpen(false);
                  setConversation(null);
                  setMessages([]);
                  setShowRecentConversations(true);
                }}
                accessibilityLabel="Back to conversations"
                hitSlop={8}
                style={styles.backButton}
              >
                <Ionicons name="chevron-back" size={21} color={colors.text} />
              </Pressable>
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
                  {conversation.counterpartRole} · {conversation.status}
                </Text>
              </View>
            </View>
            {!conversationIsActive ? (
              <Text style={[styles.readOnlyNotice, { color: colors.textMuted }]}>
                Past booking history · Read only · {conversation.status}
              </Text>
            ) : null}
            {error ? <Text style={[styles.error, { color: '#EF4444' }]}>{error}</Text> : null}
            <KeyboardAvoidingView
              style={styles.root}
              enabled={Platform.OS === 'ios' || conversationIsActive}
              behavior={isMechanic && !isOngoingBookingChat ? 'height' : 'padding'}
              keyboardVerticalOffset={
                Platform.OS === 'ios' ? 88 : 40
              }
              automaticOffset={!isMechanic || isOngoingBookingChat}
            >
                {loadingMessages ? (
                  <View style={styles.chatHistoryLoading}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : (
                  <FlatList
                    key={conversation.id}
                    ref={historyListRef}
                    data={newestFirstMessages}
                    keyExtractor={(item) => item.id}
                    style={styles.root}
                    contentContainerStyle={styles.messageList}
                    inverted
                    automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => {
                      if (initialHistoryPositionSet.current || messages.length === 0) {
                        return;
                      }
                      initialHistoryPositionSet.current = true;
                      requestAnimationFrame(() => {
                        historyListRef.current?.scrollToOffset({
                          offset: 0,
                          animated: false,
                        });
                      });
                    }}
                    ListEmptyComponent={
                      <Text style={[styles.emptyChat, { color: colors.textMuted }]}>
                        {conversationIsActive
                          ? 'Send a message to your mechanic.'
                          : 'No messages were recorded for this booking.'}
                      </Text>
                    }
                    renderItem={({ item, index }) => {
                const isMine = item.sender_id === session?.user.id;
                const originalIndex = messages.length - index - 1;
                const messageTime = new Date(item.created_at).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                });
                const messageMeta = (
                  <View
                    style={[
                      styles.messageMeta,
                      isMine ? styles.messageMetaMine : styles.messageMetaTheirs,
                    ]}
                  >
                    <Text style={[styles.timestamp, { color: colors.textMuted }]}>
                      {messageTime}
                    </Text>
                    {isMine ? (
                      <Ionicons
                        name="checkmark-done"
                        size={14}
                        color={colors.primary}
                      />
                    ) : null}
                  </View>
                );
                return (
                  <View>
                    {startsNewChatDate(messages, originalIndex) ? (
                      <View style={styles.dateSeparator}>
                        <Text
                          style={[
                            styles.dateSeparatorText,
                            { color: colors.textMuted },
                          ]}
                        >
                          {formatChatDate(item.created_at)}
                        </Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.messageRow,
                        isMine ? styles.messageRowMine : styles.messageRowTheirs,
                      ]}
                    >
                      {item.image_url ? (
                        <View
                          style={[
                            styles.historyImageMessage,
                            isMine && styles.historyImageMessageMine,
                          ]}
                        >
                          {chatImageErrors[item.image_url] ? (
                            <Pressable
                              style={[
                                styles.chatImageError,
                                { backgroundColor: colors.card },
                              ]}
                              onPress={() =>
                                void retryConversationImage(item.id, item.image_url!)
                              }
                              accessibilityRole="button"
                              accessibilityLabel="Retry loading photo"
                            >
                              <Ionicons
                                name="reload-circle-outline"
                                size={22}
                                color={colors.primary}
                              />
                              <Text
                                style={[
                                  styles.chatImageErrorText,
                                  { color: colors.textMuted },
                                ]}
                              >
                                Photo unavailable · Tap to retry
                              </Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() => setViewingChatImage(item.image_url ?? null)}
                              accessibilityRole="button"
                              accessibilityLabel="View image"
                              style={[
                                styles.chatImagePreview,
                                chatImageSizes[item.id]
                                  ? getChatImageDisplaySize(
                                      chatImageSizes[item.id].width,
                                      chatImageSizes[item.id].height,
                                    )
                                  : { width: 220, height: 160 },
                                { backgroundColor: colors.card },
                              ]}
                            >
                              {!chatImageSizes[item.id] ? (
                                <ActivityIndicator
                                  style={StyleSheet.absoluteFill}
                                  color={colors.primary}
                                />
                              ) : null}
                              <ExpoImage
                                source={{
                                  uri: item.image_url,
                                  cacheKey: `chat-message-${item.id}`,
                                }}
                                cachePolicy="memory-disk"
                                contentFit="contain"
                                style={styles.chatMessageImage}
                                onLoad={({ source }) => {
                                  if (source.width > 0 && source.height > 0) {
                                    setChatImageSizes((current) => ({
                                      ...current,
                                      [item.id]: {
                                        width: source.width,
                                        height: source.height,
                                      },
                                    }));
                                  }
                                }}
                                onError={() =>
                                  void refreshConversationImage(
                                    item.id,
                                    item.image_url!,
                                  )
                                }
                              />
                            </Pressable>
                          )}
                          {item.body ? (
                            <View
                              style={[
                                styles.historyTextBubble,
                                isMine && styles.historyTextBubbleMine,
                                isMine
                                  ? {
                                      backgroundColor: colors.primary,
                                      borderColor: colors.primary,
                                    }
                                  : {
                                      backgroundColor: colors.card,
                                      borderColor: colors.border,
                                    },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.messageText,
                                  { color: isMine ? '#FFFFFF' : colors.text },
                                ]}
                              >
                                {item.body}
                              </Text>
                            </View>
                          ) : null}
                          {messageMeta}
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.historyTextMessage,
                            isMine && styles.historyTextMessageMine,
                          ]}
                        >
                          <View
                            style={[
                              styles.historyTextBubble,
                              isMine && styles.historyTextBubbleMine,
                              isMine
                                ? {
                                    backgroundColor: colors.primary,
                                    borderColor: colors.primary,
                                  }
                                : {
                                    backgroundColor: colors.card,
                                    borderColor: colors.border,
                                  },
                            ]}
                          >
                            {item.body ? (
                              <Text
                                style={[
                                  styles.messageText,
                                  { color: isMine ? '#FFFFFF' : colors.text },
                                ]}
                              >
                                {item.body}
                              </Text>
                            ) : null}
                          </View>
                          {messageMeta}
                        </View>
                      )}
                    </View>
                  </View>
                );
                    }}
                  />
                )}
              {canReplyInConversation ? (
                  <View
                    style={[
                      styles.composer,
                      { backgroundColor: colors.card, borderTopColor: colors.border },
                    ]}
                  >
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      placeholder={translateMechanicValue('Type a message...', language)}
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
              ) : mechanicHasActiveBooking ? (
                <Text style={[styles.readOnlyNotice, { color: colors.textMuted }]}>
                  Please use the ongoing booking to message this customer.
                </Text>
              ) : null}
            </KeyboardAvoidingView>
          </>
        )}
      </View>
      <Modal
        visible={viewingChatImage !== null}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setViewingChatImage(null)}
      >
        <View style={styles.chatImageViewer}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setViewingChatImage(null)}
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
          />
          {viewingChatImage ? (
            <Image
              source={{ uri: viewingChatImage }}
              style={styles.chatImageViewerImage}
              resizeMode="contain"
              accessibilityLabel="Expanded chat image"
            />
          ) : null}
          <Pressable
            style={styles.chatImageViewerClose}
            onPress={() => setViewingChatImage(null)}
            accessibilityRole="button"
            accessibilityLabel="Close image"
          >
            <Ionicons name="close" size={25} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
      <Modal
        visible={photoPickerVisible}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => setPhotoPickerVisible(false)}
      >
        <View style={styles.photoPickerOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPhotoPickerVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close photo options"
          />
          <View
            style={[
              styles.photoPickerSheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.photoPickerHandle} />
            <View style={styles.photoPickerHeader}>
              <View style={styles.photoPickerHeaderText}>
                <Text style={styles.photoPickerTitle}>Send a photo</Text>
                <Text style={styles.photoPickerSubtitle}>
                  Choose how you want to add an image
                </Text>
              </View>
              <Pressable
                style={styles.photoPickerClose}
                onPress={() => setPhotoPickerVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close photo options"
              >
                <Ionicons name="close" size={21} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.photoPickerOptions}>
              <Pressable
                style={styles.photoPickerOption}
                onPress={() => void selectPhotoSource('camera')}
                accessibilityRole="button"
              >
                <Image
                  source={require('../../assets/images/camera.png')}
                  style={styles.photoPickerOptionImage}
                  resizeMode="contain"
                />
                <View style={styles.photoPickerOptionCopy}>
                  <Text style={styles.photoPickerOptionTitle}>Take a photo</Text>
                  <Text style={styles.photoPickerOptionHint}>Open the camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
              </Pressable>
              <Pressable
                style={styles.photoPickerOption}
                onPress={() => void selectPhotoSource('gallery')}
                accessibilityRole="button"
              >
                <Image
                  source={require('../../assets/images/gallery.png')}
                  style={styles.photoPickerOptionImage}
                  resizeMode="contain"
                />
                <View style={styles.photoPickerOptionCopy}>
                  <Text style={styles.photoPickerOptionTitle}>Choose from gallery</Text>
                  <Text style={styles.photoPickerOptionHint}>
                    Select an existing image
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
              </Pressable>
            </View>
            <Pressable
              style={styles.photoPickerCancel}
              onPress={() => setPhotoPickerVisible(false)}
            >
              <Text style={styles.photoPickerCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      </View>
    </MechanicScreen>
  );
}

function createStyles(palette: ReturnType<typeof getMechanicThemeColors>) {
  return StyleSheet.create({
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
  mechanicFilterRow: { justifyContent: 'flex-start', paddingHorizontal: 24 },
  filterPill: { height: 32, borderRadius: 16, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 6 },
  mechanicFilterText: { fontSize: 13, fontWeight: '800' },
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
  conversationList: { flex: 1 },
  conversationListContent: { paddingBottom: 16 },
  mechanicConversationListContent: { paddingTop: 12 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptySearchState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: 40 },
  emptySearchTitle: { fontSize: 17, fontWeight: '800', marginTop: 10 },
  emptySearchMessage: { fontSize: 13, textAlign: 'center', marginTop: 5 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  emptyMessage: { fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: 'center' },
  conversationHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderRadius: 12, marginHorizontal: 10, marginTop: 14, marginBottom: 4 },
  readOnlyNotice: { fontSize: 12, textAlign: 'center', paddingHorizontal: 16, paddingVertical: 8 },
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
  chatHistoryLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyChat: { marginTop: 24, textAlign: 'center', fontSize: 14 },
  dateSeparator: { alignItems: 'center', marginVertical: 12 },
  dateSeparatorText: { fontSize: 12, fontWeight: '700' },
  messageRow: { width: '100%', marginBottom: 10, flexDirection: 'row' },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowTheirs: { justifyContent: 'flex-start' },
  historyTextMessage: { maxWidth: '82%', alignItems: 'flex-start' },
  historyTextMessageMine: { alignItems: 'flex-end' },
  historyImageMessage: { maxWidth: '84%', alignItems: 'flex-start' },
  historyImageMessageMine: { alignItems: 'flex-end' },
  historyTextBubble: { maxWidth: '100%', borderRadius: 18, borderBottomLeftRadius: 5, borderWidth: 1, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7 },
  historyTextBubbleMine: { borderBottomLeftRadius: 18, borderBottomRightRadius: 5 },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, paddingHorizontal: 2 },
  messageMetaMine: { alignSelf: 'flex-end' },
  messageMetaTheirs: { alignSelf: 'flex-start' },
  timestamp: { fontSize: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 42, maxHeight: 100, borderWidth: 1, borderRadius: 20, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  attachButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  chatImagePreview: { overflow: 'hidden', borderRadius: 12 },
  chatMessageImage: { width: '100%', height: '100%', borderRadius: 12 },
  chatImageLoadingPlaceholder: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  chatImageError: { width: 220, minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 12 },
  chatImageErrorText: { maxWidth: 160, fontSize: 11, fontWeight: '700' },
  chatImageViewer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.96)' },
  chatImageViewerImage: { position: 'absolute', top: '8%', bottom: '8%', width: '100%' },
  chatImageViewerClose: { position: 'absolute', top: 50, right: 16, zIndex: 1, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  photoPickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16, 24, 40, 0.56)' },
  photoPickerSheet: { paddingHorizontal: 24, paddingTop: 10, backgroundColor: palette.bgElevated, borderTopLeftRadius: 26, borderTopRightRadius: 26, shadowColor: '#101828', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.16, shadowRadius: 20, elevation: 18 },
  photoPickerHandle: { width: 38, height: 4, alignSelf: 'center', marginBottom: 16, borderRadius: 2, backgroundColor: palette.border },
  photoPickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  photoPickerHeaderText: { flex: 1 },
  photoPickerTitle: { color: palette.text, fontSize: 20, fontWeight: '800' },
  photoPickerSubtitle: { color: palette.textMuted, fontSize: 13, marginTop: 4 },
  photoPickerClose: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg },
  photoPickerOptions: { gap: 8 },
  photoPickerOption: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: palette.border, borderRadius: 16, backgroundColor: palette.bgElevated },
  photoPickerOptionImage: { width: 42, height: 42 },
  photoPickerOptionCopy: { flex: 1 },
  photoPickerOptionTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
  photoPickerOptionHint: { color: palette.textMuted, fontSize: 12, marginTop: 3 },
  photoPickerCancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 12 },
  photoPickerCancelText: { color: palette.textMuted, fontSize: 14, fontWeight: '800' },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  });
}
