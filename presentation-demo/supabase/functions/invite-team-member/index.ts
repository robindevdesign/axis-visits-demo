import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://robindevdesign.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin)
      ? origin
      : "https://robindevdesign.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function defaultKey(name: string, legacyName: string): string {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get(name) || "{}");
  return keys.default || "";
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") return jsonResponse({ error: "Use POST to send an invitation." }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return jsonResponse({ error: "This app origin is not allowed." }, 403, origin);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Sign in before sending an invitation." }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !secretKey) {
    console.error("Supabase function environment is missing a required key.");
    return jsonResponse({ error: "Invitations are not configured yet." }, 500, origin);
  }

  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await callerClient.auth.getUser();
  const user = userResult?.user;
  if (userError || !user) return jsonResponse({ error: "Your session has expired. Sign in again." }, 401, origin);

  const { data: caller, error: profileError } = await adminClient
    .from("profiles")
    .select("global_role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !caller?.is_active) {
    return jsonResponse({ error: "Your Axis Visits account is inactive." }, 403, origin);
  }
  if (!(["SUPER_ADMIN", "VP"] as string[]).includes(caller.global_role)) {
    return jsonResponse({ error: "Only a VP or Monse can invite team members." }, 403, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Enter a valid invitation request." }, 400, origin);
  }
  const email = String(body.email || "").trim().toLowerCase();
  const firstName = String(body.firstName || "").trim().slice(0, 80);
  const lastName = String(body.lastName || "").trim().slice(0, 80);
  const requestedRole = String(body.role || "SALES").toUpperCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return jsonResponse({ error: "Enter a valid email address." }, 400, origin);
  }
  if (!(["SALES", "VP"] as string[]).includes(requestedRole)) {
    return jsonResponse({ error: "Invitations can only create Sales or VP accounts." }, 400, origin);
  }
  if (requestedRole === "VP" && caller.global_role !== "SUPER_ADMIN") {
    return jsonResponse({ error: "VPs can invite Sales reps only." }, 403, origin);
  }

  const redirectTo = origin === "http://localhost:8000" || origin === "http://127.0.0.1:8000"
    ? origin
    : "https://robindevdesign.github.io/axis-visits-demo/";
  const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName },
    redirectTo,
  });
  if (inviteError || !invitation.user) {
    const duplicate = /already|exists|registered/i.test(inviteError?.message || "");
    return jsonResponse({
      error: duplicate
        ? "This email already has an Axis Visits account. Ask Monse to update its role if needed."
        : (inviteError?.message || "Supabase could not send the invitation."),
    }, duplicate ? 409 : 400, origin);
  }

  const { error: roleError } = await adminClient
    .from("profiles")
    .update({ global_role: requestedRole })
    .eq("id", invitation.user.id);
  if (roleError) {
    console.error("Invitation was sent, but the profile role could not be assigned.", roleError.message);
    return jsonResponse({ error: "The invitation was sent, but its workspace role could not be assigned. Contact Monse." }, 500, origin);
  }

  return jsonResponse({ email, role: requestedRole }, 200, origin);
});
