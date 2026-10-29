import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useNotificationCount } from "@/contexts/NotificationContext";
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

export function NotificationBell({
  color,
  style,
}: {
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { session } = useAuth();
  const { colors } = useAppTheme();
  const {
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useNotificationCount();
  const userId = session?.user.id;
  const [visible, setVisible] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isMechanic, setIsMechanic] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    let active = true;
    const loadNotifications = async (refresh = false) => {
      if (refresh) setHistoryRefreshing(true);
      else setHistoryLoading(true);

      const [{ data, error }, { data: profile, error: profileError }] =
        await Promise.all([
          supabase
            .from("app_notifications")
            .select("id,type,title,body,service_request_id,created_at,read_at")
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
      if (error) {
        setHistoryError(error.message);
      } else {
        setNotifications((data ?? []) as AppNotification[]);
        setHistoryError(null);
      }
      if (profileError) {
        console.warn("Could not load notification role:", profileError.message);
      } else {
        setIsMechanic(profile?.role?.toLowerCase() === "mechanic");
      }
      setHistoryLoading(false);
      setHistoryRefreshing(false);
    };

    void loadNotifications();
    const channelId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`notification_history_${userId}_${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadNotifications(true),
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "Notification history realtime connection failed:",
            error?.message ?? status,
          );
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId, visible]);

  const markAllAsRead = async () => {
    if (!userId || unreadCount === 0) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("app_notifications")
      .update({ read_at: readAt })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) {
      setHistoryError(error.message);
      return;
    }
    setNotifications((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
    );
    markAllNotificationsRead();
  };

  const openNotification = async (item: AppNotification) => {
    if (!userId) return;
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      const { error } = await supabase
        .from("app_notifications")
        .update({ read_at: readAt })
        .eq("id", item.id)
        .eq("user_id", userId);
      if (error) {
        setHistoryError(error.message);
        return;
      }
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === item.id
            ? { ...notification, read_at: readAt }
            : notification,
        ),
      );
      markNotificationRead();
    }

    setVisible(false);
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
    <>
      <Pressable
        style={[styles.button, style]}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={
          unreadCount > 0
            ? `Open notifications, ${unreadCount} unread`
            : "Open notifications"
        }
      >
        <Ionicons name="notifications-outline" size={22} color={color} />
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setVisible(false)}
      >
        <SafeAreaView
          style={[styles.modal, { backgroundColor: colors.bg }]}
          edges={["top", "left", "right"]}
        >
          <View
            style={[
              styles.modalHeader,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
            ]}
          >
            <Pressable
              onPress={() => setVisible(false)}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close notifications"
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Notifications
            </Text>
            {notifications.some((item) => !item.read_at) ? (
              <Pressable
                onPress={() => void markAllAsRead()}
                accessibilityRole="button"
              >
                <Text style={[styles.markAll, { color: colors.primary }]}>
                  Mark all read
                </Text>
              </Pressable>
            ) : (
              <View style={styles.headerSpacer} />
            )}
          </View>
          <ScrollView
            contentContainerStyle={styles.historyContent}
            refreshControl={
              <RefreshControl
                refreshing={historyRefreshing}
                onRefresh={() => {
                  if (!userId) return;
                  setHistoryRefreshing(true);
                  void supabase
                    .from("app_notifications")
                    .select(
                      "id,type,title,body,service_request_id,created_at,read_at",
                    )
                    .eq("user_id", userId)
                    .order("created_at", { ascending: false })
                    .limit(100)
                    .then(({ data, error }) => {
                      if (error) setHistoryError(error.message);
                      else {
                        setNotifications((data ?? []) as AppNotification[]);
                        setHistoryError(null);
                      }
                      setHistoryRefreshing(false);
                    });
                }}
                tintColor={colors.primary}
              />
            }
          >
            {historyError ? (
              <Text style={[styles.historyError, { color: "#DC2626" }]}>
                {historyError}
              </Text>
            ) : null}
            {historyLoading ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="notifications-outline"
                  size={42}
                  color={colors.primary}
                />
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
                >
                  <View style={styles.notificationIcon}>
                    <Ionicons
                      name={
                        item.type === "chat_message"
                          ? "chatbubble-ellipses-outline"
                          : "calendar-outline"
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
                    <Text style={[styles.notificationBody, { color: colors.textMuted }]}>
                      {item.body}
                    </Text>
                    <Text style={[styles.notificationTime, { color: colors.textMuted }]}>
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
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E11D48",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  modal: { flex: 1 },
  modalHeader: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  closeButton: { width: 40, height: 40, justifyContent: "center" },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  markAll: { fontSize: 12, fontWeight: "700" },
  headerSpacer: { width: 40 },
  historyContent: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  loader: { marginTop: 44 },
  historyError: { fontSize: 13, marginBottom: 12 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", marginTop: 12 },
  emptyMessage: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
  },
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
  notificationBody: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  notificationTime: { fontSize: 11, marginTop: 5 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
});
