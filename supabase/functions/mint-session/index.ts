// mint-session — verifies a FabHub username/password (via the verify_login RPC)
// and returns a short-lived JWT signed with the project's JWT secret. The token
// carries a `user_role` claim that the RLS policies (migration 024) read, and
// `sub` = the user_profiles.id (text). Anonymous callers can't reach the DB
// because their session has no user_role claim.
//
// Requires the function secret APP_JWT_SECRET = the project's (legacy) JWT secret
// — Dashboard → Project Settings → API → JWT Settings → JWT Secret.
// Deployed with verify_jwt = false (this IS the login endpoint).
//
// Two modes, same response shape:
//   { username, password }  → normal login (rate-limited, bcrypt via verify_login)
//   { refresh_token }       → silent renewal of a token THIS function signed.
// Renewal exists because the 12h token used to simply die mid-shift or
// overnight: every read/save after that failed with PGRST303 (seen daily on
// 4+ devices, 2026-10-01). Renewal re-reads the user's row each time, so a
// deactivated account or a changed role takes effect at the next renewal, and
// MAX_SESSION_S forces a real password login at least once a week.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("APP_JWT_SECRET") || "";
// Set ALLOWED_ORIGIN (function secret) to the app's real origin, e.g.
// https://fabhub.example.com, to stop other sites POSTing to the login
// endpoint. Left unset it defaults to "*" (previous behaviour) so nothing
// breaks before the real origin is configured.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const TOKEN_TTL_S = 60 * 60 * 12;          // each token: 12h (unchanged)
// How long after expiry a token may still be exchanged. Covers a laptop that
// slept overnight (closed 6pm, opened 8am = 14h, token died at ~8pm).
const REFRESH_GRACE_S = 60 * 60 * 24;
// Hard cap from the original password login, whatever happens with renewals.
const MAX_SESSION_S = 60 * 60 * 24 * 7;

// Map legacy/alias role names in the data onto the canonical RLS roles.
const ROLE_MAP: Record<string, string> = {
  "Operations": "ProjectMover",
  "Ops": "ProjectMover",
  "Cost Control": "Finance",
  "Admin": "Manager",
  // Procurement Manager is an app-level distinction (PO approver); server-side it
  // gets the exact same RLS access as Procurement. Mirror in core.js RLS_ROLE_MAP.
  "ProcurementManager": "Procurement",
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

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// Verify an HS256 token signed with JWT_SECRET. Returns its payload, or null if
// the shape or signature is wrong. Does NOT check exp — the caller decides.
// crypto.subtle.verify compares the MAC in constant time.
async function verifyJWT(token: string): Promise<Record<string, unknown> | null> {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    if (head.alg !== "HS256") return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return null;
  }
}

type Profile = { id: string; username: string; name: string; role: string; title?: string; status?: string; needs_upgrade?: boolean };

async function issue(u: Profile, authTime: number): Promise<Response> {
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
    exp: now + TOKEN_TTL_S,
    auth_time: authTime, // when the password was last checked; carried across renewals
  });
  return json({
    access_token: token,
    expires_in: TOKEN_TTL_S,
    user: { id: u.id, username: u.username, name: u.name, role: u.role, title: u.title, status: u.status, needs_upgrade: u.needs_upgrade },
  });
}

async function refresh(refreshToken: string): Promise<Response> {
  const p = await verifyJWT(refreshToken);
  // One generic message for every refusal: the caller just goes to the login screen.
  const deny = () => json({ error: "Session expired — please log in again" }, 401);
  if (!p || p.role !== "authenticated" || !p.sub || !p.username) return deny();
  const now = Math.floor(Date.now() / 1000);
  const exp = Number(p.exp) || 0;
  const authTime = Number(p.auth_time ?? p.iat) || 0;
  if (now > exp + REFRESH_GRACE_S) return deny();
  if (now > authTime + MAX_SESSION_S) return deny();

  // Re-read the account: offboarding (status) and role changes apply now, not
  // whenever the user next types a password.
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(String(p.sub))}&select=id,username,name,role,title,status&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!r.ok) return json({ error: "Could not verify the session — try again" }, 503);
  const rows = await r.json();
  const u = Array.isArray(rows) ? rows[0] : null;
  if (!u || u.username !== p.username) return deny();
  if (u.status && u.status !== "active") return json({ error: "Account is inactive" }, 403);
  return issue(u, authTime);
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
    const body = await req.json();
    if (body && typeof body.refresh_token === "string") return await refresh(body.refresh_token);
    const { username, password } = body || {};
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

    return await issue(u, Math.floor(Date.now() / 1000));
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
