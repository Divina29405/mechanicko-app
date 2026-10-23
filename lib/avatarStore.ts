type AvatarListener = (url: string | null) => void;

let currentAvatarUrl: string | null = null;
const listeners = new Set<AvatarListener>();

export function getSharedAvatarUrl() {
  return currentAvatarUrl;
}

export function publishSharedAvatarUrl(url: string | null) {
  currentAvatarUrl = url;
  listeners.forEach((listener) => listener(url));
}

export function subscribeToSharedAvatar(listener: AvatarListener) {
  listeners.add(listener);
  if (currentAvatarUrl) listener(currentAvatarUrl);
  return () => {
    listeners.delete(listener);
  };
}
