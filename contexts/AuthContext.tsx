import { Session } from "@supabase/supabase-js";
import * as ExpoLinking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { Platform } from "react-native";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type AuthRole = "mechanic" | "customer";

export type MechanicApplication = {
  mobileNumber: string;
  homeAddress: string;
  skills: string;
  certifications: string;
  experience: string;
  licenseFrontUri: string;
  licenseBackUri: string;
};

type DemoUser = {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: AuthRole;
};

type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AuthRole | string | null;
};

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role?: AuthRole,
    application?: MechanicApplication,
    mobileNumber?: string,
  ) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

function normalizeRole(role?: string | null): AuthRole {
  return role === "customer" ? "customer" : "mechanic";
}

function fullNameFromAnyUser(
  user?: { user_metadata?: { full_name?: string | null } | null } | null,
) {
  const rawName = user?.user_metadata?.full_name;
  return typeof rawName === "string" && rawName.trim().length > 0
    ? rawName.trim()
    : "Mechanic";
}

export function getUserRole(
  user?: {
    user_metadata?: { role?: string | null; full_name?: string | null };
  } | null,
): AuthRole {
  return normalizeRole(user?.user_metadata?.role);
}

async function loadProfileRole(userId: string): Promise<AuthRole> {
  if (!isSupabaseConfigured) {
    return "mechanic";
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return "mechanic";
  }

  return normalizeRole((data as ProfileRecord).role as string | null);
}

async function upsertProfile(
  userId: string,
  email: string,
  fullName: string,
  role: AuthRole,
  application?: Omit<
    MechanicApplication,
    "licenseFrontUri" | "licenseBackUri"
  > & {
    licenseFrontPath?: string;
    licenseBackPath?: string;
  },
) {
  if (!isSupabaseConfigured) {
    return;
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName.trim() || "Mechanic",
      role,
      ...(application
        ? {
            mobile_number: application.mobileNumber,
            home_address: application.homeAddress,
            skills: application.skills,
            certifications: application.certifications,
            experience: application.experience,
            license_front_path: application.licenseFrontPath ?? null,
            license_back_path: application.licenseBackPath ?? null,
            application_status: "pending",
            application_submitted_at: new Date().toISOString(),
          }
        : {}),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.warn("Profile upsert failed:", error.message);
  }
}

async function uploadLicensePhoto(
  userId: string,
  uri: string,
  side: "front" | "back",
) {
  const response = await fetch(uri);
  const body = await response.arrayBuffer();
  const path = `${userId}/${side}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("mechanic-documents")
    .upload(path, body, { contentType: "image/jpeg", upsert: true });

  if (error) throw new Error(error.message);
  return path;
}

async function completeMechanicSignIn(
  user: Session["user"],
  fallbackEmail: string,
) {
  const role =
    getUserRole(user) === "customer"
      ? "customer"
      : (await loadProfileRole(user.id)) || "mechanic";

  // We removed the strict mechanic bouncer here so Motorists can enter the app!

  await upsertProfile(
    user.id,
    user.email ?? fallbackEmail,
    fullNameFromAnyUser(user),
    role,
  );
  return { error: null };
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEMO_USERS_KEY = "mechaniko-demo-users";
const DEMO_SESSION_KEY = "mechaniko-demo-session";

WebBrowser.maybeCompleteAuthSession();

const demoStorage = {
  async getItem(key: string) {
    if (Platform.OS === "web") {
      return typeof localStorage !== "undefined"
        ? localStorage.getItem(key)
        : null;
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(key);
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

function createDemoSession(user: DemoUser): Session {
  const now = Date.now();
  const fullName = user.fullName.trim() || user.email.split("@")[0];

  return {
    access_token: `demo-access-${user.id}`,
    refresh_token: `demo-refresh-${user.id}`,
    expires_in: 3600,
    expires_at: Math.floor(now / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: user.id,
      email: user.email,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
      app_metadata: { provider: "demo" },
      user_metadata: { full_name: fullName, role: user.role },
      aud: "authenticated",
      role: "authenticated",
    },
  } as unknown as Session;
}

async function loadDemoUsers(): Promise<DemoUser[]> {
  const raw = await demoStorage.getItem(DEMO_USERS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as DemoUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveDemoUsers(users: DemoUser[]) {
  await demoStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
}

async function loadDemoSession(): Promise<Session | null> {
  const raw = await demoStorage.getItem(DEMO_SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

async function saveDemoSession(session: Session | null) {
  if (!session) {
    await demoStorage.removeItem(DEMO_SESSION_KEY);
    return;
  }
  await demoStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      void (async () => {
        const demoSession = await loadDemoSession();
        setSession(demoSession);
        setLoading(false);
      })();
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      async signIn(email, password) {
        if (!isSupabaseConfigured) {
          const users = await loadDemoUsers();
          const normalizedEmail = email.trim().toLowerCase();
          const user = users.find(
            (entry) =>
              entry.email.toLowerCase() === normalizedEmail &&
              entry.password === password,
          );

          if (!user) {
            return { error: "Invalid email or password" };
          }

          if (user.role !== "mechanic") {
            return {
              error: "This account cannot access the mechanic dashboard.",
            };
          }

          const nextSession = createDemoSession(user);
          await saveDemoSession(nextSession);
          setSession(nextSession);
          return { error: null };
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          return { error: error.message };
        }

        return completeMechanicSignIn(data.user, email.trim());
      },
      async signInWithGoogle() {
        if (!isSupabaseConfigured) {
          return { error: "Google login needs Supabase to be configured." };
        }

        const redirectTo = ExpoLinking.createURL("auth/callback");
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams: { prompt: "select_account" },
          },
        });

        if (error || !data.url) {
          return { error: error?.message ?? "Could not start Google login." };
        }

        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
        );

        if (result.type !== "success") {
          return { error: "Google login was cancelled." };
        }

        const callbackUrl = new URL(result.url);
        const code = callbackUrl.searchParams.get("code");

        if (code) {
          const exchanged = await supabase.auth.exchangeCodeForSession(code);
          if (exchanged.error) return { error: exchanged.error.message };
        } else {
          const hash = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");

          if (!accessToken || !refreshToken) {
            return { error: "Google login did not return a valid session." };
          }

          const sessionResult = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionResult.error)
            return { error: sessionResult.error.message };
        }

        const sessionResult = await supabase.auth.getSession();
        const user = sessionResult.data.session?.user;
        if (sessionResult.error || !user) {
          return {
            error: sessionResult.error?.message ?? "Google login failed.",
          };
        }

        return completeMechanicSignIn(user, user.email ?? "");
      },
      async signUp(
        email,
        password,
        fullName,
        role = "mechanic",
        application,
        mobileNumber,
      ) {
        if (!isSupabaseConfigured) {
          const normalizedEmail = email.trim().toLowerCase();
          const users = await loadDemoUsers();
          const existingUser = users.some(
            (entry) => entry.email.toLowerCase() === normalizedEmail,
          );

          if (existingUser) {
            return { error: "Email already exists. Try another one." };
          }

          const user: DemoUser = {
            id: `demo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            email: normalizedEmail,
            password,
            fullName: fullName.trim() || "Mechanic",
            role,
          };

          const nextUsers = [...users, user];

          await saveDemoUsers(nextUsers);
          await saveDemoSession(null);
          setSession(null);
          return { error: null };
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim() || "Mechanic",
              role,
              mobile_number: mobileNumber ?? application?.mobileNumber ?? null,
              ...(application
                ? {
                    mobile_number: application.mobileNumber,
                    home_address: application.homeAddress,
                    skills: application.skills,
                    certifications: application.certifications,
                    experience: application.experience,
                    application_status: "pending",
                  }
                : {}),
            },
          },
        });

        if (error) {
          return { error: error.message ?? null };
        }

        const userId = data.user?.id;
        if (userId && application && data.session) {
          try {
            const [licenseFrontPath, licenseBackPath] = await Promise.all([
              uploadLicensePhoto(userId, application.licenseFrontUri, "front"),
              uploadLicensePhoto(userId, application.licenseBackUri, "back"),
            ]);

            await upsertProfile(
              userId,
              email.trim(),
              fullName.trim() || "Mechanic",
              role,
              { ...application, licenseFrontPath, licenseBackPath },
            );
          } catch (uploadError) {
            await supabase.auth.signOut();
            return {
              error:
                uploadError instanceof Error
                  ? uploadError.message
                  : "Could not save mechanic documents.",
            };
          }
        } else if (userId) {
          await upsertProfile(
            userId,
            email.trim(),
            fullName.trim() || "Mechanic",
            role,
          );
        }

        if (data.session) {
          await supabase.auth.signOut();
        }
        setSession(null);

        return { error: null };
      },
      async signOut() {
        if (!isSupabaseConfigured) {
          await saveDemoSession(null);
          setSession(null);
          return;
        }
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
