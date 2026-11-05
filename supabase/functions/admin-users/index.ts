import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 2 &&
    value.trim().length <= 120
  );
}

function isValidUserId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

async function handleAdminUsersRequest(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse({ error: "Authentication is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("admin-users is missing required Supabase environment variables.");
    return jsonResponse({ error: "The user management service is not configured." }, 500);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerData, error: callerError } =
    await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) {
    return jsonResponse({ error: "Your session is invalid or expired." }, 401);
  }

  const { data: callerProfile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("admin-users failed to verify caller role:", profileError);
    return jsonResponse({ error: "Could not verify administrator access." }, 500);
  }
  if (callerProfile?.role !== "admin") {
    return jsonResponse({ error: "Administrator access is required." }, 403);
  }

  let requestData: unknown;
  try {
    requestData = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }
  if (!isRecord(requestData)) {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const action = requestData.action;
  if (action === "create") {
    const email =
      typeof requestData.email === "string"
        ? requestData.email.trim().toLowerCase()
        : "";
    const fullName = isValidName(requestData.fullName)
      ? requestData.fullName.trim().replace(/\s+/g, " ")
      : "";
    const password =
      typeof requestData.password === "string" ? requestData.password : "";
    const role = requestData.role;

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !fullName ||
      password.length < 8
    ) {
      return jsonResponse(
        { error: "A valid email, full name, and password of at least 8 characters are required." },
        400,
      );
    }
    if (role !== "admin" && role !== "mechanic" && role !== "customer") {
      return jsonResponse({ error: "Choose a valid account type." }, 400);
    }

    const { data: createdUser, error } =
      await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: "customer",
        },
      });
    if (error || !createdUser.user) {
      console.error("admin-users failed to create user account:", error);
      return jsonResponse(
        { error: error?.message ?? "Could not create the user account." },
        400,
      );
    }

    const { data: updatedProfile, error: roleError } = await serviceClient
      .from("profiles")
      .update({
        role,
        application_status: "approved",
        application_submitted_at: null,
      })
      .eq("id", createdUser.user.id)
      .select("id")
      .maybeSingle();
    if (roleError || !updatedProfile) {
      console.error(
        "admin-users failed to assign the created account role:",
        roleError ?? "The user profile was not created.",
      );
      const { error: cleanupError } = await serviceClient.auth.admin.deleteUser(
        createdUser.user.id,
        false,
      );
      if (cleanupError) {
        console.error(
          "admin-users could not clean up the failed account:",
          cleanupError,
        );
      }
      return jsonResponse(
        { error: "Could not finish setting up the approved account." },
        500,
      );
    }

    return jsonResponse({ success: true, userId: createdUser.user.id });
  }

  if (action === "update") {
    const userId = requestData.userId;
    const fullName = isValidName(requestData.fullName)
      ? requestData.fullName.trim().replace(/\s+/g, " ")
      : "";
    if (!isValidUserId(userId) || !fullName) {
      return jsonResponse({ error: "A valid user and full name are required." }, 400);
    }

    const { data: targetUserData, error: targetUserError } =
      await serviceClient.auth.admin.getUserById(userId);
    if (targetUserError || !targetUserData.user) {
      console.error(
        "admin-users failed to load target auth user:",
        targetUserError ?? "The user account was not found.",
      );
      return jsonResponse({ error: "Could not load this user account." }, 500);
    }

    const { error: metadataError } =
      await serviceClient.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...targetUserData.user.user_metadata,
          full_name: fullName,
        },
      });
    if (metadataError) {
      console.error("admin-users failed to update auth user name:", metadataError);
      return jsonResponse({ error: "Could not update this user's login profile." }, 500);
    }

    const { data, error } = await serviceClient
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("admin-users failed to update profile:", error);
      return jsonResponse({ error: "Could not update this user profile." }, 500);
    }
    if (!data) return jsonResponse({ error: "User account was not found." }, 404);
    return jsonResponse({ success: true });
  }

  if (action === "delete") {
    const userId = requestData.userId;
    if (!isValidUserId(userId)) {
      return jsonResponse({ error: "A valid user account is required." }, 400);
    }
    if (userId === callerData.user.id) {
      return jsonResponse({ error: "You cannot delete your own administrator account." }, 400);
    }

    const { data: targetProfile, error: targetError } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (targetError) {
      console.error("admin-users failed to load target profile:", targetError);
      return jsonResponse({ error: "Could not verify the account to delete." }, 500);
    }
    if (!targetProfile) {
      return jsonResponse({ error: "User account was not found." }, 404);
    }

    if (targetProfile.role === "admin") {
      const { count, error: countError } = await serviceClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (countError) {
        console.error("admin-users failed to count administrators:", countError);
        return jsonResponse({ error: "Could not verify administrator accounts." }, 500);
      }
      if ((count ?? 0) <= 1) {
        return jsonResponse({ error: "You cannot delete the last administrator account." }, 409);
      }
    }

    if (targetProfile.role === "mechanic") {
      const { data: linkedRequest, error: requestError } = await serviceClient
        .from("service_requests")
        .select("id")
        .eq("mechanic_id", userId)
        .limit(1)
        .maybeSingle();
      if (requestError) {
        console.error("admin-users failed to check mechanic requests:", requestError);
        return jsonResponse({ error: "Could not check the mechanic's service requests." }, 500);
      }
      if (linkedRequest) {
        return jsonResponse(
          {
            error:
              "This mechanic is linked to service requests and cannot be deleted until those records are reassigned.",
          },
          409,
        );
      }
    }

    const { error } = await serviceClient.auth.admin.deleteUser(userId, false);
    if (error) {
      console.error("admin-users failed to delete Auth user:", error);
      return jsonResponse(
        {
          error: `Could not permanently delete this user account: ${error.message}`,
        },
        500,
      );
    }
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: "Unsupported user management action." }, 400);
}

Deno.serve((request) =>
  handleAdminUsersRequest(request).catch((error: unknown) => {
    console.error("admin-users failed unexpectedly:", error);
    return jsonResponse(
      { error: "An unexpected user management error occurred." },
      500,
    );
  }),
);
