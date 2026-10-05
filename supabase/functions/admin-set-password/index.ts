// Edge Function: an organizer sets a temporary password for a member of their
// team (Supabase's built-in email cannot reach players, so there is no
// "forgot password" email; see docs/PLAN.md §2.5).
//
// The service key comes from Supabase's own environment
// (SUPABASE_SERVICE_ROLE_KEY) and never appears in the repo or the app.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return reply(405, { error: 'method-not-allowed' });

  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return reply(401, { error: 'not-signed-in' });

  let body: { team_id?: unknown; user_id?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: 'invalid-json' });
  }
  const { team_id: teamId, user_id: userId, password } = body;
  if (
    typeof teamId !== 'string' ||
    !UUID.test(teamId) ||
    typeof userId !== 'string' ||
    !UUID.test(userId)
  ) {
    return reply(400, { error: 'invalid-ids' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return reply(400, { error: 'invalid-password' });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Ask the database, as the caller, whether they may do this. The same RLS
  // helpers decide as everywhere else.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: allowed, error: checkError } = await asCaller.rpc('can_reset_password', {
    p_team: teamId,
    p_user: userId,
  });
  if (checkError) return reply(401, { error: 'not-allowed' });
  if (allowed !== true) return reply(403, { error: 'not-allowed' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return reply(500, { error: 'update-failed' });
  return reply(200, { ok: true });
});
