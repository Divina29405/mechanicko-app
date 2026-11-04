import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type PreferredMapApp = 'google_maps' | 'waze';
export type MapPreferenceOwner = 'mechanic' | 'motorist';

function getMapAppKey(userId: string, owner: MapPreferenceOwner) {
  return owner === 'mechanic'
    ? `mechaniko_mechanic_map_app_${userId}`
    : `mechaniko_motorist_map_app_${userId}`;
}

export async function getPreferredMapApp(
  userId: string,
  owner: MapPreferenceOwner = 'mechanic',
): Promise<PreferredMapApp | null> {
  const key = getMapAppKey(userId, owner);
  const value =
    Platform.OS === 'web'
      ? typeof window !== 'undefined'
        ? window.localStorage.getItem(key)
        : null
      : await SecureStore.getItemAsync(key);
  return value === 'google_maps' || value === 'waze' ? value : null;
}

export async function savePreferredMapApp(
  userId: string,
  app: PreferredMapApp,
  owner: MapPreferenceOwner = 'mechanic',
): Promise<void> {
  const key = getMapAppKey(userId, owner);
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, app);
    }
    return;
  }
  await SecureStore.setItemAsync(key, app);
}
