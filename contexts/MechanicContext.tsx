import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  initialBookings,
  initialHistory,
  initialInventory,
  initialNotifications,
  initialPayouts,
  initialSosOffer,
  initialThreads,
  type AppNotification,
  type Booking,
  type ChatThread,
  type InventoryItem,
  type JobHistoryItem,
  type PayoutRow,
  type SosOffer,
} from '@/lib/mechanic-mock';

type MechanicContextValue = {
  online: boolean;
  setOnline: (value: boolean) => void;
  rating: number;
  todayEarnings: number;
  weeklyEarnings: number;
  completedToday: number;
  walletBalance: number;
  sosOffer: SosOffer | null;
  acceptedSos: SosOffer | null;
  sosExpired: boolean;
  acceptSos: () => void;
  declineSos: () => void;
  bookings: Booking[];
  inventory: InventoryItem[];
  togglePacked: (id: string) => void;
  payouts: PayoutRow[];
  threads: ChatThread[];
  history: JobHistoryItem[];
  notifications: AppNotification[];
  unreadNotifications: number;
  unreadMessages: number;
  markNotificationsRead: () => void;
};

const MechanicContext = createContext<MechanicContextValue | undefined>(undefined);

export function MechanicProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [sosOffer, setSosOffer] = useState<SosOffer | null>(initialSosOffer);
  const [acceptedSos, setAcceptedSos] = useState<SosOffer | null>(null);
  const [sosExpired, setSosExpired] = useState(false);
  const [bookings] = useState(initialBookings);
  const [inventory, setInventory] = useState(initialInventory);
  const [notifications, setNotifications] = useState(initialNotifications);

  useEffect(() => {
    if (!online) return;

    const timer = setInterval(() => {
      setSosOffer((current) => {
        if (!current) return current;
        if (current.secondsLeft <= 1) {
          queueMicrotask(() => setSosExpired(true));
          return null;
        }
        return { ...current, secondsLeft: current.secondsLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [online]);

  const acceptSos = useCallback(() => {
    setSosOffer((current) => {
      if (current) setAcceptedSos(current);
      return null;
    });
  }, []);

  const declineSos = useCallback(() => {
    setSosOffer(null);
  }, []);

  const togglePacked = useCallback((id: string) => {
    setInventory((items) =>
      items.map((item) => (item.id === id ? { ...item, packed: !item.packed } : item)),
    );
  }, []);

  const markNotificationsRead = useCallback(() => {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));
  }, []);

  const value = useMemo<MechanicContextValue>(
    () => ({
      online,
      setOnline,
      rating: 4.9,
      todayEarnings: 3250,
      weeklyEarnings: 18740,
      completedToday: 4,
      walletBalance: 6120,
      sosOffer: online ? sosOffer : null,
      acceptedSos,
      sosExpired,
      acceptSos,
      declineSos,
      bookings,
      inventory,
      togglePacked,
      payouts: initialPayouts,
      threads: initialThreads,
      history: initialHistory,
      notifications,
      unreadNotifications: notifications.filter((item) => !item.read).length,
      unreadMessages: initialThreads.reduce((sum, thread) => sum + thread.unread, 0),
      markNotificationsRead,
    }),
    [
      online,
      sosOffer,
      acceptedSos,
      sosExpired,
      acceptSos,
      declineSos,
      bookings,
      inventory,
      togglePacked,
      notifications,
      markNotificationsRead,
    ],
  );

  return <MechanicContext.Provider value={value}>{children}</MechanicContext.Provider>;
}

export function useMechanic() {
  const ctx = useContext(MechanicContext);
  if (!ctx) {
    throw new Error('useMechanic must be used within MechanicProvider');
  }
  return ctx;
}
