// Supabase Edge Function: send-live-push
// Sends Web Push notifications to students following an approved teacher or subject when a live class starts.
// Hardened with JWT authentication, tutor ownership verification, parameterized queries, rate limiting, and origin allowlist.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import webpush from 'npm:web-push@3.6.7';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://teachmelearn.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://localhost',
  'capacitor://localhost'
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const extraOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_ALLOWED_ORIGINS, ...extraOrigins]);
  const allowOrigin = allowed.has(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function escapeIlikeLiteral(raw: string): string {
  return raw.replace(/[\\%_]/g, '\\$&');
}

// Per-isolate sliding window cooldown per tutor (defense-in-depth alongside DB check)
const tutorCooldownMap = new Map<string, number>();
const COOLDOWN_MS = 60_000;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'method_not_allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@teachme.app';

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Verify caller JWT
    const { data: authData, error: authErr } = await adminClient.auth.getUser(jwt);
    if (authErr || !authData?.user) {
      return new Response(
        JSON.stringify({ error: 'invalid_token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Verify caller owns an approved tutor profile (server-authoritative tutor identity)
    const { data: tutorRow, error: tutorErr } = await adminClient
      .from('tutors')
      .select('id, name, status, is_live, active_session_url')
      .eq('user_id', authData.user.id)
      .eq('status', 'approved')
      .maybeSingle();

    if (tutorErr || !tutorRow) {
      return new Response(
        JSON.stringify({ error: 'forbidden_tutor_not_approved' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Enforce per-tutor cooldown to prevent push spam
    const lastSentAt = tutorCooldownMap.get(tutorRow.id) || 0;
    if (Date.now() - lastSentAt < COOLDOWN_MS) {
      return new Response(
        JSON.stringify({ ok: false, skipped: true, reason: 'rate_limited' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ ok: false, skipped: true, reason: 'VAPID keys not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const body = await req.json().catch(() => ({}));
    const rawRoomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
    const rawSubject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 80) : '';

    // Validate roomId: alphanumeric/hyphen/underscore room identifier (no URLs or traversal)
    if (!/^[A-Za-z0-9_-]{3,100}$/.test(rawRoomId)) {
      return new Response(
        JSON.stringify({ error: 'invalid_room_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    tutorCooldownMap.set(tutorRow.id, Date.now());

    // 4. Parameterized follower queries (eliminates PostgREST .or() filter injection)
    const followerSet = new Set<string>();

    const { data: tutorFollows } = await adminClient
      .from('student_follows')
      .select('student_id')
      .eq('tutor_id', tutorRow.id)
      .limit(500);

    for (const row of tutorFollows || []) {
      if (row.student_id && row.student_id !== authData.user.id) {
        followerSet.add(row.student_id);
      }
    }

    if (rawSubject.length >= 2) {
      const { data: subjectFollows } = await adminClient
        .from('student_follows')
        .select('student_id')
        .ilike('subject', escapeIlikeLiteral(rawSubject))
        .limit(500);

      for (const row of subjectFollows || []) {
        if (row.student_id && row.student_id !== authData.user.id) {
          followerSet.add(row.student_id);
        }
      }
    }

    const studentIds = Array.from(followerSet);
    if (studentIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: subs } = await adminClient
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', studentIds)
      .limit(1000);

    const safeTutorName = String(tutorRow.name || 'Teacher').slice(0, 80);
    const notificationPayload = JSON.stringify({
      title: `${safeTutorName} is live now`,
      body: `Live class in ${rawSubject || 'your followed subject'}. Tap to join.`,
      roomId: rawRoomId,
      url: `/?room=${encodeURIComponent(rawRoomId)}`
    });

    let sent = 0;
    const staleIds: string[] = [];

    for (const sub of subs || []) {
      if (typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://')) {
        staleIds.push(sub.id);
        continue;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          notificationPayload
        );
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleIds.push(sub.id);
        }
      }
    }

    if (staleIds.length > 0) {
      await adminClient.from('push_subscriptions').delete().in('id', staleIds);
    }

    return new Response(
      JSON.stringify({ ok: true, sent, pruned: staleIds.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
