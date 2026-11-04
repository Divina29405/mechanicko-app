import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { MechanicText as Text } from "@/components/mechanic/MechanicText";
import { useNotificationCount } from "@/contexts/NotificationContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { getNotificationCutoff } from "@/lib/notificationRetention";
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

const notificationAccent = "#2563EB";
const notificationBadgeColor = "#FF6B00";

export function NotificationBell({
  color,
  style,
  variant = "motorist",
}: {
  color: string;
  style?: StyleProp<ViewStyle>;
  variant?: "mechanic" | "motorist";
}) {
  const { session } = useAuth();
  const { colors } = useAppTheme();
  const accentColor = notificationAccent;
  const appNavigation = useNavigation<{
    navigate: (screen: "notifications") => void;
  }>("/(app)");
  const insets = useSafeAreaInsets();
  const {
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useNotificationCount();
  const userId = session?.user.id;
  const [visible, setVisible] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isMechanic, setIsMechanic] = useState(false);
  const hasLoadedHistory = useRef(false);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNavigation = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
    },
    [],
  );

  const closePreview = () => {
    setVisible(false);
  };

  const closePreviewAndNavigate = (
    destination: Parameters<typeof router.push>[0],
  ) => {
    pendingNavigation.current = () => router.push(destination);
    setVisible(false);
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    navigationTimer.current = setTimeout(() => {
      const navigate = pendingNavigation.current;
      pendingNavigation.current = null;
      navigationTimer.current = null;
      navigate?.();
    }, 500);
  };

  const navigateAfterModalDismiss = () => {
    const navigate = pendingNavigation.current;
    if (!navigate) return;
    pendingNavigation.current = null;
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    navigationTimer.current = null;
    navigate();
  };

  const openAllNotifications = () => {
    pendingNavigation.current = () => appNavigation.navigate("notifications");
    setVisible(false);
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    navigationTimer.current = setTimeout(navigateAfterModalDismiss, 500);
  };

  useEffect(() => {
    if (!visible || !userId) return;
    let active = true;
    const loadNotifications = async (showLoading = false) => {
      if (showLoading) setHistoryLoading(true);
      try {
        const [{ data, error }, { data: profile, error: profileError }] =
          await Promise.all([
            supabase
              .from("app_notifications")
              .select("id,type,title,body,service_request_id,created_at,read_at")
              .eq("user_id", userId)
              .gte("created_at", getNotificationCutoff())
              .order("created_at", { ascending: false })
              .limit(2),
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
          hasLoadedHistory.current = true;
        }
        if (profileError) {
          console.warn("Could not load notification role:", profileError.message);
        } else {
          setIsMechanic(profile?.role?.toLowerCase() === "mechanic");
        }
      } catch (error) {
        if (active) {
          setHistoryError(
            error instanceof Error
              ? error.message
              : "Could not load notification preview.",
          );
        }
      } finally {
        if (active && showLoading) setHistoryLoading(false);
      }
    };

    void loadNotifications(!hasLoadedHistory.current);
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
        () => void loadNotifications(),
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
      .gte("created_at", getNotificationCutoff())
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

    const isCancelledBooking =
      item.type === "booking_status" &&
      item.title.trim().toLowerCase() === "booking cancelled";
    const isClosedBooking =
      item.type === "booking_status" &&
      item.title.trim().toLowerCase() === "booking closed";

    if (item.type === "chat_message" && item.service_request_id) {
      closePreviewAndNavigate({
        pathname: "/messages",
        params: { serviceRequestId: item.service_request_id },
      });
    } else if (isCancelledBooking && isMechanic) {
      closePreviewAndNavigate({
        pathname: "/(app)/jobs",
        params: { filter: "dropped" },
      });
    } else if (isClosedBooking && isMechanic) {
      closePreviewAndNavigate({
        pathname: "/(app)/jobs",
        params: { filter: "resolved" },
      });
    } else if (isCancelledBooking) {
      closePreviewAndNavigate({
        pathname: "/(app)/help-center",
        params: { filter: "revoked" },
      });
    } else if (isMechanic) {
      closePreviewAndNavigate("/(app)/jobs");
    } else {
      closePreviewAndNavigate("/(app)/motorist-activity");
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
        {variant === "mechanic" ? (
          <Image
            source={require("../assets/images/mechanicnotification.png")}
            style={styles.bellIcon}
            resizeMode="contain"
          />
        ) : (
          <Ionicons name="notifications-outline" size={22} color={color} />
        )}
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
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closePreview}
        onDismiss={navigateAfterModalDismiss}
      >
        <Pressable
          style={[
            styles.previewOverlay,
            {
              paddingTop: insets.top + 48,
              paddingBottom: insets.bottom + 12,
            },
          ]}
          onPress={closePreview}
        >
          <Pressable
            style={[
              styles.previewPanel,
              { backgroundColor: colors.card, borderColor: accentColor },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View
              style={[
                styles.previewHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <View style={styles.previewHeaderTitleGroup}>
                <Text style={[styles.previewTitle, { color: colors.text }]}>
                  Notifications
                </Text>
                {unreadCount > 0 ? (
                  <View
                    style={[
                      styles.unreadBadge,
                      { backgroundColor: notificationBadgeColor },
                    ]}
                  >
                    <Text style={styles.unreadBadgeText}>
                      UNREAD ({unreadCount > 99 ? "99+" : unreadCount})
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.previewHeaderActions}>
                <Pressable
                  onPress={() => void markAllAsRead()}
                  disabled={unreadCount === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Mark all notifications as read"
                  style={styles.markAllButton}
                >
                  <Ionicons
                    name="checkmark-done"
                    size={18}
                    color={unreadCount > 0 ? accentColor : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.markAll,
                      {
                        color:
                          unreadCount > 0 ? accentColor : colors.textMuted,
                      },
                    ]}
                  >
                    Mark all as read
                  </Text>
                </Pressable>
              </View>
            </View>
            {historyError ? (
              <Text style={styles.historyError}>{historyError}</Text>
            ) : historyLoading ? (
              <ActivityIndicator color={accentColor} style={styles.loader} />
            ) : notifications.length > 0 ? (
              notifications.map((notification, index) => (
                <Pressable
                  key={notification.id}
                  onPress={() => void openNotification(notification)}
                  style={[
                    styles.previewNotification,
                    {
                      marginTop: index === 0 ? 8 : 3,
                      marginBottom:
                        index === notifications.length - 1 ? 8 : 0,
                    },
                    { backgroundColor: colors.btnSecondary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${notification.read_at ? "" : "Unread: "}${notification.title}. ${notification.body}`}
                >
                  <View
                    style={[
                      styles.notificationIcon,
                      { backgroundColor: accentColor + "20" },
                    ]}
                  >
                    <Ionicons
                      name={
                        notification.type === "chat_message"
                          ? "chatbubble-ellipses-outline"
                          : notification.type === "emergency_request"
                            ? "shield-outline"
                            : "calendar-outline"
                      }
                      size={23}
                      color={accentColor}
                    />
                  </View>
                  <View style={styles.notificationCopy}>
                    <Text
                      style={[
                        styles.notificationTitle,
                        { color: colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {notification.title}
                    </Text>
                    <Text
                      style={[
                        styles.notificationBody,
                        { color: colors.textMuted },
                      ]}
                      numberOfLines={2}
                    >
                      {notification.body}
                    </Text>
                    <View style={styles.timeRow}>
                      <Ionicons
                        name="time-outline"
                        size={15}
                        color={colors.textMuted}
                      />
                      <Text
                        style={[styles.timeText, { color: colors.textMuted }]}
                      >
                        {new Date(notification.created_at).toLocaleString(
                          [],
                          { dateStyle: "medium", timeStyle: "short" },
                        )}
                      </Text>
                    </View>
                  </View>
                  {!notification.read_at ? (
                    <View
                      style={[
                        styles.unreadDot,
                        { backgroundColor: accentColor },
                      ]}
                    />
                  ) : null}
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons
                  name="notifications-outline"
                  size={30}
                  color={accentColor}
                />
                <Text style={[styles.emptyMessage, { color: colors.textMuted }]}>
                  No notifications yet.
                </Text>
              </View>
            )}
            <Pressable
              style={[
                styles.viewAllButton,
                { borderTopColor: colors.border },
              ]}
              onPress={openAllNotifications}
              accessibilityRole="button"
            >
              <Text style={[styles.viewAllText, { color: accentColor }]}>
                View all notifications
              </Text>
              <Ionicons
                name="arrow-forward"
                size={21}
                color={accentColor}
              />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellIcon: {
    width: 22,
    height: 22,
  },
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
    backgroundColor: notificationBadgeColor,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  previewOverlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    backgroundColor: "rgba(12, 20, 38, 0.08)",
  },
  previewPanel: {
    width: "92%",
    maxWidth: 400,
    borderWidth: 1.5,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  previewHeader: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    borderBottomWidth: 1,
    borderStyle: "dotted",
  },
  previewHeaderTitleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  previewTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "800",
  },
  previewHeaderActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  unreadBadge: {
    flexShrink: 0,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: notificationBadgeColor,
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },
  markAllButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  markAll: { flexShrink: 1, fontSize: 10, fontWeight: "700" },
  loader: { marginVertical: 26 },
  historyError: { color: "#DC2626", fontSize: 13, margin: 14 },
  emptyState: {
    minHeight: 82,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 10,
  },
  emptyMessage: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  previewNotification: {
    minHeight: 82,
    marginHorizontal: 8,
    padding: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 13,
  },
  notificationIcon: {
    width: 38,
    height: 38,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCopy: { flex: 1, minWidth: 0 },
  notificationTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  notificationBody: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  timeText: { fontSize: 12, fontWeight: "600" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  viewAllButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderTopWidth: 1,
    borderStyle: "dotted",
  },
  viewAllText: { fontSize: 16, fontWeight: "800" },
});
