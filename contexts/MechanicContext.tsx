import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

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
  isMechanic: boolean;
  online: boolean;
  setOnline: (value: boolean) => void;
  rating: number;
  todayEarnings: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  completedToday: number;
  completedThisWeek: number;
  completedThisMonth: number;
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
  refreshEarnings: () => Promise<void>;
  earningsLoading: boolean;
  markNotificationsRead: () => void;
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
  avatarLoading: boolean;
};

const MechanicContext = createContext<MechanicContextValue | undefined>(undefined);

export function MechanicProvider({
  children,
  isMechanic,
}: {
  children: ReactNode;
  isMechanic: boolean;
}) {
  const { session } = useAuth();
  const [avatarUrl, setAvatarUrlState] = useState<string | null>(null);
  const avatarRequestId = useRef(0);
  const setAvatarUrl = useCallback((url: string | null) => {
    avatarRequestId.current += 1;
    setAvatarUrlState(url);
  }, []);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [earnings, setEarnings] = useState({
    today: 0,
    weekly: 0,
    monthly: 0,
    completedToday: 0,
    completedThisWeek: 0,
    completedThisMonth: 0,
    wallet: 0,
  });
  const [earningsLoading, setEarningsLoading] = useState(true);
  const earningsRequestRef = useRef<{
    userId: string;
    promise: Promise<void>;
  } | null>(null);
  const earningsRequestId = useRef(0);
  const earningsLoadedUserId = useRef<string | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [online, setOnlineState] = useState(false);
  const [sosOffer, setSosOffer] = useState<SosOffer | null>(initialSosOffer);
  const [acceptedSos, setAcceptedSos] = useState<SosOffer | null>(null);
  const [sosExpired, setSosExpired] = useState(false);
  const [bookings] = useState(initialBookings);
  const [inventory, setInventory] = useState(initialInventory);
  const [notifications, setNotifications] = useState(initialNotifications);

  useEffect(() => {
    let active = true;
    const requestId = ++avatarRequestId.current;
    async function loadProfileData() {
      if (!session?.user.id) {
        if (active && requestId === avatarRequestId.current) {
          setAvatarUrlState(null);
        }
        setRating(5);
        setOnlineState(false);
        setAvatarLoading(false);
        return;
      }
      setAvatarLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_path,average_rating,is_online')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        console.warn('Mechanic profile load failed:', error.message);
      }
      if (active && requestId === avatarRequestId.current && data?.avatar_path) {
        const { data: avatar } = supabase.storage
          .from('mechanic-avatars')
          .getPublicUrl(data.avatar_path);
        setAvatarUrlState(avatar.publicUrl);
      } else if (active && requestId === avatarRequestId.current && data === null) {
        setAvatarUrlState(null);
      }
      if (active && typeof data?.average_rating === 'number') {
        setRating(Math.min(5, Math.max(0, data.average_rating)));
      }
      
      // FIX: Properly sync the online status from the database to the app on boot!
      if (active && typeof data?.is_online === 'boolean') {
        setOnlineState(data.is_online);
      }
      
      if (active) setAvatarLoading(false);
    }
    void loadProfileData();
    return () => { active = false; };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;

    const refreshRating = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('average_rating')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        console.warn('Mechanic rating refresh failed:', error.message);
        return;
      }
      if (
        active &&
        typeof data?.average_rating === 'number' &&
        Number.isFinite(data.average_rating)
      ) {
        setRating(Math.min(5, Math.max(0, data.average_rating)));
      }
    };

    const channel = supabase
      .channel(`mechanic_rating_${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${session.user.id}`,
        },
        (payload) => {
          const nextRating = payload.new.average_rating;
          if (typeof nextRating === 'number' && Number.isFinite(nextRating)) {
            setRating(Math.min(5, Math.max(0, nextRating)));
          }
        },
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Mechanic rating updates unavailable:', error?.message ?? status);
        }
      });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshRating();
    });

    return () => {
      active = false;
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
    };
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

  const refreshEarnings = useCallback(() => {
    const userId = session?.user.id;
    if (!userId) return Promise.resolve();

    const inFlightRequest = earningsRequestRef.current;
    if (inFlightRequest?.userId === userId) return inFlightRequest.promise;

    const requestId = ++earningsRequestId.current;
    if (earningsLoadedUserId.current !== userId) setEarningsLoading(true);
    const request = (async () => {
      const { data, error } = await supabase
        .from('service_requests')
        .select('id,estimated_total,service_price,additional_charges,status,created_at,completed_at')
        .eq('mechanic_id', userId)
        .order('created_at', { ascending: false });
      if (requestId !== earningsRequestId.current) return;
      if (error) {
        console.warn('Mechanic earnings load failed:', error.message);
        return;
      }
      if (!data) return;

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfWeek = startOfDay - now.getDay() * 86400000;
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const rows = data
        .filter((row) =>
          ['completed', 'done', 'resolved', 'closed'].includes(
            String(row.status ?? '').toLowerCase(),
          ),
        )
        .map((row) => ({
          ...row,
          amount:
            (Number(row.estimated_total ?? row.service_price) || 0) +
            (Array.isArray(row.additional_charges)
              ? row.additional_charges
                  .filter((charge: { status?: string }) => charge.status === 'approved')
                  .reduce(
                    (sum: number, charge: { amount?: number }) =>
                      sum + (Number(charge.amount) || 0),
                    0,
                  )
              : 0),
          time: new Date(row.completed_at ?? row.created_at ?? now).getTime(),
        }));
      setEarnings({
        today: rows.filter((row) => row.time >= startOfDay).reduce((sum, row) => sum + row.amount, 0),
        weekly: rows.filter((row) => row.time >= startOfWeek).reduce((sum, row) => sum + row.amount, 0),
        monthly: rows.filter((row) => row.time >= startOfMonth).reduce((sum, row) => sum + row.amount, 0),
        completedToday: rows.filter((row) => row.time >= startOfDay).length,
        completedThisWeek: rows.filter((row) => row.time >= startOfWeek).length,
        completedThisMonth: rows.filter((row) => row.time >= startOfMonth).length,
        wallet: rows.reduce((sum, row) => sum + row.amount, 0),
      });
      setPayouts(rows.slice(0, 10).map((row) => ({
        id: row.id,
        label: 'Completed service',
        amount: row.amount,
        date: new Date(row.time).toISOString(),
        method: 'GCash',
        status: 'completed',
      })));
    })();
    const settledRequest = request.finally(() => {
      if (requestId === earningsRequestId.current) {
        earningsRequestRef.current = null;
        earningsLoadedUserId.current = userId;
        setEarningsLoading(false);
      }
    });
    earningsRequestRef.current = { userId, promise: settledRequest };
    return settledRequest;
  }, [session]);

  useEffect(() => {
    async function load() {
      await refreshEarnings();
    }
    void load();
  }, [refreshEarnings]);

  useEffect(() => {
    if (!session?.user.id) return;
    const channel = supabase
      .channel(`mechanic_earnings_${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests',
          filter: `mechanic_id=eq.${session.user.id}`,
        },
        () => {
          void refreshEarnings();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshEarnings, session?.user.id]);

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
      isMechanic,
      online,
      setOnline,
      rating,
      todayEarnings: earnings.today,
      weeklyEarnings: earnings.weekly,
      monthlyEarnings: earnings.monthly,
      completedToday: earnings.completedToday,
      completedThisWeek: earnings.completedThisWeek,
      completedThisMonth: earnings.completedThisMonth,
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
      refreshEarnings,
      earningsLoading,
      markNotificationsRead,
      avatarUrl,
      setAvatarUrl,
      avatarLoading,
    }),
    [
      isMechanic,
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
      setAvatarUrl,
      avatarLoading,
      rating,
      earnings,
      earningsLoading,
      payouts,
      refreshEarnings,
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