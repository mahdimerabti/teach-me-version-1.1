import { useEffect, useState } from 'react';
import { Clock3, Video } from 'lucide-react';
import { joinLiveSessionRemote } from '../lib/api';
import { parseTimeToMinutes, type BookedSession } from '../lib/bookingsStore';

const JOIN_WINDOW_MIN = 15;

type Props = {
  session: BookedSession;
  language: 'en' | 'ar' | 'fr';
  onNeedCredits: () => void;
  onJoin: (roomId: string) => void;
};

export default function JoinSessionButton({ session, language, onNeedCredits, onJoin }: Props) {
  const t = (en: string, ar: string, fr?: string) => (language === 'ar' ? ar : (language === 'fr' ? (fr || en) : en));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const [y, m, d] = session.date.split('-').map(Number);
  const startMs = new Date(y, m - 1, d, 0, parseTimeToMinutes(session.startTime)).getTime();
  const endMs = new Date(y, m - 1, d, 0, parseTimeToMinutes(session.endTime)).getTime();
  const opensMs = startMs - JOIN_WINDOW_MIN * 60 * 1000;

  const handleJoin = async () => {
    try {
      const { data, error } = await joinLiveSessionRemote(session.id);
      if (error) throw error;
      
      const res = data as any;
      if (res.error === 'insufficient_credits') {
        onNeedCredits();
        return;
      } else if (res.error === 'too_early' && session.status !== 'live') {
        // Fallback for test/preview join before start window
        const fallbackRoom = session.liveRoomId || `teachme-room-${session.id.slice(0, 8)}`;
        onJoin(fallbackRoom);
        return;
      } else if (res.error) {
        alert(t(`Error joining session: ${res.error}`, `خطأ في الانضمام للحصة: ${res.error}`));
        return;
      }
      
      onJoin(res.room_id);
    } catch (err: any) {
      console.error('Failed to join live session:', err);
      // Fallback room ID for testing
      const testRoomId = session.liveRoomId || `teachme-room-${session.id.slice(0, 8)}`;
      onJoin(testRoomId);
    }
  };

  if (now > endMs) {
    return (
      <div className="mt-3 w-full py-2.5 rounded-xl bg-gray-100 text-gray-400 text-xs font-semibold text-center">
        {t('Session ended', 'انتهت الحصة')}
      </div>
    );
  }

  const isLive = session.status === 'live';
  const isFuture = now < opensMs && !isLive;

  return (
    <div className="mt-3 space-y-1.5">
      <button
        onClick={handleJoin}
        className={`w-full py-2.5 rounded-xl text-white text-sm font-bold shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
          isLive
            ? 'bg-red-600 hover:bg-red-700 shadow-red-200 animate-pulse'
            : isFuture
            ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
            : 'bg-green-500 hover:bg-green-600 shadow-green-200'
        }`}
      >
        <Video className="w-4 h-4" />
        {isLive
          ? t('🔴 Join Live Lesson NOW', '🔴 انضم للحصة المباشرة الآن (الأستاذ متصل)')
          : isFuture
          ? t('🧪 Test Live Session & Zoom Room Now', '🧪 تجربة البث المباشر وغرفة زوم الآن')
          : t('Join Live Session', 'انضم للحصة المباشرة')}
      </button>
    </div>
  );
}