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

// Map legacy/alias role names in the data onto the canonical RLS roles.
const ROLE_MAP: Record<string, string> = {
  "Operations": "ProjectMover",
  "Ops": "ProjectMover",
  "Cost Control": "Finance",
  "Admin": "Manager",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    if (!u || !u.found || !u.password_ok) return json({ error: "Invalid username or password" }, 401);
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
