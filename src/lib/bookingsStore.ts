import { useEffect, useState } from 'react';
import type { Tutor } from './db';
import { supabase } from './supabase';

export type SelectedSlot = {
  key: string;
  date: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  creditCost: number;
};

export type BookedSession = {
  id: string;
  bookingGroupId: string;
  tutorId: string;
  tutorName: string;
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
  creditCost: number;
  status: 'confirmed' | 'live' | 'completed' | 'cancelled' | 'missed';
  liveRoomId: string;
  createdAt: string;
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

let globalSessions: BookedSession[] = [];
let isFetching = false;

export function parseTimeToMinutes(value: string): number {
  if (!value) return 0;
  const str = String(value).trim();
  const m = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3]?.toUpperCase();
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

export function formatMinutes(total: number): string {
  const h24 = Math.floor(total / 60) % 24;
  const min = total % 60;
  const mer = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(min).padStart(2, '0')} ${mer}`;
}

export function convertDbTimeToFrontend(timeStr: string): string {
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const h24 = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  const mer = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(min).padStart(2, '0')} ${mer}`;
}

async function fetchSessions() {
  if (isFetching) return;
  const sessionResult = await supabase.auth.getSession();
  if (!sessionResult.data.session) {
    globalSessions = [];
    notify();
    return;
  }
  isFetching = true;
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        id,
        booking_group_id,
        tutor_id,
        date,
        start_time,
        end_time,
        status,
        credit_cost,
        live_room_id,
        created_at,
        subject,
        tutors!inner (name, name_ar, status)
      `)
      .eq('tutors.status', 'approved');

    if (error) throw error;

    globalSessions = (data || []).map((row: any) => ({
      id: row.id,
      bookingGroupId: row.booking_group_id,
      tutorId: row.tutor_id,
      tutorName: row.tutors?.name || 'Tutor',
      subject: row.subject || 'Private lesson',
      date: row.date,
      startTime: convertDbTimeToFrontend(row.start_time),
      endTime: convertDbTimeToFrontend(row.end_time),
      creditCost: row.credit_cost,
      status: row.status,
      liveRoomId: row.live_room_id,
      createdAt: row.created_at
    })).sort((a, b) =>
      a.date === b.date
        ? parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
        : a.date.localeCompare(b.date)
    );

    notify();
  } catch (err) {
    console.error('Error fetching sessions:', err);
  } finally {
    isFetching = false;
  }
}

let activeSessionsChannel: any = null;

supabase.auth.onAuthStateChange((_event, session) => {
  if (activeSessionsChannel) {
    supabase.removeChannel(activeSessionsChannel);
    activeSessionsChannel = null;
  }

  if (session?.user) {
    // Defer DB calls outside onAuthStateChange so GoTrue releases its auth lock first
    setTimeout(() => {
      void fetchSessions();
      activeSessionsChannel = supabase
        .channel('sessions-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sessions' },
          () => {
            void fetchSessions();
          }
        )
        .subscribe();
    }, 0);
  } else {
    globalSessions = [];
    notify();
  }
});

// Trigger initial load if session is already hydrated
fetchSessions();

export function getSessions(): BookedSession[] {
  return globalSessions;
}

export async function addSessionsRemote(
  tutorId: string,
  subject: string,
  slots: SelectedSlot[]
): Promise<{ ok: true; sessions: BookedSession[] } | { ok: false; error: string }> {
  const formattedSlots = slots.map(slot => {
    const startMin = parseTimeToMinutes(slot.startTime);
    const endMin = parseTimeToMinutes(slot.endTime);
    const startH = Math.floor(startMin / 60);
    const startM = startMin % 60;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;

    return {
      date: slot.date,
      start_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`,
      end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`,
      credit_cost: slot.creditCost,
      subject
    };
  });

  const { data, error } = await supabase.rpc('book_sessions', {
    p_tutor_id: tutorId,
    p_slots: formattedSlots
  });

  if (error) {
    console.error('Error booking sessions:', error);
    return { ok: false, error: error.message };
  }

  const result = data as any;
  if (result.error === 'conflict') {
    return { ok: false, error: 'conflict' };
  }
  if (result.error === 'insufficient_credits') {
    return { ok: false, error: 'insufficient_credits' };
  }

  await fetchSessions();
  
  const newSessions = globalSessions.filter(s => s.bookingGroupId === result.booking_group_id);
  return { ok: true, sessions: newSessions };
}

export function addSessions(
  tutor: Tutor,
  subject: string,
  slots: SelectedSlot[]
): { ok: true; sessions: BookedSession[] } | { ok: false; conflict: string } {
  return { ok: true, sessions: [] };
}

export function useBookedSessions(): BookedSession[] {
  const [sessions, setSessions] = useState<BookedSession[]>(globalSessions);
  useEffect(() => {
    setSessions(globalSessions);
    const fn = () => setSessions(globalSessions);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return sessions;
}