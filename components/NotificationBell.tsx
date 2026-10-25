import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export function NotificationBell({
  color,
  style,
}: {
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [unreadState, setUnreadState] = useState<{
    userId: string | undefined;
    count: number;
  }>({ userId: undefined, count: 0 });
  const unreadCount = unreadState.userId === userId ? unreadState.count : 0;

  useEffect(() => {
    if (!userId) return;

    let active = true;
    const loadUnreadCount = async () => {
      const { count, error } = await supabase
        .from("app_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      if (!active) return;
      if (error) {
        console.warn("Could not load unread notification count:", error.message);
        return;
      }
      setUnreadState({ userId, count: count ?? 0 });
    };

    void loadUnreadCount();
    const channel = supabase
      .channel(`notification_badge_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadUnreadCount(),
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "Notification badge realtime connection failed:",
            error?.message ?? status,
          );
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Pressable
      style={[styles.button, style]}
      onPress={() => router.push("/notifications")}
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
});
