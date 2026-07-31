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

export function fetchCreditBalance() {
  return supabase.rpc('credit_balance');
}
