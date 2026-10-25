import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { MechanicScreen } from "@/components/mechanic/MechanicScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";

type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  service_request_id: string | null;
  created_at: string;
  read_at: string | null;
};

export default function NotificationsScreen() {
  const { session } = useAuth();
  const { colors } = useAppTheme();
  const userId = session?.user.id;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isMechanic, setIsMechanic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reloadNotificationsRef = useRef<(() => void) | null>(null);
  const hasFocusedOnce = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const loadNotifications = async () => {
      try {
        const [
          { data, error: notificationError },
          { data: profile, error: profileError },
        ] = await Promise.all([
          supabase
            .from("app_notifications")
            .select(
              "id,type,title,body,service_request_id,created_at,read_at",
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .maybeSingle(),
        ]);
        if (!active) return;
        if (notificationError) {
          setError(notificationError.message);
        } else {
          setNotifications((data ?? []) as AppNotification[]);
          setError(null);
        }
        if (profileError) {
          console.warn("Could not load notification screen role:", profileError.message);
        } else {
          setIsMechanic(profile?.role?.toLowerCase() === "mechanic");
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load notification history.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void loadNotifications();

    const channelId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`app_notifications_${userId}_${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadNotifications(),
      )
      .subscribe((status, subscribeError) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "Notification realtime connection failed:",
            subscribeError?.message ?? status,
          );
        }
      });
    const reload = () => void loadNotifications();
    reloadNotificationsRef.current = reload;

    return () => {
      active = false;
      if (reloadNotificationsRef.current === reload) {
        reloadNotificationsRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (hasFocusedOnce.current) {
        reloadNotificationsRef.current?.();
      } else {
        hasFocusedOnce.current = true;
      }
    }, []),
  );

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  const markAllAsRead = async () => {
    if (!userId || unreadCount === 0) return;
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("app_notifications")
      .update({ read_at: readAt })
      .eq("user_id", userId)
      .is("read_at", null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotifications((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
    );
  };

  const openNotification = async (item: AppNotification) => {
    if (!userId) return;
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("app_notifications")
        .update({ read_at: readAt })
        .eq("id", item.id)
        .eq("user_id", userId);
      if (updateError) {
        setError(updateError.message);
      } else {
        setNotifications((current) =>
          current.map((notification) =>
            notification.id === item.id
              ? { ...notification, read_at: readAt }
              : notification,
          ),
        );
      }
    }

    if (item.type === "chat_message" && item.service_request_id) {
      router.push({
        pathname: "/messages",
        params: { serviceRequestId: item.service_request_id },
      });
    } else if (isMechanic) {
      router.push("/jobs");
    } else {
      router.push("/motorist-activity");
    }
  };

  return (
    <MechanicScreen back title="Notifications">
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              reloadNotificationsRef.current?.();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.heading, { color: colors.text }]}>
              Notifications
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {unreadCount
                ? `${unreadCount} unread`
                : "You're all caught up"}
            </Text>
          </View>
          {unreadCount > 0 ? (
            <Pressable
              onPress={() => void markAllAsRead()}
              accessibilityRole="button"
            >
              <Text style={[styles.markAll, { color: colors.primary }]}>
                Mark all read
              </Text>
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <Text style={[styles.error, { color: "#DC2626" }]}>{error}</Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: colors.btnSecondary },
              ]}
            >
              <Ionicons
                name="notifications-outline"
                size={32}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No notifications yet
            </Text>
            <Text style={[styles.emptyMessage, { color: colors.textMuted }]}>
              Booking updates and new messages will appear here.
            </Text>
          </View>
        ) : (
          notifications.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => void openNotification(item)}
              style={[
                styles.notificationCard,
                {
                  backgroundColor: item.read_at ? colors.card : colors.btnSecondary,
                  borderColor: colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${item.read_at ? "" : "Unread: "}${item.title}. ${item.body}`}
            >
              <View
                style={[
                  styles.notificationIcon,
                  { backgroundColor: colors.bg },
                ]}
              >
                <Ionicons
                  name={
                    item.type === "chat_message"
                      ? "chatbubble-ellipses-outline"
                      : item.type === "booking_status"
                        ? "calendar-outline"
                        : "notifications-outline"
                  }
                  size={21}
                  color={colors.primary}
                />
              </View>
              <View style={styles.notificationCopy}>
                <View style={styles.notificationTitleRow}>
                  <Text
                    style={[styles.notificationTitle, { color: colors.text }]}
                  >
                    {item.title}
                  </Text>
                  {!item.read_at ? (
                    <View
                      style={[
                        styles.unreadDot,
                        { backgroundColor: colors.primary },
                      ]}
                    />
                  ) : null}
                </View>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  {item.body}
                </Text>
                <Text style={[styles.time, { color: colors.textMuted }]}>
                  {new Date(item.created_at).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          ))
        )}
      </ScrollView>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  heading: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 4 },
  markAll: { fontSize: 13, fontWeight: "700" },
  loader: { marginTop: 40 },
  error: { fontSize: 13, marginBottom: 12 },
  emptyState: { alignItems: "center", paddingHorizontal: 24, paddingTop: 72 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", textAlign: "center" },
  emptyMessage: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6 },
  notificationCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  notificationIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCopy: { flex: 1 },
  notificationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  notificationTitle: { flex: 1, fontSize: 14, fontWeight: "800" },
  body: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  time: { fontSize: 11, marginTop: 5 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
});
