import { useEffect, useState } from 'react';
import { makeT } from '../i18n';
import { Video } from 'lucide-react';
import { joinLiveSessionRemote } from '../lib/api';
import { parseTimeToMinutes, type BookedSession } from '../lib/bookingsStore';
import { claimFreeTrialCredits, fetchBalanceAndHistory } from '../lib/credits';
import { FREE_TRIAL_INITIAL_CREDITS, PAID_PLANS_ENABLED } from '../lib/config';

const JOIN_WINDOW_MIN = 15;

type Props = {
  session: BookedSession;
  language: 'en' | 'ar' | 'fr';
  onNeedCredits: () => void;
  onJoin: (roomId: string) => void;
};

export default function JoinSessionButton({ session, language, onNeedCredits, onJoin }: Props) {
  const t = makeT(language);
  const [now, setNow] = useState(() => Date.now());
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const [y, m, d] = session.date.split('-').map(Number);
  const startMs = new Date(y, m - 1, d, 0, parseTimeToMinutes(session.startTime)).getTime();
  const endMs = new Date(y, m - 1, d, 0, parseTimeToMinutes(session.endTime)).getTime();
  const opensMs = startMs - JOIN_WINDOW_MIN * 60 * 1000;

  const handleJoin = async () => {
    setJoining(true);
    try {
      let { data, error } = await joinLiveSessionRemote(session.id);
      if (error) throw error;

      let res = data as any;
      // During Free Trial mode, auto-claim free trial credits if balance was 0 and retry once
      if (res?.error === 'insufficient_credits' && !PAID_PLANS_ENABLED) {
        const claim = await claimFreeTrialCredits(FREE_TRIAL_INITIAL_CREDITS);
        if (claim.ok && claim.balance > 0) {
          const retry = await joinLiveSessionRemote(session.id);
          if (!retry.error && retry.data) {
            res = retry.data as any;
          }
        }
      }

      if (res?.error === 'insufficient_credits') {
        onNeedCredits();
        return;
      } else if (res?.error === 'too_early' && session.status !== 'live') {
        const fallbackRoom = session.liveRoomId || `teachme-room-${session.id.slice(0, 8)}`;
        onJoin(fallbackRoom);
        return;
      } else if (res?.error) {
        alert(t(`Error joining session: ${res.error}`, `خطأ في الانضمام للحصة: ${res.error}`, `Erreur de connexion à la session : ${res.error}`));
        return;
      }

      fetchBalanceAndHistory();
      onJoin(res.room_id);
    } catch (err: any) {
      console.error('Failed to join live session:', err);
      const testRoomId = session.liveRoomId || `teachme-room-${session.id.slice(0, 8)}`;
      onJoin(testRoomId);
    } finally {
      setJoining(false);
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
        disabled={joining}
        className={`w-full py-2.5 rounded-xl text-white text-sm font-bold shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 ${
          isLive
            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
            : isFuture
            ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
            : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200'
        }`}
      >
        {isLive && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
        )}
        <Video className="w-4 h-4" />
        {isLive
          ? t('Join Live Lesson NOW (1 Free Trial Credit)', 'انضم للحصة المباشرة الآن (رصيد تجريبي)', 'Rejoindre le cours en direct')
          : isFuture
          ? t('Enter the classroom early', 'الدخول المبكر إلى الحصة', 'Entrer en avance dans la classe')
          : t('Join Live Session', 'انضم للحصة المباشرة', 'Rejoindre la session en direct')}
      </button>
    </div>
  );
}
