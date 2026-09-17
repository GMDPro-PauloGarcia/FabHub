// mint-session — verifies a FabHub username/password (via the verify_login RPC)
// and returns a short-lived JWT signed with the project's JWT secret. The token
// carries a `user_role` claim that the RLS policies (migration 024) read, and
// `sub` = the user_profiles.id (text). Anonymous callers can't reach the DB
// because their session has no user_role claim.
//
// Requires the function secret APP_JWT_SECRET = the project's (legacy) JWT secret
// — Dashboard → Project Settings → API → JWT Settings → JWT Secret.
// Deployed with verify_jwt = false (this IS the login endpoint).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("APP_JWT_SECRET") || "";
// Set ALLOWED_ORIGIN (function secret) to the app's real origin, e.g.
// https://fabhub.example.com, to stop other sites POSTing to the login
// endpoint. Left unset it defaults to "*" (previous behaviour) so nothing
// breaks before the real origin is configured.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

// Map legacy/alias role names in the data onto the canonical RLS roles.
const ROLE_MAP: Record<string, string> = {
  "Operations": "ProjectMover",
  "Ops": "ProjectMover",
  "Cost Control": "Finance",
  "Admin": "Manager",
};

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Call a SECURITY DEFINER guard RPC with the service key. FAIL-OPEN: any error
// (network, RPC missing, bad response) resolves to a safe default so a broken
// rate-limiter can never lock legitimate users out of the app.
async function guardRpc<T>(fn: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(args),
    });
    if (!r.ok) return fallback;
    const body = await r.json();
    return (Array.isArray(body) ? body[0] : body) ?? fallback;
  } catch {
    return fallback;
  }
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJWT(payload: Record<string, unknown>): Promise<string> {
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return `${data}.${b64url(sig)}`;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!JWT_SECRET) return json({ error: "Server not configured (APP_JWT_SECRET missing)" }, 500);
  try {
    const { username, password } = await req.json();
    if (!username || !password) return json({ error: "Missing credentials" }, 400);

    // Rate limit: reject early if this username is currently locked out after
    // too many recent failures. Fail-open (defaults to not-locked on any error).
    const guard = await guardRpc<{ locked?: boolean; retry_after?: number }>(
      "login_guard_status", { p_username: username }, { locked: false, retry_after: 0 },
    );
    if (guard.locked) {
      return json(
        { error: "Too many failed attempts. Try again later.", retry_after: guard.retry_after ?? 900 },
        429,
      );
    }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ p_username: username, p_password: password }),
    });
    const rows = await r.json();
    const u = Array.isArray(rows) ? rows[0] : rows;

    // Record the attempt for the lockout counter: a correct password (even for
    // an inactive account) clears the counter; a wrong one increments it.
    const passwordOk = !!(u && u.found && u.password_ok);
    await guardRpc("login_guard_record", { p_username: username, p_success: passwordOk }, null);

    if (!passwordOk) return json({ error: "Invalid username or password" }, 401);
    if (u.status && u.status !== "active") return json({ error: "Account is inactive" }, 403);

    const appRole = ROLE_MAP[u.role] || u.role;
    const now = Math.floor(Date.now() / 1000);
    const token = await signJWT({
      sub: u.id,
      role: "authenticated",
      aud: "authenticated",
      iss: `${SUPABASE_URL}/auth/v1`,
      user_role: appRole,
      username: u.username,
      name: u.name,
      iat: now,
      exp: now + 60 * 60 * 12, // 12h
    });
    return json({
      access_token: token,
      expires_in: 60 * 60 * 12,
      user: { id: u.id, username: u.username, name: u.name, role: u.role, title: u.title, status: u.status, needs_upgrade: u.needs_upgrade },
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
