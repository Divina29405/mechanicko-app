type ActiveBooking = Record<string, unknown>;
type Listener = (booking: ActiveBooking | null) => void;

const bookings = new Map<string, ActiveBooking>();
const listeners = new Map<string, Set<Listener>>();

export function getCachedActiveBooking(userId: string) {
  return bookings.get(userId) ?? null;
}

export function setCachedActiveBooking(
  userId: string,
  booking: ActiveBooking | null,
) {
  if (booking) {
    bookings.set(userId, booking);
  } else {
    bookings.delete(userId);
  }
  listeners.get(userId)?.forEach((listener) => listener(booking));
}

export function subscribeToActiveBooking(
  userId: string,
  listener: Listener,
) {
  const userListeners = listeners.get(userId) ?? new Set<Listener>();
  userListeners.add(listener);
  listeners.set(userId, userListeners);
  return () => {
    userListeners.delete(listener);
    if (!userListeners.size) listeners.delete(userId);
  };
}
