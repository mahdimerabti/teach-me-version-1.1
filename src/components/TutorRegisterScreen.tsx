import { useState, useRef } from 'react';
import { ArrowLeft, Upload, Plus, Trash2, Clock, CheckCircle, Video, BookOpen, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CURRENCY_CODE } from '../lib/config';

interface TutorRegisterScreenProps {
  user: { name: string; email: string; id: string };
  onBack: () => void;
  onComplete: (tutorData: TutorProfile) => void;
  language: 'en' | 'ar' | 'fr';
}

export type TutorProfile = {
  name: string;
  nameAr: string;
  bio: string;
  bioAr: string;
  subjects: string[];
  hourlyRate: number;
  experienceYears?: number;
  status?: string;
  languages: string[];
  videoUrl: string;
  schedule: ScheduleEntry[];
  category: string;
  certificates?: string[];
  identityVerified?: boolean;
  avatarUrl?: string;
  idDocumentUrl?: string;
  meetingSettings?: {
    muteOnJoin: boolean;
    videoOnJoin: boolean;
    waitingRoom: boolean;
    allowChat: boolean;
    allowScreenShare: boolean;
  };
};

type ScheduleEntry = {
  day: string;
  startTime: string;
  endTime: string;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CATEGORIES = [
  'School Education', 'University Education', 'Digital & Creative',
  'Technology & Finance', 'Languages', 'Personal Development',
  'Science & Engineering', 'Arts & Music', 'Business', 'Health & Medicine',
];
const ALL_SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Arabic',
  'French', 'History', 'Computer Science', 'Programming', 'Python',
  'JavaScript', 'React', 'Data Science', 'AI/ML', 'Graphic Design',
  'UI/UX Design', 'Photography', 'Video Editing', 'Music', 'Drawing',
  'Leadership', 'Public Speaking', 'Finance', 'Marketing', 'Accounting',
  'Calculus', 'Algebra', 'Geometry', 'IELTS', 'TOEFL', 'SAT Prep',
];

const STEP_TITLES_EN = ['Basic Info', 'Subjects & Rate', 'Schedule', 'Intro Video', 'Meeting Settings', 'Verification', 'Review'];
const STEP_TITLES_AR = ['معلومات أساسية', 'المواد والتسعيرة', 'جدول العمل', 'فيديو تعريفي', 'إعدادات الاجتماع', 'التأكيد والتوثيق', 'مراجعة الطلب'];
const STEP_TITLES_FR = ['Infos de base', 'Matières & Tarif', 'Planning', 'Vidéo d\'intro', 'Paramètres réunion', 'Vérification', 'Révision'];

export default function TutorRegisterScreen({ user, onBack, onComplete, language }: TutorRegisterScreenProps) {
  const STEP_TITLES = language === 'ar' ? STEP_TITLES_AR : language === 'fr' ? STEP_TITLES_FR : STEP_TITLES_EN;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<TutorProfile>({
    name: user.name,
    nameAr: '',
    bio: '',
    bioAr: '',
    subjects: [],
    hourlyRate: 30,
    languages: ['Arabic'],
    videoUrl: '',
    schedule: [],
    category: '',
    certificates: [],
    identityVerified: false,
    avatarUrl: '',
    meetingSettings: {
      muteOnJoin: true,
      videoOnJoin: false,
      waitingRoom: true,
      allowChat: true,
      allowScreenShare: true,
    }
  });
  const [subjectSearch, setSubjectSearch] = useState('');
  const [langInput, setLangInput] = useState('');
  const [certInput, setCertInput] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
 
  const [idFile, setIdFile] = useState<File | null>(null);
  const idFileInputRef = useRef<HTMLInputElement>(null);
 
  const [certFiles, setCertFiles] = useState<File[]>([]);
  const certFileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
 
  const t = (en: string, ar: string, fr?: string) => {
    if (language === 'ar') return ar;
    if (language === 'fr') return fr || en;
    return en;
  };
 
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
 
    if (file.size > 5 * 1024 * 1024) {
      alert(t('File size exceeds 5MB', 'حجم الملف يتجاوز 5 ميغابايت', 'La taille du fichier dépasse 5 Mo'));
      return;
    }
 
    if (!file.type.startsWith('image/')) {
      alert(t('Only image files are allowed', 'يسمح بملفات الصور فقط', 'Seuls les fichiers image sont autorisés'));
      return;
    }
 
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };
 
  const handleIdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(t('File size exceeds 5MB', 'حجم الملف يتجاوز 5 ميغابايت', 'La taille du fichier dépasse 5 Mo'));
      return;
    }
    setIdFile(file);
    setProfile(p => ({ ...p, identityVerified: true }));
  };
 
  const handleCertFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(t('File size exceeds 5MB', 'حجم الملف يتجاوز 5 ميغابايت', 'La taille du fichier dépasse 5 Mo'));
      return;
    }
    setCertFiles(prev => [...prev, file]);
    setProfile(p => ({ ...p, certificates: [...(p.certificates || []), file.name] }));
  };

  const addSubject = (s: string) => {
    if (!profile.subjects.includes(s)) setProfile(p => ({ ...p, subjects: [...p.subjects, s] }));
  };
  const removeSubject = (s: string) => setProfile(p => ({ ...p, subjects: p.subjects.filter(x => x !== s) }));

  const addLanguage = () => {
    if (langInput.trim() && !profile.languages.includes(langInput.trim())) {
      setProfile(p => ({ ...p, languages: [...p.languages, langInput.trim()] }));
      setLangInput('');
    }
  };

  const addSchedule = () => {
    setProfile(p => ({ ...p, schedule: [...p.schedule, { day: 'Monday', startTime: '09:00', endTime: '12:00' }] }));
  };

  const updateSchedule = (i: number, field: keyof ScheduleEntry, value: string) => {
    setProfile(p => ({
      ...p,
      schedule: p.schedule.map((s, idx) => idx === i ? { ...s, [field]: value } : s),
    }));
  };

  const removeSchedule = (i: number) => {
    setProfile(p => ({ ...p, schedule: p.schedule.filter((_, idx) => idx !== i) }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setErrorMessage('');
    try {
      let finalAvatarUrl = profile.avatarUrl;
      let finalIdDocumentUrl = profile.idDocumentUrl || '';
      let idVerified = profile.identityVerified;
      let finalCertificates = [...(profile.certificates || [])];

      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const filePath = `avatar-${user.id}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, {
            cacheControl: '3600',
            upsert: true
          });
        if (uploadError) {
          console.error('Avatar upload error:', uploadError);
          throw new Error(t(`Avatar upload failed: ${uploadError.message}`, `فشل تحميل الصورة الشخصية: ${uploadError.message}`));
        }
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
        finalAvatarUrl = publicUrl;
      }

      if (idFile) {
        const fileExt = idFile.name.split('.').pop();
        const filePath = `id-${user.id}-${Date.now()}.${fileExt}`;
        const { error: idUploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, idFile, {
            cacheControl: '3600',
            upsert: true
          });
        if (idUploadError) {
          console.error('ID upload error:', idUploadError);
          throw new Error(t(`ID document upload failed: ${idUploadError.message}`, `فشل تحميل وثيقة الهوية: ${idUploadError.message}`));
        }
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
        finalIdDocumentUrl = publicUrl;
        idVerified = true;
      }

      if (certFiles.length > 0) {
        finalCertificates = finalCertificates.filter(c => !certFiles.some(f => f.name === c));
        for (const file of certFiles) {
          const fileExt = file.name.split('.').pop();
          const filePath = `cert-${user.id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
          const { error: certUploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: true
            });
          if (certUploadError) {
            console.error('Cert upload error:', certUploadError);
            throw new Error(t(`Certificate upload failed: ${certUploadError.message}`, `فشل تحميل الشهادة: ${certUploadError.message}`));
          }
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
          finalCertificates.push(`${file.name}|${publicUrl}`);
        }
      }

      await onComplete({
        ...profile,
        avatarUrl: finalAvatarUrl || avatarPreview || profile.avatarUrl,
        idDocumentUrl: finalIdDocumentUrl,
        identityVerified: idVerified,
        certificates: finalCertificates
      });
    } catch (err: any) {
      console.error('Registration submission error:', err);
      setErrorMessage(err.message || t('Registration submission failed. Please try again.', 'فشل تقديم طلب التسجيل. يرجى المحاولة مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  };

  const filteredSubjects = ALL_SUBJECTS.filter(s =>
    s.toLowerCase().includes(subjectSearch.toLowerCase()) && !profile.subjects.includes(s)
  );

  const canNext = () => {
    if (step === 0) return profile.name.trim() && profile.bio.trim() && profile.category && (avatarPreview || profile.avatarUrl);
    if (step === 1) return profile.subjects.length > 0 && profile.hourlyRate > 0;
    if (step === 2) return profile.schedule.length > 0;
    return true;
  };

  return (
    <div className="min-h-[100dvh] w-full tm-app-shell bg-white flex flex-col overflow-x-hidden">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="font-bold text-gray-900">Tutor Registration</h1>
          <p className="text-xs text-gray-500">Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}</p>
        </div>
      </div>

      <div className="h-1 bg-gray-100">
        <div
          className="h-1 bg-blue-600 transition-all duration-500"
          style={{ width: `${((step + 1) / STEP_TITLES.length) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 animate-slide-up">
            <Trash2 className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-bold text-red-800 text-xs">{t('Error', 'خطأ')}</h4>
              <p className="text-xs text-red-700 mt-0.5">{errorMessage}</p>
            </div>
            <button onClick={() => setErrorMessage('')} className="text-red-400 hover:text-red-600 font-bold text-sm">✕</button>
          </div>
        )}
        {step === 0 && (
          <div className="animate-slide-up space-y-4">
            <div className="bg-blue-50 rounded-2xl p-4 flex items-start gap-3">
              <BookOpen className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700">Fill in your profile details. Students will see this information when choosing their tutor.</p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-semibold text-gray-700 mb-3">{t('Profile Photo *', 'الصورة الشخصية *', 'Photo de profil *')}</label>
              <div className="flex items-center gap-4">
                {avatarPreview || profile.avatarUrl ? (
                  <img
                    src={avatarPreview || profile.avatarUrl}
                    alt="Preview"
                    className="w-20 h-20 rounded-2xl object-cover shadow-lg border border-slate-100"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                    {profile.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 border-2 border-dashed border-blue-200 rounded-xl text-sm text-blue-600 font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 touch-press"
                  >
                    <Upload className="w-4 h-4" />
                    {avatarPreview || profile.avatarUrl ? t('Change Photo', 'تغيير الصورة', 'Changer la photo') : t('Upload Photo', 'رفع صورة', 'Télécharger la photo')}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('Full Name (English) *', 'الاسم الكامل (بالإنجليزية) *', 'Nom complet (Anglais) *')}
                </label>
                <input
                  value={profile.name}
                  onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                  placeholder="Dr. John Smith"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all font-outfit"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('Full Name (Arabic) — اللغة العربية', 'الاسم الكامل (بالعربية) *', 'Nom complet (Arabe) *')}
                </label>
                <input
                  value={profile.nameAr}
                  onChange={e => setProfile(p => ({ ...p, nameAr: e.target.value }))}
                  placeholder="د. جون سميث"
                  dir="rtl"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all font-cairo"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('Category *', 'التخصص / الفئة *', 'Catégorie *')}
                </label>
                <select
                  value={profile.category}
                  onChange={e => setProfile(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all bg-white"
                >
                  <option value="">{t('Select a category...', 'اختر التخصص...', 'Sélectionnez une catégorie...')}</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('Bio / Introduction (English) *', 'السيرة الذاتية / التعريف (بالإنجليزية) *', 'Bio / Présentation (Anglais) *')}
                </label>
                <textarea
                  value={profile.bio}
                  onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                  placeholder={t(
                    'Tell students about your background, teaching style, and achievements...',
                    'عرّف الطلاب بخلفيتك التعليمية وأسلوبك التدريسي وإنجازاتك...',
                    'Parlez aux étudiants de votre parcours, style d\'enseignement...'
                  )}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all resize-none font-outfit"
                />
                <p className="text-xs text-gray-400 mt-1">{profile.bio.length}/500 {t('characters', 'حرف', 'caractères')}</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('Bio (Arabic) — السيرة الذاتية', 'السيرة الذاتية / التعريف (بالعربية) *', 'Bio / Présentation (Arabe) *')}
                </label>
                <textarea
                  value={profile.bioAr}
                  onChange={e => setProfile(p => ({ ...p, bioAr: e.target.value }))}
                  placeholder="عرّف بنفسك للطلاب..."
                  rows={3}
                  dir="rtl"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all resize-none font-cairo"
                />
              </div>
            </div>
          </div>
        )}
 
        {step === 1 && (
          <div className="animate-slide-up space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {t('Your Subjects *', 'المواد الدراسية التي تدرسها *', 'Vos matières *')}
              </label>
              <p className="text-xs text-gray-400 mb-3">
                {t(
                  'Type any subject you can teach and press Enter or the + button to add it',
                  'اكتب أي مادة دراسية تدرسها واضغط Enter أو زر + لإضافتها',
                  'Saisissez une matière et appuyez sur Entrée ou le bouton +'
                )}
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  value={subjectSearch}
                  onChange={e => setSubjectSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && subjectSearch.trim()) {
                      e.preventDefault();
                      addSubject(subjectSearch.trim());
                      setSubjectSearch('');
                    }
                  }}
                  placeholder={t('e.g. Mathematics, Python...', 'مثال: الرياضيات، بايثون...', 'ex: Mathématiques, Python...')}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all font-outfit"
                />
                <button
                  onClick={() => {
                    if (subjectSearch.trim()) {
                      addSubject(subjectSearch.trim());
                      setSubjectSearch('');
                    }
                  }}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-1 text-sm font-semibold touch-press"
                >
                  <Plus className="w-4 h-4" />
                  {t('Add', 'إضافة', 'Ajouter')}
                </button>
              </div>
              {profile.subjects.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {profile.subjects.map(s => (
                    <span key={s} className="flex items-center gap-1.5 bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full">
                      {s}
                      <button onClick={() => removeSubject(s)} className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"><Trash2 className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              {subjectSearch && filteredSubjects.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">{t('Suggestions:', 'الاقتراحات:', 'Suggestions :')}</p>
                  <div className="max-h-36 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2">
                    {filteredSubjects.slice(0, 8).map(s => (
                      <button
                        key={s}
                        onClick={() => { addSubject(s); setSubjectSearch(''); }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
 
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t('Hourly Rate (DZD) *', 'سعر الساعة (بالدينار الجزائري) *', 'Tarif horaire (DZD) *')}
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">{CURRENCY_CODE}</span>
                <input
                  type="number"
                  min="500"
                  max="10000"
                  value={profile.hourlyRate}
                  onChange={e => setProfile(p => ({ ...p, hourlyRate: parseInt(e.target.value) || 0 }))}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all font-outfit"
                />
              </div>
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {[1000, 1500, 2000, 2500, 3000].map(rate => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setProfile(p => ({ ...p, hourlyRate: rate }))}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex-shrink-0 ${
                      profile.hourlyRate === rate
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-200 text-gray-600 hover:border-blue-300'
                    }`}
                  >${rate}</button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
                            <div className="flex gap-2">
                <input
                  value={langInput}
                  onChange={e => setLangInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addLanguage()}
                  placeholder={t('Add language...', 'إضافة لغة...', 'Ajouter une langue...')}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all font-outfit"
                />
                <button
                  onClick={addLanguage}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors touch-press font-semibold"
                >
                  {t('Add', 'إضافة', 'Ajouter')}
                </button>
              </div>
            </div>
          </div>
        )}
 
        {step === 2 && (
          <div className="animate-slide-up space-y-4">
            <div className="bg-blue-50 rounded-2xl p-4 flex items-start gap-3 text-left">
              <Clock className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                {t(
                  'Set your weekly availability. Students will book sessions based on your schedule.',
                  'حدد جدول عملك الأسبوعي. سيقوم الطلاب بحجز الحصص بناءً على جدولك.',
                  'Définissez votre disponibilité hebdomadaire. Les étudiants réserveront en fonction.'
                )}
              </p>
            </div>
 
            {profile.schedule.map((slot, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-slide-up">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-800 text-sm">{t('Slot', 'الفترة', 'Créneau')} {i + 1}</h4>
                  <button
                    onClick={() => removeSchedule(i)}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-left">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('Day', 'اليوم', 'Jour')}</label>
                    <select
                      value={slot.day}
                      onChange={e => updateSchedule(i, 'day', e.target.value)}
                      className="w-full px-2 py-2 rounded-lg border border-gray-200 text-xs focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all bg-white"
                    >
                      {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('Start', 'البداية', 'Début')}</label>
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={e => updateSchedule(i, 'startTime', e.target.value)}
                      className="w-full px-2 py-2 rounded-lg border border-gray-200 text-xs focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('End', 'النهاية', 'Fin')}</label>
                    <input
                      type="time"
                      value={slot.endTime}
                      onChange={e => updateSchedule(i, 'endTime', e.target.value)}
                      className="w-full px-2 py-2 rounded-lg border border-gray-200 text-xs focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                    />
                  </div>
                </div>
              </div>
            ))}
 
            <button
              onClick={addSchedule}
              className="w-full py-3 border-2 border-dashed border-blue-200 rounded-2xl text-sm text-blue-600 font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 touch-press"
            >
              <Plus className="w-4 h-4" />
              {t('Add Time Slot', 'إضافة فترة زمنية', 'Ajouter un créneau')}
            </button>
 
            {profile.schedule.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">{t('No schedule added yet', 'لم يتم إضافة جدول عمل بعد', 'Aucun planning ajouté')}</p>
                <p className="text-xs mt-1">{t('Add at least one available time slot', 'أضف فترة عمل واحدة متاحة على الأقل', 'Ajoutez au moins un créneau disponible')}</p>
              </div>
            )}
          </div>
        )}
 
        {step === 3 && (
          <div className="animate-slide-up space-y-4">
            <div className="bg-indigo-50 rounded-2xl p-4 flex items-start gap-3 text-left">
              <Video className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-indigo-700">
                {t(
                  'Add a short introduction video (60–120 seconds) to help students connect with you. Tutors with videos get 3x more bookings!',
                  'أضف فيديو تعريفي قصير (60-120 ثانية) لمساعدة الطلاب في التعرف عليك. المعلمون الذين لديهم فيديو يحصلون على حجوزات أكثر بثلاثة أضعاف!',
                  'Ajoutez une courte vidéo de présentation (60-120s) pour vous faire connaître. Les tuteurs avec vidéos reçoivent 3x plus de réservations!'
                )}
              </p>
            </div>
 
            <div className="bg-white rounded-2xl p-4 shadow-sm text-left">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                {t('YouTube / Vimeo Video URL', 'رابط فيديو تعريفي من يوتيوب / فيميو', 'URL de la vidéo YouTube / Vimeo')}
              </label>
              <input
                value={profile.videoUrl}
                onChange={e => setProfile(p => ({ ...p, videoUrl: e.target.value }))}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all font-outfit"
              />
            </div>
 
            {profile.videoUrl ? (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="aspect-video bg-gray-900 flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50" />
                  <div className="relative text-center text-white">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse-ring">
                      <div className="w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[18px] border-l-white ml-1" />
                    </div>
                    <p className="text-sm font-medium">{t('Video Preview', 'معاينة الفيديو', 'Aperçu de la vidéo')}</p>
                    <p className="text-xs text-white/60 mt-1">{profile.videoUrl.slice(0, 40)}...</p>
                  </div>
                </div>
                <div className="p-3 bg-green-50 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-green-700 font-medium">{t('Video URL added successfully', 'تم إضافة رابط الفيديو بنجاح', 'URL de la vidéo ajoutée avec succès')}</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-8 shadow-sm text-center border-2 border-dashed border-gray-200">
                <Video className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">{t('No video added', 'لم يتم إضافة فيديو بعد', 'Aucune vidéo ajoutée')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('Optional but highly recommended', 'اختياري ولكن موصى به للغاية', 'Optionnel mais fortement recommandé')}</p>
              </div>
            )}
 
            <div className="bg-amber-50 rounded-2xl p-4 text-left">
              <h4 className="text-sm font-semibold text-amber-800 mb-2">{t('📹 Video Tips', '📹 نصائح لتصوير الفيديو', '📹 Conseils pour la vidéo')}</h4>
              <ul className="text-xs text-amber-700 space-y-1.5">
                <li>• Show your enthusiasm for the subject</li>
                <li>• Keep it between 60–120 seconds</li>
              </ul>
            </div>
          </div>
        )}
 
        {step === 4 && profile.meetingSettings && (
          <div className="animate-slide-up space-y-4 text-left">
            <div className="bg-blue-50 rounded-2xl p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                {t(
                  'Configure meeting preferences for Jitsi Meet classrooms.',
                  'تكوين تفضيلات الاجتماع للفصول الدراسية Jitsi Meet.',
                  'Configurez vos préférences de réunion pour la classe Jitsi Meet.'
                )}
              </p>
            </div>
 
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-3">
                {t('Classroom Preferences', 'تفضيلات الفصل الدراسي', 'Préférences de la classe')}
              </h3>
 
              {[
                {
                  key: 'muteOnJoin',
                  title: t('Mute on Join', 'كتم الصوت عند الانضمام', 'Couper le micro à l\'entrée'),
                  desc: t('Automatically mute participants microphone when they join the call.', 'كتم ميكروفون المشاركين تلقائياً عند انضمامهم.', 'Couper le micro des participants lorsqu\'ils rejoignent.')
                },
                {
                  key: 'videoOnJoin',
                  title: t('Start with Video Muted', 'بدء الفيديو مكتوماً', 'Démarrer avec la caméra désactivée'),
                  desc: t('Automatically disable cameras when joining the classroom.', 'تعطيل الكاميرات تلقائياً عند دخول الفصل الدراسي.', 'Désactiver les caméras à l\'entrée de la classe.')
                },
                {
                  key: 'waitingRoom',
                  title: t('Enable Waiting Room/Lobby', 'تمكين غرفة الانتظار / اللوبي', 'Activer la salle d\'attente'),
                  desc: t('Students must wait for you to admit them into the meeting room.', 'يجب على الطلاب انتظار قبولك لهم لدخول غرفة الاجتماع.', 'Les étudiants doivent attendre votre admission pour entrer.')
                },
                {
                  key: 'allowChat',
                  title: t('Allow Chat Messaging', 'السماح بالمراسلة والدردشة', 'Autoriser le chat'),
                  desc: t('Enable text-based chat inside the virtual meeting room.', 'تمكين الدردشة النصية داخل غرفة الاجتماع الافتراضية.', 'Autoriser le chat écrit dans la salle virtuelle.')
                },
                {
                  key: 'allowScreenShare',
                  title: t('Allow Screen Sharing', 'السماح بمشاركة الشاشة', 'Autoriser le partage d\'écran'),
                  desc: t('Allow students to present or share their screens.', 'السماح للطلاب بعرض أو مشاركة شاشاتهم.', 'Permettre aux étudiants de partager leur écran.')
                }
              ].map(item => (
                <div key={item.key} className="flex items-start justify-between gap-4 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">{item.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={(profile.meetingSettings as any)[item.key]}
                    onChange={e => setProfile(p => ({
                      ...p,
                      meetingSettings: {
                        ...p.meetingSettings!,
                        [item.key]: e.target.checked
                      }
                    }))}
                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
 
        {step === 5 && (
          <div className="animate-slide-up space-y-4">
            <div className="bg-blue-50 rounded-2xl p-4 flex items-start gap-3 text-left">
              <Upload className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                {t(
                  'Submit your verification documents to help speed up your application approval.',
                  'يرجى تقديم وثائق التحقق والمستندات للمساعدة في تسريع عملية مراجعة وتفعيل حسابك.',
                  'Veuillez soumettre vos documents de vérification pour accélérer l\'approbation.'
                )}
              </p>
            </div>
 
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4 text-left">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('Professional Certificates (Optional)', 'الشهادات المهنية (اختياري)', 'Certificats professionnels (Optionnel)')}
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="e.g. TEFL, Math Degree..."
                    value={certInput}
                    onChange={e => setCertInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && certInput.trim()) {
                        e.preventDefault();
                        setProfile(p => ({ ...p, certificates: [...(p.certificates || []), certInput.trim()] }));
                        setCertInput('');
                      }
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all font-outfit"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (certInput.trim()) {
                        setProfile(p => ({ ...p, certificates: [...(p.certificates || []), certInput.trim()] }));
                        setCertInput('');
                      }
                    }}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors touch-press font-semibold"
                  >
                    {t('Add Text', 'إضافة نص', 'Ajouter')}
                  </button>
                </div>
                <input
                  type="file"
                  ref={certFileInputRef}
                  onChange={handleCertFileChange}
                  className="hidden"
                  accept="image/*,application/pdf"
                />
                <button
                  type="button"
                  onClick={() => certFileInputRef.current?.click()}
                  className="w-full py-2.5 border border-dashed border-indigo-200 rounded-xl text-xs text-indigo-600 font-semibold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 touch-press"
                >
                  <Upload className="w-4 h-4" />
                  {t('Attach Certificate File', 'إرفاق ملف شهادة', 'Joindre un fichier de certificat')}
                </button>
 
                {profile.certificates && profile.certificates.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {profile.certificates.map(c => (
                      <span key={c} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1.5 rounded-full">
                        {c.includes('|') ? c.split('|')[0] : c}
                        <button
                          type="button"
                          onClick={() => {
                            setProfile(p => ({ ...p, certificates: (p.certificates || []).filter(x => x !== c) }));
                            setCertFiles(prev => prev.filter(f => f.name !== c));
                          }}
                          className="hover:bg-blue-100 rounded-full p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
 
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3 text-left">
              <label className="block text-sm font-semibold text-gray-700">
                {t('Identity Verification (Optional)', 'التحقق من الهوية (اختياري)', 'Vérification d\'identité (Optionnel)')}
              </label>
              <p className="text-xs text-gray-400">
                {t(
                  'Confirm your identity by uploading a government-issued ID (Passport, National Card).',
                  'قم بتأكيد هويتك عن طريق تحميل بطاقة الهوية الصادرة عن الحكومة (جواز السفر، البطاقة الوطنية).',
                  'Confirmez votre identité en téléchargeant une pièce d\'identité (Passeport, Carte Nationale).'
                )}
              </p>
              
              <input
                type="file"
                ref={idFileInputRef}
                onChange={handleIdFileChange}
                className="hidden"
                accept="image/*,application/pdf"
              />
 
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500 font-semibold mb-2">
                  {idFile ? `${t('Selected file:', 'الملف المختار:')} ${idFile.name}` : profile.identityVerified ? t('ID Document Attached ✓', 'تم إرفاق مستند الهوية ✓', 'Identité attachée ✓') : t('No file selected', 'لم يتم اختيار ملف', 'Aucun fichier sélectionné')}
                </p>
                <button
                  type="button"
                  onClick={() => idFileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors touch-press"
                >
                  {t('Upload ID Document', 'تحميل وثيقة الهوية', 'Télécharger la pièce d\'identité')}
                </button>
              </div>
            </div>
          </div>
        )}
 
        {step === 6 && (
          <div className="animate-slide-up space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="flex items-start gap-4">
                {avatarPreview || profile.avatarUrl ? (
                  <img
                    src={avatarPreview || profile.avatarUrl}
                    alt={profile.name}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-100 shadow flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow flex-shrink-0">
                    {profile.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-gray-900">{profile.name}</h3>
                  {profile.nameAr && <p className="text-sm text-gray-500 font-cairo">{profile.nameAr}</p>}
                  <p className="text-blue-600 text-xs font-medium mt-1">{profile.category}</p>
                  <p className="text-green-600 font-bold text-lg mt-1">${profile.hourlyRate}<span className="text-gray-400 text-xs font-normal">/hr</span></p>
                </div>
              </div>
              {profile.bio && <p className="text-sm text-gray-600 mt-4 leading-relaxed">{profile.bio}</p>}
            </div>
 
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <h4 className="font-semibold text-gray-800 text-sm mb-3">Subjects ({profile.subjects.length})</h4>
              <div className="flex flex-wrap gap-2">
                {profile.subjects.map(s => (
                  <span key={s} className="bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full">{s}</span>
                ))}
              </div>
            </div>
 
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <h4 className="font-semibold text-gray-800 text-sm mb-3">Languages</h4>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map(l => (
                  <span key={l} className="bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full">{l}</span>
                ))}
              </div>
            </div>
 
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <h4 className="font-semibold text-gray-800 text-sm mb-3">Schedule ({profile.schedule.length} slots)</h4>
              <div className="space-y-2">
                {profile.schedule.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{s.day}</span>
                    <span className="text-gray-500">{s.startTime} – {s.endTime}</span>
                  </div>
                ))}
              </div>
            </div>
 
            {profile.meetingSettings && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h4 className="font-semibold text-gray-800 text-sm mb-3">Meeting Settings</h4>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>• Mute Microphone on Join: {profile.meetingSettings.muteOnJoin ? 'Yes' : 'No'}</li>
                  <li>• Video Muted on Join: {profile.meetingSettings.videoOnJoin ? 'Yes' : 'No'}</li>
                  <li>• Lobby/Waiting Room: {profile.meetingSettings.waitingRoom ? 'Enabled' : 'Disabled'}</li>
                  <li>• Allow Text Chat: {profile.meetingSettings.allowChat ? 'Yes' : 'No'}</li>
                  <li>• Allow Screen Sharing: {profile.meetingSettings.allowScreenShare ? 'Yes' : 'No'}</li>
                </ul>
              </div>
            )}
 
            {profile.certificates && profile.certificates.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h4 className="font-semibold text-gray-800 text-sm mb-3">Certificates ({profile.certificates.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {profile.certificates.map(c => (
                    <span key={c} className="bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded-full">{c}</span>
                  ))}
                </div>
              </div>
            )}
 
            {profile.identityVerified && (
              <div className="bg-green-50 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Identity Verified ✓</p>
                  <p className="text-xs text-green-600 mt-0.5">Mock ID successfully attached.</p>
                </div>
              </div>
            )}
            
            {profile.videoUrl && (
              <div className="bg-green-50 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Intro Video Added ✓</p>
                  <p className="text-xs text-green-600 mt-0.5">Your profile will stand out!</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
 
      <div className="bg-white border-t border-gray-100 p-4 flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
        )}
        {step < STEP_TITLES.length - 1 ? (
          <button
            onClick={() => { if (canNext()) setStep(s => s + 1); }}
            disabled={!canNext()}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
              canNext()
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            Continue →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-3 bg-green-500 text-white rounded-xl font-semibold text-sm hover:bg-green-600 shadow-lg shadow-green-200 flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('Submitting...', 'جاري التقديم...', 'Envoi en cours...')}</> : t('Complete Registration', 'إكمال التسجيل', 'Terminer l\'inscription')}
          </button>
        )}
      </div>
    </div>
  );
}