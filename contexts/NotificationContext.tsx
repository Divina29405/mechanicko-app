import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAudioPlayer } from "expo-audio";

import { useAuth } from "@/contexts/AuthContext";
import { getNotificationCutoff } from "@/lib/notificationRetention";
import { supabase } from "@/lib/supabase";

const notificationSound = require("../assets/soundeffects/notification.mp3");

type UnreadState = {
  userId: string | undefined;
  count: number;
};

export type NotificationPreview = {
  id: string;
  type: string;
  title: string;
  body: string;
  service_request_id: string | null;
  created_at: string;
};

type NotificationContextValue = {
  unreadCount: number;
  markNotificationRead: () => void;
  markAllNotificationsRead: () => void;
  notificationPreview: NotificationPreview | null;
  dismissNotificationPreview: () => void;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const notificationPlayer = useAudioPlayer(notificationSound);
  const userId = session?.user.id;
  const [unreadState, setUnreadState] = useState<UnreadState>({
    userId: undefined,
    count: 0,
  });
  const [previewState, setPreviewState] = useState<{
    userId: string;
    notification: NotificationPreview;
  } | null>(null);
  const unreadCount = unreadState.userId === userId ? unreadState.count : 0;
  const notificationPreview =
    previewState && previewState.userId === userId
      ? previewState.notification
      : null;

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
          .gte("created_at", getNotificationCutoff())
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
        (payload) => {
          if (payload.eventType === "INSERT" && active) {
            const notification = payload.new as Partial<NotificationPreview>;
            if (
              notification.type === "emergency_request" &&
              typeof notification.id === "string" &&
              typeof notification.title === "string" &&
              typeof notification.body === "string" &&
              typeof notification.created_at === "string"
            ) {
              setPreviewState({
                userId,
                notification: {
                  id: notification.id,
                  type: notification.type,
                  title: notification.title,
                  body: notification.body,
                  service_request_id:
                    typeof notification.service_request_id === "string"
                      ? notification.service_request_id
                      : null,
                  created_at: notification.created_at,
                },
              });
            }
            notificationPlayer.seekTo(0);
            notificationPlayer.play();
          }
          void loadUnreadCount();
        },
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
  }, [notificationPlayer, userId]);

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

  const dismissNotificationPreview = useCallback(() => {
    setPreviewState(null);
  }, []);

  const value = useMemo(
    () => ({
      unreadCount,
      markNotificationRead,
      markAllNotificationsRead,
      notificationPreview,
      dismissNotificationPreview,
    }),
    [
      unreadCount,
      markNotificationRead,
      markAllNotificationsRead,
      notificationPreview,
      dismissNotificationPreview,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationPreview() {
  const { notificationPreview, dismissNotificationPreview } =
    useNotificationCount();
  return { notificationPreview, dismissNotificationPreview };
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
