import { supabase } from './supabase';

export type RemoteSlot = { slot_date: string; start_time: string; end_time: string };

export type RemoteSlotInput = {
  date: string;
  start_time: string;
  end_time: string;
  credit_cost: number;
};

export function fetchAvailableSlots(tutorId: string, from: string, to: string) {
  return supabase.rpc('get_available_slots', { p_tutor_id: tutorId, p_from: from, p_to: to });
}

export function bookSessions(tutorId: string, slots: RemoteSlotInput[]) {
  return supabase.rpc('book_sessions', { p_tutor_id: tutorId, p_slots: slots });
}

export function purchasePackageRemote(packageCode: string) {
  return supabase.rpc('purchase_package', { p_package_code: packageCode });
}

export function joinLiveSessionRemote(sessionId: string) {
  return supabase.rpc('join_live_session', { p_session_id: sessionId });
}

export function ensureLiveRoomRemote(
  roomId: string,
  displayName: string,
  role: 'host' | 'student',
  avatarUrl?: string
) {
  return supabase.rpc('ensure_live_room', {
    p_room_id: roomId,
    p_display_name: displayName,
    p_role: role,
    p_avatar_url: avatarUrl ?? null
  });
}

export function fetchCreditBalance() {
  return supabase.rpc('credit_balance');
}