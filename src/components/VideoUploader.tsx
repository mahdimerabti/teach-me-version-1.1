import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';

const MAX_SIZE_MB = 100;
const ALLOWED_TYPES = ['video/mp4', 'video/webm'];

type Props = {
  tutorUserId: string;
  language?: 'en' | 'ar';
  currentVideoUrl?: string | null;
  onUploaded: (publicUrl: string) => void;
};

export default function VideoUploader({ tutorUserId, language = 'ar', currentVideoUrl, onUploaded }: Props) {
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setState('error');
      setMessage(t('Unsupported format. Please upload MP4 or WebM.', 'صيغة غير مدعومة. الرجاء رفع فيديو MP4 أو WebM.'));
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setState('error');
      setMessage(
        t(`File too large. Max size is ${MAX_SIZE_MB}MB.`, `حجم الملف كبير جداً. الحد الأقصى ${MAX_SIZE_MB} ميغابايت.`)
      );
      return;
    }
    setState('uploading');
    setMessage('');
    try {
      const ext = file.type === 'video/webm' ? 'webm' : 'mp4';
      const path = `${tutorUserId}/intro.${ext}`;
      const { error } = await supabase.storage
        .from('tutor-videos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('tutor-videos').getPublicUrl(path);
      onUploaded(data.publicUrl);
      setState('done');
      setMessage(t('Video uploaded successfully!', 'تم رفع الفيديو بنجاح!'));
    } catch {
      setState('error');
      setMessage(
        t('Upload failed. Check your connection and try again.', 'فشل رفع الفيديو. تحقق من اتصالك وحاول مجدداً.')
      );
    }
  };

  return (
    <div>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={state === 'uploading'}
        className="w-full border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/50 rounded-2xl p-6 text-center transition-colors disabled:opacity-60"
      >
        {state === 'uploading' ? (
          <Loader2 className="w-8 h-8 text-blue-500 mx-auto mb-2 animate-spin" />
        ) : (
          <Upload className="w-8 h-8 text-blue-500 mx-auto mb-2" />
        )}
        <p className="text-sm font-semibold text-gray-700">
          {state === 'uploading'
            ? t('Uploading...', 'جارِ الرفع...')
            : currentVideoUrl
            ? t('Replace intro video', 'استبدال الفيديو التعريفي')
            : t('Upload intro video', 'رفع فيديو تعريفي')}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          {t(`MP4 or WebM · 1–3 minutes · max ${MAX_SIZE_MB}MB`, `MP4 أو WebM · 1–3 دقائق · بحد أقصى ${MAX_SIZE_MB} ميغابايت`)}
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {message && (
        <p
          className={`mt-2 text-xs font-semibold flex items-center gap-1.5 ${
            state === 'error' ? 'text-red-500' : 'text-green-600'
          }`}
        >
          {state === 'error' ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
          {message}
        </p>
      )}
    </div>
  );
}
