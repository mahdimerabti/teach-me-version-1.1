import { useState } from 'react';
import { makeT } from '../i18n';
import { Play, VideoOff } from 'lucide-react';

type Props = {
  videoUrl?: string;
  tutorName: string;
  language: 'en' | 'ar' | 'fr';
};

export default function TutorVideoIntro({ videoUrl, tutorName, language }: Props) {
  const t = makeT(language);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  if (!videoUrl) return null;

  return (
    <div>
      <h3 className="font-bold text-gray-900 mb-2">{t('Intro Video', 'فيديو تعريفي')}</h3>
      <div className="aspect-video bg-gray-900 rounded-2xl relative overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 p-4">
            <VideoOff className="w-8 h-8 text-gray-400" />
            <p className="text-gray-300 text-xs">
              {t('Video unavailable or unsupported format.', 'الفيديو غير متاح أو الصيغة غير مدعومة.')}
            </p>
            <button
              onClick={() => {
                setError(false);
                setPlaying(false);
              }}
              className="text-blue-400 text-xs font-semibold hover:text-blue-300 transition-colors"
            >
              {t('Retry', 'إعادة المحاولة')}
            </button>
          </div>
        ) : playing ? (
          <video
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-contain"
            controls
            autoPlay
            playsInline
            onError={() => setError(true)}
          />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="absolute inset-0 w-full h-full flex items-center justify-center"
            aria-label={t('Play intro video', 'تشغيل الفيديو التعريفي')}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-950/60 to-blue-900/60" />
            <div className="relative text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2 animate-pulse-ring backdrop-blur-sm hover:bg-white/30 transition-colors">
                <Play className="w-7 h-7 text-white ml-1" />
              </div>
              <p className="text-white text-sm font-medium">
                {t(`Watch ${tutorName}'s introduction`, 'شاهد الفيديو التعريفي')}
              </p>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
