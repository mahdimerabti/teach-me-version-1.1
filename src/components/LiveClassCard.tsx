import { Video, Loader2 } from 'lucide-react';
import { makeT } from '../i18n';

interface LiveClassCardProps {
  tutorName: string;
  avatarUrl: string;
  subject: string;
  joining?: boolean;
  onJoin: () => void;
  onOpenProfile?: () => void;
  language: 'en' | 'ar' | 'fr';
  compact?: boolean;
}

export default function LiveClassCard({
  tutorName,
  avatarUrl,
  subject,
  joining = false,
  onJoin,
  onOpenProfile,
  language,
  compact = false,
}: LiveClassCardProps) {
  const t = makeT(language);

  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    tutorName || 'Tutor'
  )}&background=2563EB&color=fff&size=120`;

  return (
    <div
      className={`bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 ${
        compact ? 'p-3' : 'p-3.5'
      }`}
    >
      <div
        onClick={onOpenProfile}
        role={onOpenProfile ? 'button' : undefined}
        tabIndex={onOpenProfile ? 0 : undefined}
        onKeyDown={(e) => {
          if (onOpenProfile && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onOpenProfile();
          }
        }}
        className={`flex items-center gap-3 min-w-0 flex-1 ${
          onOpenProfile ? 'cursor-pointer' : ''
        }`}
      >
        <div className="relative flex-shrink-0">
          <img
            src={avatarUrl || fallbackAvatar}
            alt={tutorName}
            className="w-11 h-11 rounded-xl object-cover border border-slate-200"
            onError={(e) => {
              (e.target as HTMLImageElement).src = fallbackAvatar;
            }}
          />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              {t('Live', 'مباشر', 'En direct')}
            </span>
          </div>
          <p className="font-bold text-slate-900 text-sm truncate mt-1">{tutorName}</p>
          <p className="text-xs text-slate-500 truncate">{subject}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onJoin();
        }}
        disabled={joining}
        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-200 flex items-center gap-1.5 flex-shrink-0 transition-all disabled:opacity-60"
      >
        {joining ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Video className="w-3.5 h-3.5" />
        )}
        <span>{joining ? t('Joining...', 'جاري الانضمام...', 'Connexion...') : t('Join', 'انضمام', 'Rejoindre')}</span>
      </button>
    </div>
  );
}
