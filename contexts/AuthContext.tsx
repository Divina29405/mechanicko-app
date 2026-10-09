import { Session } from "@supabase/supabase-js";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type AuthRole = "mechanic" | "customer" | "admin";

export type MechanicApplication = {
  mobileNumber: string;
  homeAddress: string;
  skills: string;
  certifications: string;
  experience: string;
  licenseFrontUri: string;
  licenseBackUri: string;
};

type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AuthRole | string | null;
  application_status?: "pending" | "approved" | "rejected" | null;
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
  if (role?.toLowerCase() === "admin") return "admin";
  return role?.toLowerCase() === "mechanic" ? "mechanic" : "customer";
}

async function loadProfileRole(userId: string): Promise<AuthRole | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return normalizeRole((data as ProfileRecord).role as string | null);
}

async function getAccountStatus(userId: string) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role,application_status")
    .eq("id", userId)
    .maybeSingle();

  if (!error && data) {
    return data as Pick<ProfileRecord, "role" | "application_status">;
  }

  const application = await supabase
    .from("mechanic_applications")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (application.data) {
    return {
      role: "mechanic",
      application_status: application.data.status as ProfileRecord["application_status"],
    };
  }
  return null;
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
    return "Supabase is not configured.";
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
    return error.message;
  }
  return null;
}

async function upsertMechanicApplication(
  userId: string,
  email: string,
  fullName: string,
  application: MechanicApplication,
  licenseFrontPath?: string,
  licenseBackPath?: string,
) {
  const { error } = await supabase.from("mechanic_applications").upsert(
    {
      id: userId,
      email,
      full_name: fullName.trim() || "Mechanic",
      mobile_number: application.mobileNumber,
      home_address: application.homeAddress,
      skills: application.skills,
      certifications: application.certifications,
      experience: application.experience,
      license_front_path: licenseFrontPath ?? null,
      license_back_path: licenseBackPath ?? null,
      status: "pending",
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  return error?.message ?? null;
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

async function completeSignIn(user: Session["user"]) {
  const profile = await getAccountStatus(user.id);
  if (
    profile?.role === "mechanic" &&
    profile.application_status !== "approved"
  ) {
    await supabase.auth.signOut();
    return {
      error:
        profile.application_status === "rejected"
          ? "Your mechanic application was rejected."
          : "Your mechanic application is still under review.",
    };
  }

  return { error: null };
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

WebBrowser.maybeCompleteAuthSession();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const signupInProgress = useRef(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      if (!isSupabaseConfigured) {
        if (!active) return;
        setSession(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        setSession(data.session);
      } else {
        setSession(null);
      }
      setLoading(false);

      const { data: listener } = supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          if (!signupInProgress.current) {
            setSession(nextSession);
          }
        },
      );
      unsubscribe = () => listener.subscription.unsubscribe();
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      async signIn(email, password) {
        setSession(null);
        if (!isSupabaseConfigured) {
          return {
            error: "Supabase is not configured. Check your environment settings.",
          };
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          return { error: error.message };
        }

        return completeSignIn(data.user);
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

        return completeSignIn(user);
      },
      async signUp(
        email,
        password,
        fullName,
        role = "customer",
        application,
        mobileNumber,
      ) {
        signupInProgress.current = true;
        setSession(null);

        if (!isSupabaseConfigured) {
          signupInProgress.current = false;
          return {
            error: "Supabase is not configured. Check your environment settings.",
          };
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
          signupInProgress.current = false;
          return { error: error.message ?? null };
        }

        const userId = data.user?.id;
        if (userId && application && data.session) {
          try {
            const [licenseFrontPath, licenseBackPath] = await Promise.all([
              uploadLicensePhoto(userId, application.licenseFrontUri, "front"),
              uploadLicensePhoto(userId, application.licenseBackUri, "back"),
            ]);

            const applicationError = await upsertMechanicApplication(
              userId,
              email.trim(),
              fullName.trim() || "Mechanic",
              application,
              licenseFrontPath,
              licenseBackPath,
            );
            if (applicationError) {
              signupInProgress.current = false;
              await supabase.auth.signOut();
              return { error: applicationError };
            }
          } catch (uploadError) {
            await supabase.auth.signOut();
            signupInProgress.current = false;
            return {
              error:
                uploadError instanceof Error
                  ? uploadError.message
                  : "Could not save mechanic documents.",
            };
          }
        } else if (userId && application) {
          // The database trigger creates this pending application when email
          // confirmation is enabled and no authenticated session is returned.
          if (data.session) {
            const applicationError = await upsertMechanicApplication(
              userId,
              email.trim(),
              fullName.trim() || "Mechanic",
              application,
            );
            if (applicationError) {
              signupInProgress.current = false;
              await supabase.auth.signOut();
              return { error: applicationError };
            }
          }
        } else if (userId) {
          const profileError = await upsertProfile(
            userId,
            email.trim(),
            fullName.trim() || "Mechanic",
            role,
          );
          if (profileError) {
            signupInProgress.current = false;
            await supabase.auth.signOut();
            return { error: profileError };
          }
        }

        if (data.session) {
          await supabase.auth.signOut();
        }
        setSession(null);
        signupInProgress.current = false;

        return { error: null };
      },
      async signOut() {
        if (!isSupabaseConfigured) {
          setSession(null);
          return;
        }
        await supabase.auth.signOut();
        setSession(null);
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
