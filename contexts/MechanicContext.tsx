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
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

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
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
  avatarLoading: boolean;
};

const MechanicContext = createContext<MechanicContextValue | undefined>(undefined);

export function MechanicProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [earnings, setEarnings] = useState({ today: 0, weekly: 0, completedToday: 0, wallet: 0 });
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [online, setOnlineState] = useState(true);
  const [sosOffer, setSosOffer] = useState<SosOffer | null>(initialSosOffer);
  const [acceptedSos, setAcceptedSos] = useState<SosOffer | null>(null);
  const [sosExpired, setSosExpired] = useState(false);
  const [bookings] = useState(initialBookings);
  const [inventory, setInventory] = useState(initialInventory);
  const [notifications, setNotifications] = useState(initialNotifications);

  useEffect(() => {
    let active = true;
    async function loadProfileData() {
      if (!session?.user.id) {
        setAvatarUrl(null);
        setAvatarLoading(false);
        return;
      }
      setAvatarLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('avatar_path,average_rating,is_online')
        .eq('id', session.user.id)
        .maybeSingle();
      if (active && data?.avatar_path) {
        const url = supabase.storage.from('mechanic-avatars').getPublicUrl(data.avatar_path).data.publicUrl;
        setAvatarUrl(`${url}?v=${Date.now()}`);
      }
      if (active && typeof data?.average_rating === 'number') {
        setRating(Math.min(5, Math.max(1, data.average_rating)));
      }
      if (active && typeof data?.is_online === 'boolean') {
        setOnlineState(data.is_online);
      }
      if (active) setAvatarLoading(false);
    }
    void loadProfileData();
    return () => { active = false; };
  }, [session?.user.id]);

  const setOnline = useCallback(
    (value: boolean) => {
      setOnlineState(value);
      if (session?.user.id) {
        void supabase
          .from('profiles')
          .update({ is_online: value })
          .eq('id', session.user.id)
          .then(({ error }) => {
            if (error) console.warn('Mechanic availability update failed:', error.message);
          });
      }
    },
    [session],
  );

  useEffect(() => {
    let active = true;
    async function loadEarnings() {
      if (!session?.user.id) return;
      const { data } = await supabase
        .from('service_requests')
        .select('id,final_price,status,updated_at')
        .eq('mechanic_id', session.user.id)
        .in('status', ['completed', 'done', 'resolved'])
        .order('updated_at', { ascending: false });
      if (!active || !data) return;
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfWeek = startOfDay - now.getDay() * 86400000;
      const rows = data.map((row) => ({
        ...row,
        amount: Number(row.final_price) || 0,
        time: new Date(row.updated_at ?? now).getTime(),
      }));
      setEarnings({
        today: rows.filter((row) => row.time >= startOfDay).reduce((sum, row) => sum + row.amount, 0),
        weekly: rows.filter((row) => row.time >= startOfWeek).reduce((sum, row) => sum + row.amount, 0),
        completedToday: rows.filter((row) => row.time >= startOfDay).length,
        wallet: rows.reduce((sum, row) => sum + row.amount, 0),
      });
      setPayouts(rows.slice(0, 10).map((row) => ({
        id: row.id,
        label: 'Completed service',
        amount: row.amount,
        date: new Date(row.time).toLocaleDateString(),
        method: 'GCash',
        status: 'completed',
      })));
    }
    void loadEarnings();
    return () => { active = false; };
  }, [session?.user.id]);

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
      rating,
      todayEarnings: earnings.today,
      weeklyEarnings: earnings.weekly,
      completedToday: earnings.completedToday,
      walletBalance: earnings.wallet,
      sosOffer: online ? sosOffer : null,
      acceptedSos,
      sosExpired,
      acceptSos,
      declineSos,
      bookings,
      inventory,
      togglePacked,
      payouts,
      threads: initialThreads,
      history: initialHistory,
      notifications,
      unreadNotifications: notifications.filter((item) => !item.read).length,
      unreadMessages: initialThreads.reduce((sum, thread) => sum + thread.unread, 0),
      markNotificationsRead,
      avatarUrl,
      setAvatarUrl,
      avatarLoading,
    }),
    [
      online,
      setOnline,
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
      avatarUrl,
      avatarLoading,
      rating,
      earnings,
      payouts,
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
