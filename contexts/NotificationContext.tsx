import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type UnreadState = {
  userId: string | undefined;
  count: number;
};

type NotificationContextValue = {
  unreadCount: number;
  markNotificationRead: () => void;
  markAllNotificationsRead: () => void;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [unreadState, setUnreadState] = useState<UnreadState>({
    userId: undefined,
    count: 0,
  });
  const unreadCount = unreadState.userId === userId ? unreadState.count : 0;

  useEffect(() => {
    if (!userId) {
      setUnreadState({ userId: undefined, count: 0 });
      return;
    }

    let active = true;
    const loadUnreadCount = async () => {
      try {
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
      } catch (error) {
        if (active) {
          console.warn("Could not load unread notification count:", error);
        }
      }
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

  const markNotificationRead = useCallback(() => {
    setUnreadState((current) =>
      current.userId === userId
        ? { ...current, count: Math.max(0, current.count - 1) }
        : current,
    );
  }, [userId]);

  const markAllNotificationsRead = useCallback(() => {
    if (userId) setUnreadState({ userId, count: 0 });
  }, [userId]);

  const value = useMemo(
    () => ({
      unreadCount,
      markNotificationRead,
      markAllNotificationsRead,
    }),
    [unreadCount, markNotificationRead, markAllNotificationsRead],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationCount() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotificationCount must be used within a NotificationProvider",
    );
  }
  return context;
}
