import { supabase } from './supabase';

export type MeetingHistoryRecord = {
  id: string;
  sessionId: string;
  tutorId: string;
  studentId: string;
  joinedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  status: 'active' | 'completed' | 'cancelled';
};

/**
 * Generates a clean, secure Jitsi room name seeded by the session/room ID.
 */
export function generateSecureRoomName(roomId: string): string {
  const cleanId = roomId.replace(/[^a-zA-Z0-9-]/g, '');
  return `teachme-classroom-${cleanId || 'live-session'}`;
}

/**
 * Builds standard configuration options for the Jitsi Meet IFrame API.
 */
export function buildJitsiOptions({
  roomId,
  userName,
  userAvatar,
  isTutor: _isTutor,
  container,
  language
}: {
  roomId: string;
  userName: string;
  userAvatar?: string;
  isTutor: boolean;
  container: HTMLElement;
  language: 'en' | 'ar' | 'fr';
}) {
  const roomName = generateSecureRoomName(roomId);

  return {
    roomName,
    width: '100%',
    height: '100%',
    parentNode: container,
    userInfo: {
      displayName: userName,
      avatarURL: userAvatar || undefined
    },
    configOverwrite: {
      startWithAudioMuted: true,
      startWithVideoMuted: false,
      prejoinPageEnabled: false,
      prejoinConfig: { enabled: false },
      disableDeepLinking: true,
      disableInviteFunctions: true,
      disableChat: false,
      enableWelcomePage: false,
      enableClosePage: false,
      doNotStoreRoom: true,
      requireDisplayName: false,
      enableIceRestart: true,
      p2p: {
        enabled: true,
        useStunTurn: true
      },
      defaultLanguage: language === 'ar' ? 'ar' : language === 'fr' ? 'fr' : 'en',
      lobby: {
        enabled: false
      },
      toolbarButtons: [
        'microphone',
        'camera',
        'desktop', // Screen sharing
        'chat', // In-meeting chat
        'raisehand',
        'tileview',
        'fullscreen',
        'fodeviceselection',
        'hangup',
        'profile',
        'settings',
        'videoquality',
        'filmstrip'
      ]
    },
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK: false,
      SHOW_WATERMARK_FOR_GUESTS: false,
      SHOW_BRAND_WATERMARK: false,
      SHOW_POWERED_BY: false,
      DEFAULT_BACKGROUND: '#0F172A',
      DEFAULT_REMOTE_DISPLAY_NAME: language === 'ar' ? 'مشارك' : 'Participant',
      TOOLBAR_ALWAYS_VISIBLE: true,
      MOBILE_APP_PROMO: false
    }
  };
}

/**
 * Persists a meeting session start event into Supabase storage / database.
 */
export async function logMeetingStart(sessionId: string, userId: string, role: 'tutor' | 'student'): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('meeting_history')
      .insert({
        session_id: sessionId,
        user_id: userId,
        role: role,
        joined_at: new Date().toISOString(),
        status: 'active'
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.warn('Notice logging meeting start to database:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.warn('Exception logging meeting start:', err);
    return null;
  }
}

/**
 * Updates a meeting history record upon session leave/end with duration.
 */
export async function logMeetingEnd(historyId: string | null, startTimeMs: number): Promise<void> {
  if (!historyId) return;

  try {
    const nowMs = Date.now();
    const durationSeconds = Math.max(1, Math.round((nowMs - startTimeMs) / 1000));

    const { error } = await supabase
      .from('meeting_history')
      .update({
        ended_at: new Date(nowMs).toISOString(),
        duration_seconds: durationSeconds,
        status: 'completed'
      })
      .eq('id', historyId);

    if (error) {
      console.warn('Notice updating meeting end log:', error.message);
    }
  } catch (err) {
    console.warn('Exception logging meeting end:', err);
  }
}

/**
 * Retrieves meeting history logs for a specific user.
 */
export async function fetchMeetingHistory(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('meeting_history')
      .select('*, sessions(*)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });

    if (error) {
      console.warn('Notice fetching meeting history:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('Exception fetching meeting history:', err);
    return [];
  }
}
