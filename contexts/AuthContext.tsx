import {
  clearPersistedSupabaseSession,
  isSupabaseConfigured,
  supabase,
} from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";
import * as ExpoLinking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
  authenticatedRole: { userId: string; role: AuthRole } | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInAsMechanic: (email: string, password: string) => Promise<AuthResult>;
  signInAsAdmin: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  completeGoogleSignInFromUrl: (
    callbackUrl: string,
    expectedRole?: AuthRole,
  ) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role?: AuthRole,
    application?: MechanicApplication,
    mobileNumber?: string,
  ) => Promise<AuthResult>;
  signOut: (returnTo?: "mechanic" | "customer") => Promise<void>;
  signedOutRole: "mechanic" | "customer" | null;
};

async function getAccountStatus(userId: string) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role,application_status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (data) {
    return data as Pick<ProfileRecord, "role" | "application_status">;
  }

  const application = await supabase
    .from("mechanic_applications")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (application.error) {
    throw new Error(application.error.message);
  }
  if (application.data) {
    return {
      role: "mechanic",
      application_status: application.data
        .status as ProfileRecord["application_status"],
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

async function completeSignIn(
  user: Session["user"],
  expectedRole?: AuthRole,
) {
  let profile: Pick<ProfileRecord, "role" | "application_status"> | null;
  try {
    profile = await getAccountStatus(user.id);
  } catch (profileError) {
    return {
      error:
        profileError instanceof Error
          ? `Unable to verify your account: ${profileError.message}`
          : "Unable to verify your account.",
    };
  }

  if (!profile && expectedRole !== "mechanic" && expectedRole !== "admin") {
    const metadataName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : "";
    const profileError = await upsertProfile(
      user.id,
      user.email ?? "",
      metadataName || "User",
      "customer",
    );
    if (profileError) {
      return {
        error: `Unable to prepare your customer profile: ${profileError}`,
      };
    }
    profile = { role: "customer", application_status: "approved" };
  }

  if (expectedRole && profile?.role !== expectedRole) {
    await supabase.auth.signOut();
    if (
      (expectedRole === "customer" || expectedRole === "mechanic") &&
      (profile?.role === "customer" || profile?.role === "mechanic")
    ) {
      const actualRole =
        profile.role === "mechanic" ? "mechanic" : "motorist";
      const requestedRole =
        expectedRole === "mechanic" ? "mechanic" : "motorist";
      return {
        error:
          `This account is registered as a ${actualRole}, not a ${requestedRole}. Please choose the matching sign-in or use a different email.`,
      };
    }
    const roleName =
      expectedRole === "admin"
        ? "admin"
        : expectedRole === "mechanic"
          ? "mechanic"
          : "customer";
    return { error: `Only ${roleName} accounts can use this login.` };
  }

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

function getGoogleCallbackError(callbackUrl: URL) {
  const hash = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
  const errorCode =
    callbackUrl.searchParams.get("error_code") ??
    hash.get("error_code") ??
    callbackUrl.searchParams.get("error") ??
    hash.get("error");
  const description =
    callbackUrl.searchParams.get("error_description") ??
    hash.get("error_description");
  if (!errorCode && !description) return null;

  const errorDetails = `${errorCode ?? ""} ${description ?? ""}`.toLowerCase();
  if (isExistingAccountError(errorDetails)) {
    return "This Google email is already associated with an account. Sign in using that account's original method, or choose another Google account.";
  }

  return description || errorCode || "Google sign-in could not be completed.";
}

function isExistingAccountError(message: string) {
  const normalized = message.toLowerCase();
  return (
    ["user_already_exists", "identity_already_exists", "email_exists"].some(
      (code) => normalized.includes(code),
    ) ||
    normalized.includes("user already registered") ||
    normalized.includes("identity already exists")
  );
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

WebBrowser.maybeCompleteAuthSession();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authenticatedRole, setAuthenticatedRole] = useState<
    AuthContextValue["authenticatedRole"]
  >(null);
  const [loading, setLoading] = useState(true);
  const [signedOutRole, setSignedOutRole] = useState<
    "mechanic" | "customer" | null
  >(null);
  const signupInProgress = useRef(false);
  const authOperationInProgress = useRef(false);

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;

    const syncPendingPrimaryRide = async () => {
      const pending = await SecureStore.getItemAsync("pending_primary_ride");
      if (!pending || !active) return;

      let vehicle: {
        type: string;
        make: string;
        model: string;
        year: string;
        plate_number: string;
        fuel_type: string;
        role?: string;
        skipped?: boolean;
      };
      try {
        vehicle = JSON.parse(pending) as typeof vehicle;
      } catch {
        await SecureStore.deleteItemAsync("pending_primary_ride");
        return;
      }

      if (vehicle.skipped) {
        await SecureStore.deleteItemAsync("pending_primary_ride");
        return;
      }

      const record = {
        type: vehicle.type,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        plate_number: vehicle.plate_number,
        fuel_type: vehicle.fuel_type,
        is_primary: true,
        mechanic_id: vehicle.role === "mechanic" ? session.user.id : null,
        motorist_id: vehicle.role === "mechanic" ? null : session.user.id,
      };
      const { error } = await supabase.from("vehicles").insert(record);
      if (!active) return;
      if (!error || error.code === "23505") {
        await SecureStore.deleteItemAsync("pending_primary_ride");
      } else {
        console.warn("Pending primary ride sync failed:", error.message);
      }
    };

    void syncPendingPrimaryRide();
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      if (!isSupabaseConfigured) {
        if (active) {
          setSession(null);
          setLoading(false);
        }
        return;
      }

      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      
      if (!active) return;

      if (sessionError) {
        console.warn("Error fetching Supabase session:", sessionError.message);
        setSession(null);
      } else if (currentSession) {
        setSession(currentSession);
      } else {
        setSession(null);
      }
      setLoading(false);

      const { data: listener } = supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          if (!signupInProgress.current && !authOperationInProgress.current) {
            if (nextSession) setSignedOutRole(null);
            setAuthenticatedRole((currentRole) =>
              nextSession && currentRole?.userId === nextSession.user.id
                ? currentRole
                : null,
            );
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

  const completeGoogleSignInFromUrl = useCallback(
    async (
      callbackUrl: string,
      expectedRole: AuthRole = "customer",
    ): Promise<AuthResult> => {
      if (!isSupabaseConfigured) {
        return { error: "Google login needs Supabase to be configured." };
      }

      authOperationInProgress.current = true;
      try {
        const parsedUrl = new URL(callbackUrl);
        const callbackError = getGoogleCallbackError(parsedUrl);
        if (callbackError) return { error: callbackError };

        const hash = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));
        const code = parsedUrl.searchParams.get("code");
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");

        if (code) {
          const exchanged = await supabase.auth.exchangeCodeForSession(code);
          if (exchanged.error) {
            const existingSession = await supabase.auth.getSession();
            if (existingSession.error || !existingSession.data.session) {
              const exchangeError = isExistingAccountError(
                exchanged.error.message,
              )
                ? "This Google email is already associated with an account. Sign in using that account's original method, or choose another Google account."
                : exchanged.error.message;
              return {
                error:
                    exchangeError ||
                    "Google sign-in could not complete its secure callback.",
              };
            }
          }
        } else if (accessToken && refreshToken) {
          const sessionResult = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionResult.error) {
            const existingSession = await supabase.auth.getSession();
            if (existingSession.error || !existingSession.data.session) {
              return { error: sessionResult.error.message };
            }
          }
        } else {
          return {
            error: "Google sign-in returned no authorization code or session.",
          };
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        const currentSession = data.session;
        if (sessionError || !currentSession) {
          return {
            error: sessionError?.message ?? "Google sign-in did not create a session.",
          };
        }

        const signInResult = await completeSignIn(
          currentSession.user,
          expectedRole,
        );
        if (signInResult.error) return signInResult;

        setSignedOutRole(null);
        setAuthenticatedRole(null);
        setSession(currentSession);
        return { error: null };
      } catch (callbackFailure) {
        return {
          error:
            callbackFailure instanceof Error
              ? callbackFailure.message
              : "Google sign-in callback failed.",
        };
      } finally {
        authOperationInProgress.current = false;
      }
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      authenticatedRole,
      loading,
      signedOutRole,
      completeGoogleSignInFromUrl,
      async signIn(email, password) {
        if (!isSupabaseConfigured) {
          return {
            error:
              "Supabase is not configured. Check your environment settings.",
          };
        }

        authOperationInProgress.current = true;
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

          if (error) {
            return { error: error.message };
          }

          const result = await completeSignIn(data.user, "customer");
          if (!result.error) {
            setSignedOutRole(null);
            setAuthenticatedRole({ userId: data.user.id, role: "customer" });
            setSession(data.session);
          }
          return result;
        } finally {
          authOperationInProgress.current = false;
        }
      },
      async signInAsMechanic(email, password) {
        if (!isSupabaseConfigured) {
          return {
            error:
              "Supabase is not configured. Check your environment settings.",
          };
        }

        authOperationInProgress.current = true;
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

          if (error) {
            return { error: error.message };
          }

          const result = await completeSignIn(data.user, "mechanic");
          if (!result.error) {
            setSignedOutRole(null);
            setAuthenticatedRole({ userId: data.user.id, role: "mechanic" });
            setSession(data.session);
          }
          return result;
        } finally {
          authOperationInProgress.current = false;
        }
      },
      async signInAsAdmin(email, password) {
        if (!isSupabaseConfigured) {
          return {
            error:
              "Supabase is not configured. Check your environment settings.",
          };
        }

        authOperationInProgress.current = true;
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

          if (error) {
            return { error: error.message };
          }

          const result = await completeSignIn(data.user, "admin");
          if (!result.error) {
            setSignedOutRole(null);
            setAuthenticatedRole({ userId: data.user.id, role: "admin" });
            setSession(data.session);
          }
          return result;
        } finally {
          authOperationInProgress.current = false;
        }
      },
      async signInWithGoogle() {
        if (!isSupabaseConfigured) {
          return { error: "Google login needs Supabase to be configured." };
        }

        authOperationInProgress.current = true;
        try {
          const isWeb = Platform.OS === "web";
          const redirectTo =
            isWeb && typeof window !== "undefined"
              ? `${window.location.origin}/?google_login=1`
              : ExpoLinking.createURL("auth/callback");
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo,
              skipBrowserRedirect: !isWeb,
              queryParams: { prompt: "select_account" },
            },
          });

          if (error || !data.url) {
            const errorMessage = error?.message;
            return {
              error:
                errorMessage && isExistingAccountError(errorMessage)
                  ? "This Google email is already associated with an account. Sign in using that account's original method, or choose another Google account."
                  : errorMessage ?? "Could not start Google login.",
            };
          }

          if (isWeb) {
            return { error: null };
          }

          const result = await WebBrowser.openAuthSessionAsync(
            data.url,
            redirectTo,
          );

          if (result.type !== "success") {
            return { error: "Google login was cancelled." };
          }

          return completeGoogleSignInFromUrl(result.url);
        } finally {
          authOperationInProgress.current = false;
        }
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
        setAuthenticatedRole(null);
        setSession(null);

        if (!isSupabaseConfigured) {
          signupInProgress.current = false;
          return {
            error:
              "Supabase is not configured. Check your environment settings.",
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
          return {
            error:
              isExistingAccountError(error.message)
                ? "An account with this email already exists. Please sign in instead, or use password reset if you forgot your password."
                : error.message,
          };
        }

        if (data.user && data.user.identities?.length === 0) {
          signupInProgress.current = false;
          return {
            error:
              "This email may already be linked to an account. Try signing in or reset your password if you already registered.",
          };
        }

        const userId = data.user?.id;
        if (userId && application && data.session) {
          try {
            const [licenseFrontPath, licenseBackPath] = await Promise.all([
              application.licenseFrontUri
                ? uploadLicensePhoto(
                    userId,
                    application.licenseFrontUri,
                    "front",
                  )
                : Promise.resolve(undefined),
              application.licenseBackUri
                ? uploadLicensePhoto(userId, application.licenseBackUri, "back")
                : Promise.resolve(undefined),
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

        if (data.session && application) {
          setSession(data.session);
        } else {
          if (data.session) {
            await supabase.auth.signOut();
          }
          setSession(null);
        }
        signupInProgress.current = false;

        return { error: null };
      },
      async signOut(returnTo = "customer") {
        setSignedOutRole(returnTo);
        setAuthenticatedRole(null);
        setSession(null);
        if (!isSupabaseConfigured) {
          return;
        }
        if (session?.user?.id) {
          void Promise.resolve(
            supabase
              .from("profiles")
              .update({ is_online: false })
              .eq("id", session.user.id)
              .then(({ error }) => {
                if (error) {
                  console.warn(
                    "Could not mark user offline during sign out:",
                    error.message,
                  );
                }
              }),
          )
            .catch((error: unknown) => {
              console.warn("Could not mark user offline during sign out:", error);
            });
        }
        void clearPersistedSupabaseSession().catch((error: unknown) => {
          console.error("Could not clear the saved Supabase session:", error);
        });
        void supabase.auth
          .signOut({ scope: "local" })
          .then(({ error }) => {
            if (error) {
              console.warn(
                "Supabase server-side sign out failed after local sign out:",
                error.message,
              );
            }
          })
          .catch((error: unknown) => {
            console.warn(
              "Supabase server-side sign out failed after local sign out:",
              error,
            );
          });
      },
    }),
    [
      session,
      authenticatedRole,
      loading,
      signedOutRole,
      completeGoogleSignInFromUrl,
    ],
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