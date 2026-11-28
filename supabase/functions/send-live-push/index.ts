// Supabase Edge Function: send-live-push
// Sends Web Push notifications to students following a teacher or subject when a live class starts.
// Required Supabase Edge Function Secrets:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const ALLOWED_ORIGINS = new Set([
  'https://teachmelearn.netlify.app',
  'https://teach-me-app-one.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://teachmelearn.netlify.app';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@teachme.app';

    // 1. Authenticate caller via Bearer JWT
    const authHeader = req.headers.get('authorization') ?? '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: missing bearer token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: authErr } = await adminClient.auth.getUser(jwt);
    if (authErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerId = userData.user.id;

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ ok: false, skipped: true, reason: 'VAPID keys not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const body = await req.json();
    const tutorId = typeof body?.tutorId === 'string' ? body.tutorId.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim().slice(0, 120) : '';
    const tutorName = typeof body?.tutorName === 'string' ? body.tutorName.trim().slice(0, 100) : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim().slice(0, 100) : '';

    if (!tutorId || !UUID_RE.test(tutorId) || !roomId || !/^[A-Za-z0-9_-]{3,120}$/.test(roomId)) {
      return new Response(
        JSON.stringify({ error: 'Valid tutorId (UUID) and roomId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Authorize: caller must own this tutor record (or be an admin)
    const [{ data: tutorRow }, { data: profileRow }] = await Promise.all([
      adminClient.from('tutors').select('id, user_id, name').eq('id', tutorId).maybeSingle(),
      adminClient.from('profiles').select('role').eq('user_id', callerId).maybeSingle(),
    ]);

    const isAdmin = profileRow?.role === 'admin';
    const isTutorOwner = Boolean(tutorRow && tutorRow.user_id === callerId);
    if (!isAdmin && !isTutorOwner) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: caller does not own tutorId' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Safe parameterized queries (no string interpolation into .or())
    const { data: tutorFollows } = await adminClient
      .from('student_follows')
      .select('student_id')
      .eq('tutor_id', tutorId);

    let subjectFollows: { student_id: string }[] = [];
    if (subject) {
      const { data: sf } = await adminClient
        .from('student_follows')
        .select('student_id')
        .ilike('subject', subject);
      subjectFollows = sf || [];
    }

    const studentIds = Array.from(
      new Set([
        ...(tutorFollows || []).map((f) => f.student_id),
        ...subjectFollows.map((f) => f.student_id),
      ])
    );

    if (studentIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: subs } = await adminClient
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', studentIds);

    const safeDisplayName = tutorRow?.name || tutorName || 'Teacher';
    const notificationPayload = JSON.stringify({
      title: `${safeDisplayName} is live now`,
      body: `Live class in ${subject || 'your followed subject'}. Tap to join.`,
      roomId,
      url: `/?room=${encodeURIComponent(roomId)}`,
    });

    let sent = 0;
    const staleIds: string[] = [];

    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
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
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
