import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

const CHUNK = 1800;

const LargeSecureStore = {
  async getItem(key: string) {
    if (Platform.OS === "web") {
      return typeof localStorage !== "undefined"
        ? localStorage.getItem(key)
        : null;
    }
    const count = await SecureStore.getItemAsync(`${key}_n`);
    if (!count) {
      return SecureStore.getItemAsync(key);
    }
    const n = Number.parseInt(count, 10);
    const parts: string[] = [];
    for (let i = 0; i < n; i += 1) {
      parts.push((await SecureStore.getItemAsync(`${key}_${i}`)) ?? "");
    }
    return parts.join("");
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
      }
      return;
    }
    if (value.length < CHUNK) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const n = Math.ceil(value.length / CHUNK);
    await SecureStore.setItemAsync(`${key}_n`, String(n));
    for (let i = 0; i < n; i += 1) {
      await SecureStore.setItemAsync(
        `${key}_${i}`,
        value.slice(i * CHUNK, (i + 1) * CHUNK),
      );
    }
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(key);
      }
      return;
    }
    const count = await SecureStore.getItemAsync(`${key}_n`);
    if (count) {
      const n = Number.parseInt(count, 10);
      for (let i = 0; i < n; i += 1) {
        await SecureStore.deleteItemAsync(`${key}_${i}`);
      }
      await SecureStore.deleteItemAsync(`${key}_n`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  ""
).trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl.startsWith("https://") &&
  supabaseAnonKey.length > 20 &&
  !supabaseUrl.includes("YOUR_PROJECT") &&
  supabaseAnonKey !== "YOUR_ANON_KEY",
);

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      storage: LargeSecureStore,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
