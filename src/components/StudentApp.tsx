import React, { useEffect, useState } from 'react';
import {
  BookOpen, Search, Bell, User, ChevronRight, Star, Clock,
  MessageSquare, Calendar, TrendingUp, LogOut, Video,
  ArrowLeft, Globe, CheckCircle, Send, KeyRound,
  Award, Zap, X, Heart, Users, Shield, BookMarked, Mail,
  GraduationCap, Palette, FlaskConical, Music, Briefcase, HeartPulse, Target,
  Flame, Trophy, Lightbulb, Languages, Moon, Sun, CalendarClock, MessageCircle,
  PartyPopper, CircleCheck, CreditCard, Wallet, Apple
} from 'lucide-react';
import { categories, subjects, tutors, getSubjectsByCategory, getLevelsBySubject, type Category, type Subject, type Level, type Tutor } from '../lib/db';
import MultiSlotCalendar, { dayToNumber } from './booking/MultiSlotCalendar';
import TutorVideoIntro from './TutorVideoIntro';
import PackagesScreen from './PackagesScreen';
import CreditBadge from './CreditBadge';
import CreditHistoryScreen from './CreditHistoryScreen';
import JoinSessionButton from './JoinSessionButton';
import LiveMeetingRoom from './LiveMeetingRoom';
import { addSessionsRemote, useBookedSessions, convertDbTimeToFrontend, type BookedSession, type SelectedSlot } from '../lib/bookingsStore';
import { supabase } from '../lib/supabase';
import {
  getOrCreateConversation,
  fetchMessages,
  sendChatMessage,
  markMessagesAsRead,
  subscribeToConversationMessages,
  type DBMessage
} from '../lib/messagingService';

interface StudentAppProps {
  user: { name: string; email: string; id: string };
  onLogout: () => void;
  language: 'en' | 'ar' | 'fr';
  onChangeLanguage: (lang: 'en' | 'ar' | 'fr') => void;
  onOpenSetPassword?: () => void;
}

type Screen =
  | 'home'
  | 'categories'
  | 'subjects'
  | 'levels'
  | 'tutors'
  | 'tutor-profile'
  | 'booking'
  | 'payment'
  | 'success'
  | 'chat'
  | 'dashboard'
  | 'schedule'
  | 'packages'
  | 'credit-history'
  | 'meeting';

type FilterType = 'Top Rated' | 'Price' | 'Experience';

const AVATAR_COLORS = [
  'from-blue-400 to-indigo-500',
  'from-purple-400 to-pink-500',
  'from-green-400 to-teal-500',
  'from-orange-400 to-red-500',
  'from-yellow-400 to-orange-500',
];

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  school: GraduationCap,
  university: BookOpen,
  digital: Palette,
  technology: TrendingUp,
  languages: Globe,
  personal: Target,
  science: FlaskConical,
  arts: Music,
  business: Briefcase,
  health: HeartPulse,
};

export default function StudentApp({ user, onLogout, language, onChangeLanguage, onOpenSetPassword }: StudentAppProps) {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);
  const [selectedTutor, setSelectedTutor] = useState<Tutor | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('Top Rated');
  const [searchQuery, setSearchQuery] = useState('');
  const [tutorsList, setTutorsList] = useState<Tutor[]>([]);
  const [tutorSchedule, setTutorSchedule] = useState<any[]>([]);
  const [tutorBookedSessions, setTutorBookedSessions] = useState<any[]>([]);
  const [liveRoomId, setLiveRoomId] = useState<string | null>(null);

  const [studentName, setStudentName] = useState(user.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);

  const saveProfileName = async () => {
    if (!editedName.trim()) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: editedName.trim() })
        .eq('user_id', user.id);
      if (error) throw error;
      setStudentName(editedName.trim());
      setIsEditingName(false);
    } catch (err: any) {
      alert(err.message || 'Error updating profile');
    } finally {
      setSavingName(false);
    }
  };

  const parseSubjects = (raw: any): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        } catch (_) {}
      }
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  const fetchApprovedTutors = () => {
    supabase
      .from('tutors')
      .select('*')
      .eq('status', 'approved')
      .then(({ data, error }) => {
        if (data && !error) {
          const mapped: Tutor[] = data.map(t => ({
            id: t.id,
            user_id: t.user_id,
            name: t.name,
            nameAr: t.name_ar || t.name,
            bio: t.bio || '',
            bioAr: t.bio_ar || t.bio || '',
            subjects: parseSubjects(t.subjects),
            hourlyRate: Number(t.hourly_rate || 2500),
            rating: Number(t.rating || 5.0),
            reviewCount: t.review_count || 1,
            experienceYears: t.experience_years || 5,
            languages: parseSubjects(t.languages).length > 0 ? parseSubjects(t.languages) : ['Arabic'],
            avatarUrl: t.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
            videoUrl: t.video_url || undefined,
            isOnline: t.is_online ?? true,
            responseTime: t.response_time || '< 15 mins',
            isVerified: t.is_verified ?? true,
            category: t.category || '',
            levelId: 'elementary-grade-5',
            schedule: []
          }));

          const dbIds = new Set(mapped.map(m => m.id));
          const combined = [...mapped, ...tutors.filter(st => !dbIds.has(st.id))];
          setTutorsList(combined);
        }
      });
  };

  useEffect(() => {
    fetchApprovedTutors();

    const channel = supabase
      .channel('realtime-tutors-approval')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tutors' },
        () => {
          fetchApprovedTutors();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (screen === 'tutors' || screen === 'home') {
      fetchApprovedTutors();
    }
  }, [screen]);

  useEffect(() => {
    if (!selectedTutor) return;
    
    supabase
      .from('schedules')
      .select('*')
      .eq('tutor_id', selectedTutor.id)
      .then(({ data }) => {
        if (data) {
          const mapped = data.map(s => ({
            id: s.id,
            tutorId: s.tutor_id,
            dayOfWeek: s.day_of_week,
            startTime: s.start_time,
            endTime: s.end_time,
            isAvailable: s.is_available
          }));
          setTutorSchedule(mapped);
        }
      });

    supabase
      .from('sessions')
      .select('*')
      .eq('tutor_id', selectedTutor.id)
      .eq('status', 'confirmed')
      .then(({ data }) => {
        if (data) {
          const mapped = data.map(s => ({
            id: s.id,
            tutorId: s.tutor_id,
            date: s.date,
            startTime: convertDbTimeToFrontend(s.start_time),
            endTime: convertDbTimeToFrontend(s.end_time),
            status: s.status
          }));
          setTutorBookedSessions(mapped);
        }
      });
  }, [selectedTutor]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [realMessages, setRealMessages] = useState<DBMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    if (screen !== 'chat' || !selectedTutor || !user?.id) return;

    let unsub: (() => void) | null = null;

    const setupChat = async () => {
      let tutorUserId = selectedTutor.user_id;
      if (!tutorUserId) {
        const { data: tData } = await supabase
          .from('tutors')
          .select('user_id')
          .eq('id', selectedTutor.id)
          .maybeSingle();
        tutorUserId = tData?.user_id;
      }
      const targetUserId = tutorUserId || selectedTutor.id;
      if (!targetUserId) return;

      const convId = await getOrCreateConversation(user.id, targetUserId);
      if (convId) {
        setActiveConversationId(convId);
        const msgs = await fetchMessages(convId);
        setRealMessages(msgs);
        await markMessagesAsRead(convId, user.id);

        unsub = subscribeToConversationMessages(convId, (newMsg) => {
          setRealMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          markMessagesAsRead(convId, user.id);
        });
      }
    };

    setupChat();

    return () => {
      if (unsub) unsub();
    };
  }, [screen, selectedTutor?.id, user?.id]);
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [lastBooking, setLastBooking] = useState<BookedSession[]>([]);
  const bookedSessions = useBookedSessions();
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'paypal' | 'apple'>('card');
  const [activeNav, setActiveNav] = useState<'home' | 'dashboard' | 'schedule' | 'profile'>('home');
  const [activeCategoryCard, setActiveCategoryCard] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [readNotifications, setReadNotifications] = useState<number[]>([]);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('tm_theme') as 'light' | 'dark') || 'light'
  );
  const [reviewsBySession, setReviewsBySession] = useState<Record<string, { rating: number; message: string }>>(() => {
    try {
      return JSON.parse(localStorage.getItem('tm_session_reviews') || '{}');
    } catch {
      return {};
    }
  });
  const [reviewTarget, setReviewTarget] = useState<null | {
    id: string;
    tutor: string;
    subject: string;
    date: string;
  }>(null);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewMessage, setReviewMessage] = useState('');

  const t = (en: string, ar: string, fr?: string) => (language === 'ar' ? ar : (language === 'fr' ? (fr || en) : en));

  const formatCurrency = (val: number) => {
    const amountDzd = val > 200 ? Math.round(val) : Math.round(val * 200);
    return `${amountDzd.toLocaleString()} ${t('DZD', 'د.ج', 'DA')}`;
  };


  const completedSessionsCount = bookedSessions.filter(s => s.status === 'completed').length;
  const hoursLearned = completedSessionsCount;
  
  const calculateStreak = () => {
    const dates = bookedSessions
      .filter(s => s.status === 'completed')
      .map(s => s.date)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    if (dates.length === 0) return 0;
    
    let streak = 0;
    let today = new Date();
    today.setHours(0,0,0,0);
    
    let lastDate = new Date(dates[0]);
    lastDate.setHours(0,0,0,0);
    
    const diffTime = Math.abs(today.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 1) {
      streak = 1;
      let prevDate = lastDate;
      for (let i = 1; i < dates.length; i++) {
        const d = new Date(dates[i]);
        d.setHours(0,0,0,0);
        const diff = Math.abs(prevDate.getTime() - d.getTime());
        const diffD = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (diffD === 1) {
          streak++;
          prevDate = d;
        } else if (diffD > 1) {
          break;
        }
      }
    }
    return streak;
  };
  const streakDays = calculateStreak();
  const certificatesCount = Math.floor(completedSessionsCount / 10);

  const getProgressBySubject = () => {
    const completed = bookedSessions.filter(s => s.status === 'completed');
    if (completed.length === 0) return [];
    
    const subjectCounts = completed.reduce((acc: Record<string, number>, curr) => {
      acc[curr.subject] = (acc[curr.subject] || 0) + 1;
      return acc;
    }, {});
    
    return Object.entries(subjectCounts).map(([subject, count]) => {
      const progress = Math.min(Math.round((count / 10) * 100), 100);
      return { subject, progress };
    });
  };
  const subjectProgressList = getProgressBySubject();

  const achievements = [
    { icon: Flame, label: t('Week Streak', 'سلسلة يومية', 'Série de jours'), earned: streakDays > 0 },
    { icon: Star, label: t('Top Student', 'طالب متميز', 'Élève modèle'), earned: completedSessionsCount > 10 },
    { icon: BookOpen, label: t('10 Sessions', '10 حصص', '10 Sessions'), earned: completedSessionsCount >= 10 },
    { icon: Trophy, label: t('Math Ace', 'بطل الرياضيات', 'As des maths'), earned: bookedSessions.filter(s => s.status === 'completed' && s.subject.toLowerCase().includes('math')).length > 0 },
    { icon: Globe, label: t('Polyglot', 'متعدد اللغات', 'Polyglotte'), earned: bookedSessions.filter(s => s.status === 'completed' && s.subject.toLowerCase().includes('lang')).length > 0 },
    { icon: Lightbulb, label: t('Quick Learner', 'سريع التعلم', 'Apprenant rapide'), earned: completedSessionsCount > 0 },
  ];

  const isSubjectMatch = (tutorSubject: string, targetSubject: Subject): boolean => {
    if (!tutorSubject || !targetSubject) return false;
    const s = tutorSubject.trim().toLowerCase();
    const subName = targetSubject.name.trim().toLowerCase();
    const subNameAr = targetSubject.nameAr ? targetSubject.nameAr.trim().toLowerCase() : '';

    const cleanS = s.replace(/language|لغة|اللغة/gi, '').replace(/[أإآ]/g, 'ا').trim();
    const cleanSubName = subName.replace(/language/gi, '').trim();
    const cleanSubNameAr = subNameAr.replace(/لغة|اللغة/gi, '').replace(/[أإآ]/g, 'ا').trim();

    return (
      s === subName ||
      s === subNameAr ||
      s.includes(subName) ||
      subName.includes(s) ||
      (subNameAr !== '' && (s.includes(subNameAr) || subNameAr.includes(s))) ||
      (cleanS.length >= 3 && (cleanSubName.includes(cleanS) || cleanS.includes(cleanSubName))) ||
      (cleanS.length >= 3 && cleanSubNameAr.length >= 3 && (cleanSubNameAr.includes(cleanS) || cleanS.includes(cleanSubNameAr)))
    );
  };

  const getSubjectTutorCount = (sub: Subject): number => {
    return tutorsList.filter(t => (t.subjects || []).some(ts => isSubjectMatch(ts, sub))).length;
  };

  const getSubjectMinPrice = (sub: Subject): number => {
    const matched = tutorsList.filter(t => (t.subjects || []).some(ts => isSubjectMatch(ts, sub)));
    if (matched.length === 0) return sub.minPrice || 15;
    return Math.min(...matched.map(t => t.hourlyRate));
  };

  const getLevelTutorCount = (_level: Level): number => {
    if (selectedSubject) {
      return tutorsList.filter(t => (t.subjects || []).some(ts => isSubjectMatch(ts, selectedSubject))).length;
    }
    return 0;
  };

  const getLevelPrice = (level: Level): number => {
    if (selectedSubject) {
      const matched = tutorsList.filter(t => (t.subjects || []).some(ts => isSubjectMatch(ts, selectedSubject)));
      if (matched.length > 0) {
        return Math.min(...matched.map(t => t.hourlyRate));
      }
    }
    return level.price;
  };

  useEffect(() => {
    localStorage.setItem('tm_theme', themeMode);
    document.body.classList.toggle('theme-dark', themeMode === 'dark');
  }, [themeMode]);

  const nav = (s: Screen) => setScreen(s);

  const confirmBooking = async () => {
    if (!selectedTutor || selectedSlots.length === 0) return;
    const subjectName = selectedLevel
      ? (language === 'en' ? selectedLevel.name : selectedLevel.nameAr)
      : (selectedTutor.subjects[0] || t('Private lesson', 'حصة خصوصية'));
    
    const result = await addSessionsRemote(selectedTutor.id, subjectName, selectedSlots);
    if (!result.ok) {
      setBookingError(t(
        `Schedule conflict or insufficient credits. Please review your balance and booking slots.`,
        `تعارض في المواعيد أو رصيد غير كافٍ. يرجى مراجعة رصيدك والمواعيد المحددة.`
      ));
      nav('booking');
      return;
    }
    setLastBooking(result.sessions);
    setSelectedSlots([]);
    setBookingError(null);
    nav('success');
  };

  const openReview = (session: { id: string; tutor: string; subject: string; date: string; time?: string }) => {
    const existing = reviewsBySession[session.id];
    setReviewTarget(session);
    setReviewStars(existing?.rating || 0);
    setReviewHover(0);
    setReviewMessage(existing?.message || '');
  };

  const submitReview = async () => {
    if (!reviewTarget || reviewStars === 0) return;
    const next = {
      ...reviewsBySession,
      [reviewTarget.id]: {
        rating: reviewStars,
        message: reviewMessage.trim(),
      },
    };
    setReviewsBySession(next);
    localStorage.setItem('tm_session_reviews', JSON.stringify(next));

    const sess = bookedSessions.find(s => s.id === reviewTarget.id);
    const targetName = sess?.tutorName || reviewTarget.tutor;

    if (targetName) {
      try {
        const { data: tutorData } = await supabase
          .from('tutors')
          .select('id, rating, review_count')
          .or(`name.eq."${targetName}",name_ar.eq."${targetName}"`)
          .maybeSingle();

        if (tutorData) {
          const currentRating = Number(tutorData.rating || 4.8);
          const currentCount = Number(tutorData.review_count || 1);
          const newCount = currentCount + 1;
          const newRating = Number(((currentRating * currentCount + reviewStars) / newCount).toFixed(1));

          await supabase
            .from('tutors')
            .update({
              rating: newRating,
              review_count: newCount
            })
            .eq('id', tutorData.id);
        }
      } catch (err) {
        console.error('Error saving review to database:', err);
      }
    }

    setReviewTarget(null);
    setReviewStars(0);
    setReviewHover(0);
    setReviewMessage('');
  };

  const switchTab = (n: 'home' | 'dashboard' | 'schedule' | 'profile') => {
    setActiveNav(n);
    setScreen('home');
    setShowNotifications(false);
    setSelectedSubject(null);
    setSelectedCategory(null);
    setSelectedLevel(null);
  };

  const openCategory = (cat: Category) => {
    setActiveCategoryCard(cat.id);
    setTimeout(() => {
      setSelectedCategory(cat);
      nav('subjects');
    }, 180);
  };

  const getSubjectLevels = (subject: Subject): Level[] => {
    const found = getLevelsBySubject(subject.id);
    if (found.length > 0) return found;
    return [{
      id: `${subject.id}-general`,
      subjectId: subject.id,
      name: subject.name,
      nameAr: subject.nameAr,
      price: subject.minPrice,
      tutorCount: subject.tutorCount,
      isPopular: true,
    }];
  };

  const q = searchQuery.trim().toLowerCase();

  const filteredTutors = (() => {
    const activeList = tutorsList.length > 0 ? tutorsList : tutors;
    let list = activeList.filter(t => {
      const tutorSubjects = parseSubjects(t.subjects);
      const matchesSubject = !selectedSubject || tutorSubjects.some(s => isSubjectMatch(s, selectedSubject));
      const matchesQuery = !q ||
        t.name.toLowerCase().includes(q) ||
        (t.nameAr && t.nameAr.toLowerCase().includes(q)) ||
        tutorSubjects.some(s => s.toLowerCase().includes(q));
      return matchesSubject && matchesQuery;
    });
    if (filterType === 'Price') list = [...list].sort((a, b) => a.hourlyRate - b.hourlyRate);
    if (filterType === 'Experience') list = [...list].sort((a, b) => b.experienceYears - a.experienceYears);
    if (filterType === 'Top Rated') list = [...list].sort((a, b) => b.rating - a.rating);
    return list;
  })();

  const filteredCategories = categories.filter(cat =>
    q && (
      cat.name.toLowerCase().includes(q) ||
      cat.nameAr.toLowerCase().includes(q)
    )
  );

  const filteredSubjects = subjects.filter(subject =>
    q && (
      subject.name.toLowerCase().includes(q) ||
      subject.nameAr.toLowerCase().includes(q)
    )
  );

  const toggleFav = (id: string) =>
    setFavorites(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);

  const sendMessage = async () => {
    if (!chatInput.trim() || !selectedTutor || !user?.id) return;
    const text = chatInput.trim();
    setChatInput('');

    let tutorUserId = selectedTutor.user_id;
    if (!tutorUserId) {
      const { data: tData } = await supabase
        .from('tutors')
        .select('user_id')
        .eq('id', selectedTutor.id)
        .maybeSingle();
      tutorUserId = tData?.user_id;
    }
    const targetReceiverId = tutorUserId || selectedTutor.id;
    if (!targetReceiverId) return;

    const convId = activeConversationId || await getOrCreateConversation(user.id, targetReceiverId);
    if (!convId) return;

    const tempId = `temp-${Date.now()}`;
    const tempMsg: DBMessage = {
      id: tempId,
      conversation_id: convId,
      sender_id: user.id,
      receiver_id: targetReceiverId,
      content: text,
      status: 'sent',
      is_read: false,
      created_at: new Date().toISOString()
    };

    setRealMessages(prev => [...prev, tempMsg]);

    const sent = await sendChatMessage({
      conversationId: convId,
      senderId: user.id,
      receiverId: targetReceiverId,
      content: text
    });

    if (sent) {
      setRealMessages(prev => prev.map(m => m.id === tempId ? sent : m));
    }
  };

  if (activeNav === 'dashboard') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20">
        <h1 className="font-bold text-gray-900">My Dashboard</h1>
        <p className="text-xs text-gray-400 mt-0.5">Track your learning progress</p>
      </div>
      <div className="flex-1 overflow-y-auto pb-20 p-4 space-y-4 animate-slide-up">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: t('Sessions Done', 'الجلسات المكتملة'), value: String(completedSessionsCount), icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: t('Hours Learned', 'ساعات التعلم'), value: `${hoursLearned} hrs`, icon: Clock, color: 'text-green-600', bg: 'bg-green-50' },
            { label: t('Streak', 'السلسلة اليومية'), value: `${streakDays} days`, icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-50' },
            { label: t('Certificates', 'الشهادات'), value: String(certificatesCount), icon: Award, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl p-4 shadow-sm card-hover">
              <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">{t('Progress by Subject', 'التقدم حسب المادة')}</h3>
          {subjectProgressList.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">
              {t('No progress to display. Complete your first session to track progress!', 'لا يوجد تقدم لعرضه. أكمل حصتك الأولى لمتابعة التقدم!')}
            </p>
          ) : (
            subjectProgressList.map(({ subject, progress }) => (
              <div key={subject} className="mb-3 last:mb-0">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-gray-700">{subject}</span>
                  <span className="text-gray-400 font-semibold">{progress}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full bg-blue-500 rounded-full transition-all`} style={{ width: `${progress}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3">{t('Achievements', 'الإنجازات')}</h3>
          <div className="grid grid-cols-3 gap-3">
            {achievements.map(({ icon: Icon, label, earned }) => (
              <div key={label} className={`p-3 rounded-2xl text-center transition-all duration-300 ${earned ? 'bg-blue-50' : 'bg-gray-50 opacity-40'}`}>
                <Icon className={`w-5 h-5 mx-auto ${earned ? 'text-blue-600' : 'text-gray-400'}`} />
                <p className="text-[10px] font-semibold text-gray-600 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <BottomNav active={activeNav} onChange={switchTab} language={language} onLogout={onLogout} isDark={themeMode === 'dark'} />
    </div>
  );

  if (activeNav === 'schedule') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20">
        <h1 className="font-bold text-gray-900">{t('My Schedule', 'جدولي')}</h1>
        <p className="text-xs text-gray-400 mt-0.5">{t('Upcoming and completed sessions', 'الحصص القادمة والمكتملة')}</p>
      </div>
      <div className="flex-1 overflow-y-auto pb-20 p-4 space-y-4 animate-slide-up">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3">{t('This Week', 'هذا الأسبوع')}</h3>
          <div className="grid grid-cols-7 gap-1">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className="text-center">
                <p className="text-[10px] text-gray-400 mb-1">{d}</p>
                <div className={`w-8 h-8 rounded-xl mx-auto flex items-center justify-center text-xs font-bold ${
                  [1,3,5].includes(i) ? 'bg-blue-600 text-white' : 'text-gray-500'
                }`}>
                  {i + 10}
                </div>
                {[1,3,5].includes(i) && <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mx-auto mt-1" />}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold text-gray-800">{t('Upcoming Sessions', 'الحصص القادمة')}</h3>
          {bookedSessions.filter(s => s.status === 'confirmed').length === 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center text-sm text-gray-400">
              {t('No upcoming sessions yet. Book a tutor to get started!', 'لا توجد حصص قادمة بعد. احجز مع أستاذ للبدء!')}
            </div>
          )}
          {bookedSessions.filter(s => s.status === 'confirmed').map((s) => (
            <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 card-hover hover-blue-card interactive-card">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="font-bold text-gray-800 text-sm truncate">{s.subject}</p>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">{t('confirmed', 'مؤكدة')}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{s.tutorName}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-blue-600 font-medium mt-1.5">
                    <span>{s.date}</span>
                    <span>•</span>
                    <span>{s.startTime} – {s.endTime}</span>
                    <span>•</span>
                    <span>{s.creditCost} {t('credits', 'رصيد')}</span>
                  </div>
                </div>
              </div>
              <JoinSessionButton
                session={s}
                language={language}
                onNeedCredits={() => { switchTab('home'); setTimeout(() => nav('packages'), 50); }}
                onJoin={(roomId) => {
                  setLiveRoomId(roomId);
                  setScreen('meeting');
                }}
              />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">{t('Completed Sessions', 'الحصص المكتملة')}</h3>
            <span className="text-xs text-gray-400">{t('Rate your tutor', 'قيّم الأستاذ')}</span>
          </div>
          {bookedSessions.filter(s => s.status === 'completed').length === 0 ? (
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center text-sm text-gray-400">
              {t('No completed sessions yet.', 'لا توجد حصص مكتملة بعد.')}
            </div>
          ) : (
            bookedSessions.filter(s => s.status === 'completed').map((s, i) => {
              const review = reviewsBySession[s.id];
              return (
                <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 card-hover hover-blue-card interactive-card animate-slide-up" style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-200">
                      <CircleCheck className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-bold text-gray-800 text-sm truncate">{s.subject}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{s.tutorName}</p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700 flex-shrink-0">{t('Completed', 'مكتملة')}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-blue-600 font-medium mt-1.5">
                        <span>{s.date}</span>
                        <span>•</span>
                        <span>{s.startTime} – {s.endTime}</span>
                      </div>
                      {review ? (
                        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, starIdx) => (
                                <Star key={starIdx} className={`w-4 h-4 ${starIdx < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 fill-gray-200'}`} />
                              ))}
                            </div>
                            {review.message && <p className="text-xs text-gray-500 mt-1 max-w-[220px] line-clamp-2">“{review.message}”</p>}
                          </div>
                          <button onClick={() => openReview({ id: s.id, date: s.date, time: s.startTime, tutor: s.tutorName, subject: s.subject })} className="px-3 py-2 rounded-xl bg-blue-50 text-blue-600 font-semibold text-xs hover:bg-blue-100 transition-all">
                            {t('Edit Review', 'تعديل التقييم')}
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => openReview({ id: s.id, date: s.date, time: s.startTime, tutor: s.tutorName, subject: s.subject })} className="mt-3 w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-[0.98] inline-flex items-center justify-center gap-2">
                          <Star className="w-4 h-4 fill-white" /> {t('Rate this Tutor', 'قيّم هذا الأستاذ')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
      <BottomNav active={activeNav} onChange={switchTab} language={language} onLogout={onLogout} isDark={themeMode === 'dark'} />

      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setReviewTarget(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 animate-slide-up shadow-2xl">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-200 animate-float">
                <Award className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{t('Rate Your Tutor', 'قيّم أستاذك')}</h3>
              <p className="text-sm text-gray-500 mt-1">{reviewTarget.tutor} · {reviewTarget.subject}</p>
            </div>
            <div className="flex items-center justify-center gap-2 mb-4">
              {Array.from({ length: 5 }).map((_, index) => {
                const value = index + 1;
                const active = value <= (reviewHover || reviewStars);
                return (
                  <button
                    key={value}
                    onMouseEnter={() => setReviewHover(value)}
                    onMouseLeave={() => setReviewHover(0)}
                    onClick={() => setReviewStars(value)}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                      active ? 'bg-blue-600 scale-110 shadow-lg shadow-blue-200' : 'bg-gray-100 hover:bg-blue-50'
                    }`}
                  >
                    <Star className={`w-6 h-6 ${active ? 'text-white fill-white' : 'text-gray-300'}`} />
                  </button>
                );
              })}
            </div>
            <textarea
              value={reviewMessage}
              onChange={(e) => setReviewMessage(e.target.value)}
              rows={4}
              placeholder={t('Write a professional feedback message about your session...', 'اكتب رسالة تقييم احترافية عن تجربتك مع الحصة...')}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all resize-none"
            />
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button onClick={() => setReviewTarget(null)} className="py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-all">
                {t('Cancel', 'إلغاء')}
              </button>
              <button onClick={submitReview} disabled={reviewStars === 0} className="py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {t('Submit Review', 'إرسال التقييم')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (activeNav === 'profile') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100 text-left">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20">
        <h1 className="font-bold text-gray-900 text-lg">{t('My Profile', 'ملفي الشخصي', 'Mon profil')}</h1>
        <p className="text-xs text-gray-400 mt-0.5">{t('Manage your account', 'إدارة حسابك', 'Gérer votre compte')}</p>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 space-y-4 animate-slide-up">
        <div className="bg-blue-600 px-5 pt-6 pb-10 relative">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 bg-white/20 backdrop-blur-sm border-4 border-white/40 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-xl">
                {studentName.charAt(0).toUpperCase()}
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-400 border-2 border-white rounded-full flex items-center justify-center">
                <CheckCircle className="w-3 h-3 text-white" />
              </div>
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-white text-xl leading-tight">{studentName}</h2>
              <p className="text-blue-100 text-sm mt-0.5">{user.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1 rounded-full border border-white/30 inline-flex items-center gap-1">
                  <GraduationCap className="w-3 h-3" /> {t('Student', 'طالب', 'Élève')}
                </span>
                <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1 rounded-full border border-white/30 inline-flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {t('Verified', 'موثق', 'Vérifié')}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: t('Sessions', 'الجلسات', 'Sessions'), value: String(completedSessionsCount) },
              { label: t('Hours', 'الساعات', 'Heures'), value: `${hoursLearned}h` },
              { label: t('Streak', 'الاستمرارية', 'Série'), value: t(`${streakDays} days`, `${streakDays} أيام`, `${streakDays} jours`) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/15 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
                <p className="text-white font-bold text-lg">{value}</p>
                <p className="text-blue-100 text-[10px] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 -mt-6 space-y-4">
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-sm">
                {t('Account Information', 'معلومات الحساب', 'Informations du compte')}
              </h3>
              {isEditingName ? (
                <div className="flex gap-1.5">
                  <button
                    onClick={saveProfileName}
                    disabled={savingName}
                    className="text-xs text-green-600 font-semibold bg-green-50 px-2.5 py-1 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    {savingName ? '...' : t('Save', 'حفظ', 'Sauvegarder')}
                  </button>
                  <button
                    onClick={() => { setIsEditingName(false); setEditedName(studentName); }}
                    className="text-xs text-red-500 font-semibold bg-red-50 px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    {t('Cancel', 'إلغاء', 'Annuler')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-xs text-blue-600 font-semibold bg-blue-50 px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors touch-press"
                >
                  {t('Edit', 'تعديل', 'Modifier')}
                </button>
              )}
            </div>

            <div className="divide-y divide-gray-50">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                    {t('Full Name', 'الاسم الكامل', 'Nom complet')}
                  </p>
                  {isEditingName ? (
                    <input
                      type="text"
                      value={editedName}
                      onChange={e => setEditedName(e.target.value)}
                      className="w-full px-3 py-1.5 mt-1 text-sm border border-gray-200 rounded-xl focus:border-blue-400 focus:outline-none"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{studentName}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                    {t('Email Address', 'البريد الإلكتروني', 'Adresse e-mail')}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4 h-4 text-green-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                    {t('Account Role', 'نوع الحساب', 'Rôle du compte')}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">
                    {t('Student', 'طالب', 'Élève')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BookMarked className="w-4 h-4 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                    {t('Account Status', 'حالة الحساب', 'Statut du compte')}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">
                    {t('Active Account', 'حساب نشط وموثق', 'Compte actif')}
                  </p>
                </div>
              </div>
            </div>

          {onOpenSetPassword && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">{t('Security & Password', 'الأمان وكلمة المرور', 'Sécurité et mot de passe')}</h4>
                  <p className="text-xs text-gray-400">{t('Change or set your account password', 'تغيير أو تعيين كلمة مرور حسابك', 'Changer le mot de passe')}</p>
                </div>
              </div>
              <button
                onClick={onOpenSetPassword}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-200 transition-all touch-press"
              >
                {t('Change Password', 'تغيير الكلمة', 'Changer')}
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-bold text-gray-900 text-sm mb-3">
              {t('Learning Progress', 'التقدم الدراسي', 'Progrès d\'apprentissage')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: t('Sessions Done', 'الجلسات المنجزة', 'Sessions terminées'), value: String(completedSessionsCount), icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: t('Hours Learned', 'ساعات التعلم', 'Heures apprises'), value: String(hoursLearned), icon: Clock, color: 'text-green-600', bg: 'bg-green-50' },
                { label: t('Streak', 'الاستمرارية', 'Série'), value: t(`${streakDays} days`, `${streakDays} أيام`, `${streakDays} jours`), icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-50' },
                { label: t('Certificates', 'الشهادات', 'Certificats'), value: String(certificatesCount), icon: Award, color: 'text-purple-600', bg: 'bg-purple-50' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className={`${bg} rounded-2xl p-3 flex items-center gap-3`}>
                  <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
                  <div>
                    <p className="font-bold text-gray-900 text-base leading-none">{value}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 text-sm">
                {t('Achievements', 'الإنجازات', 'Succès')}
              </h3>
              <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full">
                {t(`${achievements.filter(a => a.earned).length}/6 earned`, `${achievements.filter(a => a.earned).length}/6 مكتملة`, `${achievements.filter(a => a.earned).length}/6 obtenus`)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Flame, label: t('Week Streak', 'تواصل أسبوعي', 'Série hebdo'), earned: true },
                { icon: Star, label: t('Top Student', 'طالب متميز', 'Élève d\'élite'), earned: true },
                { icon: BookOpen, label: t('10 Sessions', '10 حصص', '10 cours'), earned: true },
                { icon: Trophy, label: t('Math Ace', 'بطل الرياضيات', 'As des maths'), earned: false },
                { icon: Globe, label: t('Polyglot', 'متحدث لغات', 'Polyglotte'), earned: false },
                { icon: Lightbulb, label: t('Quick Learner', 'سريع التعلم', 'Apprenti rapide'), earned: false },
              ].map(({ icon: Icon, label, earned }) => (
                <div key={label} className={`p-3 rounded-2xl text-center border ${earned ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
                  <Icon className="w-5 h-5 mx-auto text-blue-600" />
                  <p className="text-[10px] font-semibold text-gray-600 mt-1">{label}</p>
                  {earned && <p className="text-[9px] text-blue-500 font-bold mt-0.5">{t('EARNED', 'تم الحصول عليها', 'OBTENU')}</p>}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h3 className="font-bold text-gray-900 text-sm">
                {t('Settings', 'الإعدادات', 'Paramètres')}
              </h3>
            </div>
            {[
              { icon: Bell, label: t('Notifications', 'الاشعارات', 'Notifications'), sub: t('Manage alerts & reminders', 'ادارة التنبيهات والتذكيرات', 'Gérer les alertes'), color: 'text-blue-500', bg: 'bg-blue-50', onClick: () => { switchTab('home'); setTimeout(() => setShowNotifications(true), 50); } },
              { icon: Languages, label: t('Language', 'اللغة', 'Langue'), sub: language === 'en' ? 'English' : language === 'ar' ? 'العربية' : 'Français', color: 'text-green-500', bg: 'bg-green-50', onClick: () => onChangeLanguage(language === 'en' ? 'ar' : language === 'ar' ? 'fr' : 'en') },
              { icon: themeMode === 'light' ? Moon : Sun, label: t('Theme', 'المظهر', 'Thème'), sub: themeMode === 'light' ? t('Light mode', 'الوضع النهارى', 'Mode clair') : t('Dark mode', 'الوضع الليلى', 'Mode sombre'), color: 'text-blue-500', bg: 'bg-blue-50', onClick: () => setThemeMode(prev => prev === 'light' ? 'dark' : 'light') },
              { icon: Users, label: t('My Tutors', 'مدرسيني', 'Mes enseignants'), sub: t('Saved & favourite tutors', 'المدرسون المحفوظون والمفضلون', 'Enseignants favoris'), color: 'text-purple-500', bg: 'bg-purple-50', onClick: () => { switchTab('home'); setTimeout(() => nav('tutors'), 50); } },
            ].map(({ icon: Icon, label, sub, color, bg, onClick }) => (
              <button key={label} onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors text-left">
                <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              onLogout();
            }}
            className="w-full py-3.5 border-2 border-red-100 text-red-500 rounded-2xl text-sm font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-2 touch-press"
          >
            <LogOut className="w-4 h-4" />{t('Sign Out', 'تسجيل الخروج', 'Se déconnecter')}
          </button>


          <p className="text-center text-[10px] text-gray-300 pb-2">Teach Me v2.0 · {t('Professional Learning Platform', 'منصة تعليمية احترافية', 'Plateforme professionnelle d\'apprentissage')}</p>
        </div>
      </div>
    </div>

    <BottomNav active={activeNav} onChange={switchTab} language={language} onLogout={onLogout} isDark={themeMode === 'dark'} />
  </div>
);

  if (screen === 'packages') return (
    <PackagesScreen
      language={language}
      onBack={() => nav('home')}
      onHistory={() => nav('credit-history')}
    />
  );

  if (screen === 'credit-history') return (
    <CreditHistoryScreen language={language} onBack={() => nav('packages')} />
  );

  const upcomingSession = bookedSessions.find(s => s.status === 'confirmed');

  if (screen === 'home' && activeNav === 'home') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      {upcomingSession && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-white animate-bounce shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">
                {t('Reminder: Upcoming Session!', 'تذكير: حصتك القادمة قريباً!')}
              </p>
              <p className="text-[10px] text-blue-100 truncate">
                {upcomingSession.tutorName} • {upcomingSession.subject} ({upcomingSession.date} {upcomingSession.startTime})
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const roomId = upcomingSession.liveRoomId || `teachme-room-${upcomingSession.id.slice(0, 8)}`;
              setLiveRoomId(roomId);
              nav('meeting');
            }}
            className="px-3 py-1 bg-white text-blue-700 hover:bg-blue-50 text-xs font-bold rounded-lg shadow shrink-0 flex items-center gap-1 touch-press"
          >
            <Video className="w-3.5 h-3.5" />
            {t('Join Now', 'انضمام الآن')}
          </button>
        </div>
      )}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center select-none">
              <span className={`text-xl tracking-tight leading-none bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-500 bg-clip-text text-transparent ${language === 'ar' ? 'font-cairo font-black py-0.5' : 'font-outfit font-black'}`}>
                {language === 'ar' ? 'علمني' : 'Teach Me'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChangeLanguage(language === 'en' ? 'ar' : language === 'ar' ? 'fr' : 'en')}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-xs font-bold text-blue-600 touch-press"
              aria-label="Change language"
            >
              {language.toUpperCase()}
            </button>
            <button
              onClick={() => setThemeMode(prev => prev === 'light' ? 'dark' : 'light')}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Toggle theme"
            >
              {themeMode === 'light' ? <Moon className="w-4 h-4 text-gray-600" /> : <Sun className="w-4 h-4 text-amber-500" />}
            </button>
            <CreditBadge onClick={() => nav('packages')} />
            <button
              onClick={() => setShowNotifications(true)}
              className="relative p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </button>
            <button
              onClick={() => switchTab('profile')}
              className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors"
            >
              {studentName.charAt(0)}
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('Search subjects or tutors...', 'ابحث عن المواد او المدرسين...')}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-100 text-sm focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all border border-transparent focus:border-blue-200"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="absolute left-4 right-4 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 mt-1 overflow-hidden animate-slide-down">
            {filteredCategories.slice(0, 3).map(cat => (
              <button
                key={`cat-${cat.id}`}
                onClick={() => {
                  setSelectedCategory(cat);
                  setSearchQuery('');
                  nav('subjects');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  {React.createElement(CATEGORY_ICON_MAP[cat.icon] || BookOpen, { className: 'w-5 h-5 text-blue-600' })}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{language === 'en' ? cat.name : cat.nameAr}</p>
                  <p className="text-xs text-gray-400">{t('Category', 'تخصص')}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            ))}

            {filteredSubjects.slice(0, 5).map(subject => {
              const parentCategory = categories.find(c => c.id === subject.categoryId) || null;
              return (
                <button
                  key={`sub-${subject.id}`}
                  onClick={() => {
                    if (parentCategory) setSelectedCategory(parentCategory);
                    setSelectedSubject(subject);
                    setSearchQuery('');
                    nav('levels');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <BookMarked className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{language === 'en' ? subject.name : subject.nameAr}</p>
                    <p className="text-xs text-gray-400">{parentCategory ? (language === 'en' ? parentCategory.name : parentCategory.nameAr) : t('Subject', 'مادة')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-600">{formatCurrency(subject.minPrice)}</p>
                    <p className="text-[10px] text-gray-400">{t('from', 'ابتداءً من')}</p>
                  </div>
                </button>
              );
            })}

            {filteredTutors.slice(0, 4).map(tut => (
              <button key={tut.id} onClick={() => { setSelectedTutor(tut); setSearchQuery(''); nav('tutor-profile'); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 text-left"
              >
                <img src={tut.avatarUrl} alt={tut.name} className="w-9 h-9 rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${tut.name}&background=3B82F6&color=fff`; }} />
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-800">{tut.name}</p>
                  <p className="text-xs text-gray-400">{tut.subjects.slice(0, 2).join(', ')}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm font-bold text-blue-600">{formatCurrency(tut.hourlyRate)}/{t('hr', 'ساعة')}</p>
                  <p className="text-xs text-yellow-500">{tut.rating} / 5</p>
                </div>
              </button>

            ))}

            {filteredCategories.length === 0 && filteredSubjects.length === 0 && filteredTutors.length === 0 && (
              <div className="px-4 py-5 text-center text-gray-400 text-sm">{t('No results found', 'لا توجد نتائج')}</div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        <div className="mx-4 mt-4 gradient-animated rounded-3xl p-5 shadow-xl shadow-blue-200/50 animate-slide-up">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg leading-tight">
                {t('Welcome Back,', 'أهلاً بعودتك،', 'Bon retour,')}<br />
                {studentName.split(' ')[0]}!
              </h2>
              <p className="text-blue-100 text-xs mt-0.5">{t('Ready to expand your knowledge?', 'جاهز لتوسيع معرفتك؟', 'Prêt à enrichir vos connaissances ?')}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t('Expert Tutors', 'مدرسين خبراء', 'Tuteurs experts'), value: tutorsList.length > 0 ? `${tutorsList.length}+` : '0' },
              { label: t('Subjects', 'المواد', 'Matières'), value: `${subjects.length}+` },
              { label: t('Avg Rating', 'متوسط التقييم', 'Note moy.'), value: tutorsList.length > 0 ? (tutorsList.reduce((acc, curr) => acc + curr.rating, 0) / tutorsList.length).toFixed(1) : '5.0' },
            ].map(({ label, value }) => (

              <div key={label} className="bg-white/15 rounded-2xl p-3 text-center backdrop-blur-sm">
                <p className="text-white font-bold text-xl">{value}</p>
                <p className="text-blue-100 text-[10px] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mx-4 mt-4 animate-slide-up delay-100">
          {[
            { label: t('Schedule', 'المواعيد', 'Planning'), sub: t('View calendar', 'عرض التقويم', 'Calendrier'), icon: Calendar, onClick: () => { switchTab('schedule'); } },
            { label: t('Dashboard', 'لوحة التحكم', 'Tableau de bord'), sub: t('My progress', 'تقدمي التعليمي', 'Mes progrès'), icon: TrendingUp, onClick: () => switchTab('dashboard') },
            { label: t('Chat', 'المحادثة', 'Chat'), sub: t('Messages', 'الرسائل', 'Messages'), icon: MessageSquare, onClick: () => { if (tutorsList.length > 0) setSelectedTutor(tutorsList[0]); nav('chat'); } },
          ].map(({ label, sub, icon: Icon, onClick }) => (
            <button key={label} onClick={onClick} className="bg-white rounded-2xl p-3 shadow-sm card-hover text-center touch-press">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                <Icon className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-xs font-semibold text-gray-800">{label}</p>
              <p className="text-[10px] text-gray-400">{sub}</p>
            </button>
          ))}
        </div>
        <div className="mt-5 px-4 animate-slide-up delay-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-lg">{t('Choose Your Subject', 'اختر تخصصك', 'Choisissez votre matière')}</h3>
            <button onClick={() => nav('categories')} className="flex items-center gap-1 text-blue-600 text-xs font-semibold">
              {t('See all', 'عرض الكل', 'Voir tout')} <TrendingUp className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {categories.slice(0, 6).map((cat, i) => {
              const Icon = CATEGORY_ICON_MAP[cat.icon] || BookOpen;
              const isActive = activeCategoryCard === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => openCategory(cat)}
                  className={`rounded-2xl p-5 card-hover interactive-card text-left animate-slide-up border-2 transition-all duration-300 touch-press ${
                    isActive
                      ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-200 text-white category-tile-active active-blue-card'
                      : 'bg-white border-gray-100 shadow-sm hover:border-blue-300 hover-blue-card'
                  }`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className={`cat-icon-box w-14 h-14 rounded-2xl flex items-center justify-center mb-3 text-2xl transition-all duration-300 ${
                    isActive ? 'ring-2 ring-white/30' : ''
                  }`} style={{ background: isActive ? 'rgba(255,255,255,0.25)' : cat.bgColor }}>
                    <Icon className={`w-7 h-7 transition-all duration-300 ${isActive ? 'text-white drop-shadow category-icon-active' : 'text-blue-500'}`} />
                  </div>
                  <p className={`font-bold text-base transition-colors ${isActive ? 'text-white' : 'text-gray-800'}`}>{language === 'en' ? cat.name : cat.nameAr}</p>
                  <p className={`text-sm mt-1 font-cairo transition-colors ${isActive ? 'text-blue-100' : ''}`} style={{ color: isActive ? undefined : cat.color }}>{language === 'en' ? cat.nameAr : cat.name}</p>
                  <span className={`mt-2.5 inline-block text-xs font-semibold px-3 py-1.5 rounded-full ${
                    isActive ? 'bg-white text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {subjects.filter(s => s.categoryId === cat.id).length} {t('subjects', 'مواد', 'matières')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-5 px-4 pb-4 animate-slide-up delay-300">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-lg">{t('Top Tutors', 'أفضل المدرسين', 'Meilleurs tuteurs')}</h3>
            <button onClick={() => nav('tutors')} className="text-blue-600 text-xs font-semibold">{t('See all', 'عرض الكل', 'Voir tout')}</button>
          </div>
          <div className="space-y-3">
            {tutorsList.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-gray-100 shadow-sm">
                <p className="text-sm text-gray-500">{t('No approved tutors available.', 'لا يوجد مدرسون معتمدون حالياً.', 'Aucun tuteur approuvé disponible.')}</p>
              </div>
            ) : (
              tutorsList.slice(0, 4).map((tutor, i) => (
                <button
                  key={tutor.id}
                  onClick={() => { setSelectedTutor(tutor); nav('tutor-profile'); }}
                  className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 card-hover animate-slide-up text-left border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all touch-press"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="relative flex-shrink-0">
                    <img
                      src={tutor.avatarUrl}
                      alt={tutor.name}
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-gray-100"
                      onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${tutor.name}&background=3B82F6&color=fff&size=150`; }}
                    />
                    {tutor.isOnline && (
                      <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-400 border-2 border-white rounded-full" />
                    )}
                    {tutor.isVerified && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white">
                        <CheckCircle className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{tutor.name}</p>
                        <p className="text-gray-400 text-xs font-cairo mt-0.5">{tutor.nameAr}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-blue-600">{formatCurrency(tutor.hourlyRate)}</p>
                        <p className="text-gray-400 text-[10px]">{t('per hour', 'في الساعة', 'par heure')}</p>
                      </div>

                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <Star key={j} className={`w-3 h-3 ${j < Math.floor(tutor.rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 fill-gray-200'}`} />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-gray-700">{tutor.rating}</span>
                      <span className="text-xs text-gray-400">({tutor.reviewCount})</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {tutor.languages.map(l => (
                        <span key={l} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-lg font-semibold">{l}</span>
                      ))}
                      <span className="ml-auto text-[10px] text-gray-500 flex items-center gap-0.5">
                        <Award className="w-3 h-3" /> {t(`${tutor.experienceYears}+ yrs`, `${tutor.experienceYears}+ سنوات`, `${tutor.experienceYears}+ ans`)}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <BottomNav active={activeNav} onChange={switchTab} language={language} onLogout={onLogout} isDark={themeMode === 'dark'} />
      {showNotifications && (
        <div className="fixed inset-0 z-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100" style={{left:'50%', transform:'translateX(-50%)', right:'auto', width:'100%'}}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNotifications(false)} />
          <div className="relative bg-white rounded-b-3xl shadow-2xl overflow-hidden animate-slide-down">
            <div className="bg-blue-600 px-5 pt-12 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-white text-lg">Notifications</h2>
                  <p className="text-blue-100 text-xs mt-0.5">3 new alerts</p>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {[
                {
                  id: 1,
                  icon: CalendarClock,
                  iconBg: 'bg-blue-50',
                  title: 'Session Reminder',
                  body: 'Your session with Dr. Sarah Johnson starts in 1 hour — Basic Math at 10:00 AM.',
                  time: '45 min ago',
                  isNew: true,
                },
                {
                  id: 2,
                  icon: Star,
                  iconBg: 'bg-yellow-50',
                  title: 'Review Request',
                  body: 'How was your session with Prof. Michael Chen? Leave a review to help others.',
                  time: '2 hours ago',
                  isNew: true,
                },
                {
                  id: 3,
                  icon: MessageCircle,
                  iconBg: 'bg-green-50',
                  title: 'New Message',
                  body: 'Ahmed Al-Rashid sent you a message: "I uploaded the practice exercises for tomorrow."',
                  time: '3 hours ago',
                  isNew: true,
                },
                {
                  id: 4,
                  icon: PartyPopper,
                  iconBg: 'bg-purple-50',
                  title: 'Achievement Unlocked!',
                  body: 'You earned the "Week Streak" badge for attending 7 sessions in a row!',
                  time: 'Yesterday',
                  isNew: false,
                },
                {
                  id: 5,
                  icon: Lightbulb,
                  iconBg: 'bg-orange-50',
                  title: 'New Tutor Available',
                  body: 'Dr. Layla Hassan just opened new slots for IELTS Prep this weekend.',
                  time: 'Yesterday',
                  isNew: false,
                },
                {
                  id: 6,
                  icon: CircleCheck,
                  iconBg: 'bg-teal-50',
                  title: 'Booking Confirmed',
                  body: 'Your booking with Prof. Michael Chen on Jan 17 at 3:00 PM is confirmed.',
                  time: '2 days ago',
                  isNew: false,
                },
              ].map(n => {
                const Icon = n.icon;
                return (
                <button
                  key={n.id}
                  onClick={() => setReadNotifications(r => r.includes(n.id) ? r : [...r, n.id])}
                  className={`w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-gray-50 transition-colors ${
                    n.isNew && !readNotifications.includes(n.id) ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className={`w-11 h-11 ${n.iconBg} rounded-2xl flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-bold leading-snug ${n.isNew && !readNotifications.includes(n.id) ? 'text-gray-900' : 'text-gray-700'}`}>
                        {n.title}
                      </p>
                      {n.isNew && !readNotifications.includes(n.id) && (
                        <span className="w-2.5 h-2.5 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-gray-400 mt-1.5 font-medium">{n.time}</p>
                  </div>
                </button>
              );})}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => { setReadNotifications([1,2,3,4,5,6]); }}
                className="w-full text-center text-sm font-semibold text-blue-600 hover:text-blue-700 py-1"
              >
                Mark all as read
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (screen === 'categories') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="bg-white border-b border-gray-100 px-5 py-5 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={() => nav('home')} className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="font-bold text-gray-900 text-lg">{t('All Subjects', 'جميع التخصصات')}</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3">
          {categories.map((cat, i) => {
            const Icon = CATEGORY_ICON_MAP[cat.icon] || BookOpen;
            const isActive = activeCategoryCard === cat.id;
            return (
            <button
              key={cat.id}
              onClick={() => openCategory(cat)}
              className={`rounded-2xl p-5 card-hover interactive-card text-left animate-slide-up border-2 transition-all duration-300 ${
                isActive
                  ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-200 text-white category-tile-active active-blue-card'
                  : 'bg-white border-gray-100 shadow-sm hover:border-blue-300 hover-blue-card'
              }`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="cat-icon-box w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-all duration-300" style={{ background: isActive ? 'rgba(255,255,255,0.25)' : cat.bgColor }}>
                <Icon className={`w-7 h-7 transition-all duration-300 ${isActive ? 'text-white drop-shadow category-icon-active' : 'text-blue-500'}`} />
              </div>
              <p className={`font-bold text-base transition-colors ${isActive ? 'text-white' : 'text-gray-800'}`}>{language === 'en' ? cat.name : cat.nameAr}</p>
              <p className={`text-sm mt-1 font-cairo transition-colors ${isActive ? 'text-blue-100' : ''}`} style={{ color: isActive ? undefined : cat.color }}>{language === 'en' ? cat.nameAr : cat.name}</p>
              <span className={`mt-2.5 inline-block text-xs font-semibold px-3 py-1.5 rounded-full ${isActive ? 'bg-white text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                {subjects.filter(s => s.categoryId === cat.id).length} {t('subjects', 'مواد')}
              </span>
            </button>
          );})}
        </div>
      </div>
    </div>
  );

  if (screen === 'subjects' && selectedCategory) return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="bg-white border-b border-gray-100 px-5 py-5 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={() => nav('home')} className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="font-bold text-gray-900 text-lg">{language === 'en' ? selectedCategory.name : selectedCategory.nameAr}</h1>
          <p className="text-sm font-cairo" style={{ color: selectedCategory.color }}>{language === 'en' ? selectedCategory.nameAr : selectedCategory.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5 animate-slide-up">
        <div>
          <h2 className="font-bold text-gray-900 text-xl">{t('Available Subjects', 'المواد المتاحة')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('Choose a subject to see available courses', 'اختر مادة لرؤية المواد المتاحة للتعلم')}</p>
        </div>
        <div className="space-y-3">
          {getSubjectsByCategory(selectedCategory.id).map((sub, i) => (
            <button
              key={sub.id}
              onClick={() => { setSelectedSubject(sub); nav('levels'); }}
              className={`w-full rounded-2xl p-4 sm:p-5 shadow-sm card-hover interactive-card subject-card-hover flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-slide-up text-start border-2 transition-all duration-300 ${
                i === 0 ? 'border-blue-500 bg-blue-50' : 'bg-white border-gray-100 hover:border-blue-300'
              }`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className={`cat-icon-box w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${i === 0 ? 'bg-blue-600 shadow-lg shadow-blue-200' : 'bg-blue-50'}`}>
                  <BookMarked className={`w-6 h-6 ${i === 0 ? 'text-white' : 'text-blue-600'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`font-bold text-base leading-snug truncate ${i === 0 ? 'text-blue-600' : 'text-gray-800'}`}>{language === 'en' ? sub.name : sub.nameAr}</p>
                  <p className="text-xs font-cairo text-gray-400 mt-0.5 truncate">{language === 'en' ? sub.nameAr : sub.name}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-gray-500 whitespace-nowrap-safe">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {getSubjectTutorCount(sub)} {t('tutors', 'مدرسين')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" /> {getSubjectLevels(sub).length} {t('courses', 'مواد')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100/70 flex-shrink-0">
                <div className="text-start sm:text-end">
                  <p className={`font-bold text-sm sm:text-base whitespace-nowrap-safe ${i === 0 ? 'text-blue-600' : 'text-gray-700'}`}>{t('From', 'من')} {formatCurrency(getSubjectMinPrice(sub))}/{t('hr', 'ساعة')}</p>
                  <p className="text-[11px] text-gray-400 whitespace-nowrap-safe">{getSubjectLevels(sub).length} {t('courses available', 'مواد متاحة')}</p>
                </div>
                <ChevronRight className={`w-5 h-5 flex-shrink-0 rtl:rotate-180 ${i === 0 ? 'text-blue-500' : 'text-gray-300'}`} />
              </div>
            </button>
          ))}

        </div>
      </div>
      <div className="p-4">
        <div className="h-12 gradient-animated rounded-2xl shadow-lg shadow-blue-200" />
      </div>
    </div>
  );

  if (screen === 'levels' && selectedSubject) {
    const coursesForSubject = getSubjectLevels(selectedSubject);
    return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="bg-white border-b border-gray-100 px-5 py-5 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={() => nav('subjects')} className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="font-bold text-gray-900 text-lg">{language === 'en' ? selectedSubject.name : selectedSubject.nameAr}</h1>
          <p className="text-sm font-cairo text-gray-400">{language === 'en' ? selectedSubject.nameAr : selectedSubject.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5 animate-slide-up">
        <div>
          <h2 className="font-bold text-gray-900 text-xl">{t('Available Courses', 'المواد المتاحة للتعلم')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t(`${coursesForSubject.length} courses available — choose what you want to learn`, `${coursesForSubject.length} مادة متاحة — اختر ما تريد تعلمه`)}</p>
        </div>
        <div className="space-y-3">
          {coursesForSubject.map((course, i) => (
            <button
              key={course.id}
              onClick={() => { setSelectedLevel(course); nav('tutors'); }}
              className={`w-full rounded-2xl p-4 sm:p-5 shadow-sm card-hover interactive-card subject-card-hover flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-slide-up text-start border-2 transition-all duration-300 ${
                course.isPopular
                  ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-200 text-white active-blue-card'
                  : 'bg-white border-gray-100 hover:border-blue-400 hover:shadow-md'
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className={`cat-icon-box w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                  course.isPopular ? 'bg-white/25 ring-1 ring-white/30' : 'bg-blue-50'
                }`}>
                  <BookOpen className={`w-6 h-6 ${course.isPopular ? 'text-white drop-shadow' : 'text-blue-500'}`} />
                </div>
                <div className="flex-1 text-start min-w-0">
                  <p className={`font-bold text-base leading-snug truncate ${course.isPopular ? 'text-white' : 'text-gray-900'}`}>
                    {language === 'en' ? course.name : course.nameAr}
                  </p>
                  <p className={`text-xs font-cairo mt-0.5 truncate ${course.isPopular ? 'text-blue-100' : 'text-gray-400'}`}>
                    {language === 'en' ? course.nameAr : course.name}
                  </p>
                  <div className={`flex items-center gap-3 mt-2 flex-wrap text-xs whitespace-nowrap-safe ${course.isPopular ? 'text-white/80' : 'text-gray-500'}`}>
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {getLevelTutorCount(course)} {t('tutors', 'مدرسين')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {t('Flexible hours', 'ساعات مرنة')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100/50 flex-shrink-0">
                <div className="text-start sm:text-end">
                  <p className={`font-bold text-base whitespace-nowrap-safe ${course.isPopular ? 'text-white' : 'text-blue-600'}`}>{formatCurrency(getLevelPrice(course))}</p>
                  <p className={`text-[11px] whitespace-nowrap-safe ${course.isPopular ? 'text-blue-100' : 'text-gray-400'}`}>{t('per hour', 'لكل ساعة')}</p>
                </div>
                {course.isPopular && (
                  <span className="inline-flex items-center gap-1 bg-white text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap-safe">
                    <Star className="w-3 h-3 fill-blue-600" /> {t('Popular', 'مميز')}
                  </span>
                )}
              </div>
            </button>
          ))}

        </div>
      </div>
    </div>
  );}

  if (screen === 'tutors') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => nav(selectedLevel ? 'levels' : 'home')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="font-bold text-gray-900">{selectedLevel?.name || 'All'} Tutors</h1>
            <p className="text-xs text-gray-400">{filteredTutors.length} tutors available</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['Top Rated', 'Price', 'Experience'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filterType === f ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4 p-3 space-y-3">
        {filteredTutors.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-gray-100 shadow-sm space-y-4">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto text-blue-500">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-gray-900 text-base">{t('No Approved Tutors', 'لا يوجد مدرسون معتمدون', 'Aucun tuteur approuvé')}</h3>
            <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
              {t('There are currently no approved tutors in this category. Please check back later.', 'لا يوجد مدرسون معتمدون في هذه الفئة حالياً. يرجى التحقق لاحقاً.', 'Il n\'y a actuellement aucun tuteur approuvé dans cette catégorie.')}
            </p>
          </div>
        ) : (
          filteredTutors.map((tutor, i) => (
          <button
            key={tutor.id}
            onClick={() => { setSelectedTutor(tutor); nav('tutor-profile'); }}
            className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md touch-press text-left animate-slide-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start gap-3">
              <div className="relative flex-shrink-0">
                <img
                  src={tutor.avatarUrl}
                  alt={tutor.name}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-gray-100"
                  onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${tutor.name}&background=3B82F6&color=fff&size=150`; }}
                />
                {tutor.isOnline && (
                  <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-400 border-2 border-white rounded-full" />
                )}
                {tutor.isVerified && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white">
                    <CheckCircle className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900 text-sm leading-tight truncate">{tutor.name}</p>
                    <p className="text-gray-400 text-xs font-cairo mt-0.5 truncate">{tutor.nameAr}</p>
                  </div>
                  <div className="text-start sm:text-end flex-shrink-0">
                    <p className="font-bold text-blue-600 text-base whitespace-nowrap-safe">{formatCurrency(tutor.hourlyRate)}</p>
                    <p className="text-gray-400 text-[10px] whitespace-nowrap-safe">{t('per hour', 'في الساعة')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mt-2">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star
                        key={j}
                        className={`w-3.5 h-3.5 ${j < Math.floor(tutor.rating) ? 'fill-yellow-400 text-yellow-400' : j < tutor.rating ? 'fill-yellow-200 text-yellow-300' : 'text-gray-200 fill-gray-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-gray-700">{tutor.rating}</span>
                  <span className="text-xs text-gray-400">({tutor.reviewCount} reviews)</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-gray-400 text-xs">
                    <Clock className="w-3 h-3" /> {tutor.responseTime}
                  </span>
                  <span className="flex items-center gap-1 text-gray-400 text-xs">
                    <Award className="w-3 h-3" /> {tutor.experienceYears}+ yrs
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {tutor.languages.map(l => (
                    <span key={l} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-lg font-semibold">{l}</span>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedTutor(tutor); nav('chat'); }}
                      className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-500 rounded-lg transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); toggleFav(tutor.id); }}
                      className={`p-1.5 rounded-lg transition-colors ${favorites.includes(tutor.id) ? 'bg-red-50 text-red-400' : 'bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-400'}`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${favorites.includes(tutor.id) ? 'fill-red-400' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-50 flex-wrap">
              {tutor.subjects.slice(0, 3).map(s => (
                <span key={s} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">{s}</span>
              ))}
              {tutor.subjects.length > 3 && (
                <span className="text-[10px] text-gray-400 font-medium">+{tutor.subjects.length - 3} more</span>
              )}
              <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${tutor.isOnline ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                {tutor.isOnline ? '● Online' : '○ Offline'}
              </span>
            </div>
          </button>
        ))
        )}
      </div>
    </div>
  );

  if (screen === 'tutor-profile' && selectedTutor) return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="bg-gray-900 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => nav('tutors')} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex gap-2">
            <button onClick={() => toggleFav(selectedTutor.id)} className={`p-2 rounded-xl transition-colors ${favorites.includes(selectedTutor.id) ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'}`}>
              <Heart className={`w-5 h-5 ${favorites.includes(selectedTutor.id) ? 'text-white fill-white' : 'text-white'}`} />
            </button>
          </div>
        </div>
        <div className="flex items-start gap-4">
          <div className="relative">
            <img src={selectedTutor.avatarUrl} alt={selectedTutor.name} className="w-20 h-20 rounded-2xl object-cover border-2 border-white/20"
              onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedTutor.name}&background=3B82F6&color=fff&size=200`; }} />
            {selectedTutor.isOnline && <span className="absolute bottom-1 right-1 w-4 h-4 bg-green-400 border-2 border-gray-900 rounded-full" />}
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-white text-xl">{selectedTutor.name}</h2>
            <p className="text-gray-300 text-sm font-cairo">{selectedTutor.nameAr}</p>
            {selectedTutor.isVerified && (
              <div className="flex items-center gap-1 mt-1">
                <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-blue-400 text-xs font-semibold">Verified Tutor</span>
              </div>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-yellow-400 text-sm font-bold">
                <Star className="w-4 h-4 fill-yellow-400" /> {selectedTutor.rating} ({selectedTutor.reviewCount})
              </span>
              <span className="text-gray-400 text-xs">• {selectedTutor.experienceYears}+ yrs exp</span>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-white text-2xl">{formatCurrency(selectedTutor.hourlyRate)}</p>
            <p className="text-gray-400 text-xs">{t('per hour', 'في الساعة')}</p>
          </div>

        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-28 -mt-3">
        <div className="bg-white rounded-t-3xl p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Students', value: `${selectedTutor.reviewCount}+`, icon: Users },
              { label: 'Response', value: selectedTutor.responseTime, icon: Clock },
              { label: 'Experience', value: `${selectedTutor.experienceYears} yrs`, icon: Award },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-gray-50 rounded-2xl p-3 text-center">
                <Icon className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                <p className="font-bold text-gray-800 text-sm">{value}</p>
                <p className="text-[10px] text-gray-400">{label}</p>
              </div>
            ))}
          </div>
          <TutorVideoIntro videoUrl={selectedTutor.videoUrl} tutorName={selectedTutor.name} language={language} />
          <div>
            <h3 className="font-bold text-gray-900 mb-2">About</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{selectedTutor.bio}</p>
            {selectedTutor.bioAr && (
              <p className="text-sm text-gray-500 leading-relaxed mt-2 font-cairo text-right" dir="rtl">{selectedTutor.bioAr}</p>
            )}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-2">Subjects</h3>
            <div className="flex flex-wrap gap-2">
              {selectedTutor.subjects.map(s => (
                <span key={s} className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full">{s}</span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-2">Languages</h3>
            <div className="flex gap-2">
              {selectedTutor.languages.map(l => (
                <span key={l} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full">
                  <Globe className="w-3 h-3" /> {l}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-2">Availability</h3>
            <div className="space-y-2">
              {tutorSchedule.map(slot => {
                const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                const dayIdx = dayToNumber(slot.dayOfWeek);
                return (
                  <div key={slot.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                    <span className="text-sm font-medium text-gray-700">{t(DAYS_EN[dayIdx], DAYS_AR[dayIdx])}</span>
                    <span className="text-sm text-gray-500">{slot.startTime ? String(slot.startTime).slice(0, 5) : '09:00'} – {slot.endTime ? String(slot.endTime).slice(0, 5) : '10:00'}</span>
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">{t('Available', 'متاح')}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-3">Reviews ({selectedTutor.reviewCount})</h3>
            <div className="space-y-3">
              {[
                { name: 'Ali Hassan', rating: 5, text: 'Excellent teacher! Very patient and explains concepts clearly.', avatar: 'A' },
                { name: 'Sara Al-Mansouri', rating: 5, text: 'I improved so much in just a few sessions. Highly recommended!', avatar: 'S' },
                { name: 'Khalid', rating: 4, text: 'Very knowledgeable and professional. Great experience overall.', avatar: 'K' },
              ].map((r, i) => (
                <div key={i} className="bg-gray-50 rounded-2xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-bold`}>
                      {r.avatar}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{r.name}</p>
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <Star key={j} className={`w-3 h-3 ${j < r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-100 p-4 flex gap-3">
        <button
          onClick={() => { nav('chat'); }}
          className="flex-1 py-3 border border-blue-200 text-blue-600 rounded-xl font-semibold text-sm hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
        >
          <MessageSquare className="w-4 h-4" /> Message
        </button>
        <button
          onClick={() => nav('booking')}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Calendar className="w-4 h-4" /> Book Session
        </button>
      </div>
    </div>
  );

  if (screen === 'booking' && selectedTutor) return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={() => nav('tutor-profile')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="font-bold text-gray-900">Book a Session</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-slide-up pb-24">
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <img src={selectedTutor.avatarUrl} alt={selectedTutor.name} className="w-14 h-14 rounded-2xl object-cover"
            onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedTutor.name}&background=3B82F6&color=fff`; }} />
          <div>
            <p className="font-bold text-gray-800">{selectedTutor.name}</p>
            <p className="text-gray-400 text-xs font-cairo">{selectedTutor.nameAr}</p>
            <p className="font-bold text-blue-600 mt-0.5">{formatCurrency(selectedTutor.hourlyRate)}/{t('hr', 'ساعة')}</p>
          </div>
        </div>
        <MultiSlotCalendar
          schedule={tutorSchedule}
          hourlyRate={selectedTutor.hourlyRate}
          language={language}
          selected={selectedSlots}
          onChange={(slots) => { setSelectedSlots(slots); setBookingError(null); }}
          bookedSessions={tutorBookedSessions}
          tutorId={selectedTutor.id}
        />

        {bookingError && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-semibold rounded-2xl p-4">
            {bookingError}
          </div>
        )}
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <h3 className="font-semibold text-blue-800 mb-3">{t('Booking Summary', 'ملخص الحجز')}</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-blue-600">{t('Tutor', 'الأستاذ')}</span>
              <span className="font-semibold text-blue-800">{selectedTutor.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-600">{t('Sessions', 'عدد الحصص')}</span>
              <span className="font-semibold text-blue-800">{selectedSlots.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-600">{t('Duration per session', 'مدة كل حصة')}</span>
              <span className="font-semibold text-blue-800">{t('60 minutes', '60 دقيقة')}</span>
            </div>
            <div className="border-t border-blue-200 pt-2 mt-2 flex justify-between">
              <span className="font-bold text-blue-800">{t('Total credits', 'إجمالي الرصيد المطلوب')}</span>
              <span className="font-bold text-blue-800 text-lg">{selectedSlots.reduce((s, x) => s + x.creditCost, 0)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-100 p-4">
        <button
          onClick={() => nav('payment')}
          disabled={selectedSlots.length === 0}
          className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t(`Continue to Payment (${selectedSlots.length} sessions) →`, `متابعة للدفع (${selectedSlots.length} حصص) ←`)}
        </button>
      </div>
    </div>
  );

  if (screen === 'payment' && selectedTutor) return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={() => nav('booking')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="font-bold text-gray-900">Payment</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-slide-up pb-24">
        <div className="flex gap-2">
          {([
            { id: 'card', label: 'Card', Icon: CreditCard },
            { id: 'paypal', label: 'PayPal', Icon: Wallet },
            { id: 'apple', label: 'Apple Pay', Icon: Apple },
          ] as const).map(({ id: m, label, Icon }) => (
            <button
              key={m}
              onClick={() => setPaymentMethod(m)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                paymentMethod === m ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-500'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" /> {label}
              </span>
            </button>
          ))}
        </div>

        {paymentMethod === 'card' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4 animate-slide-up">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Card Number</label>
              <input placeholder="1234 5678 9012 3456" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Expiry</label>
                <input placeholder="MM/YY" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">CVV</label>
                <input placeholder="123" type="password" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Cardholder Name</label>
              <input placeholder="John Smith" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
            </div>
          </div>
        )}

        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          {[
            { label: t(`Sessions (${selectedSlots.length})`, `الحصص (${selectedSlots.length})`), value: formatCurrency(selectedSlots.length * selectedTutor.hourlyRate) },
            { label: t('Platform Fee (5%)', 'رسوم المنصة (5%)'), value: formatCurrency(selectedSlots.length * selectedTutor.hourlyRate * 0.05) },
            { label: t('Total', 'الإجمالي'), value: formatCurrency(selectedSlots.length * selectedTutor.hourlyRate * 1.05), bold: true },
          ].map(({ label, value, bold }) => (
            <div key={label} className={`flex justify-between py-1.5 ${bold ? 'border-t border-blue-200 mt-1 pt-2.5' : ''}`}>
              <span className={`text-sm ${bold ? 'font-bold text-blue-900' : 'text-blue-600'}`}>{label}</span>
              <span className={`text-sm ${bold ? 'font-bold text-blue-900 text-lg' : 'font-semibold text-blue-800'}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-100 p-4">
        <button
          onClick={confirmBooking}
          className="w-full py-3.5 bg-green-500 text-white rounded-xl font-bold text-sm hover:bg-green-600 shadow-lg shadow-green-200 transition-all active:scale-95"
        >
          {t('Pay', 'ادفع')} {formatCurrency(selectedSlots.length * selectedTutor.hourlyRate * 1.05)} →
        </button>
      </div>
    </div>
  );

  if (screen === 'success') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="text-center animate-bounce-in">
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('Booking Confirmed!', 'تم تاكيد الحجز!')}</h2>
        <p className="text-gray-500 mb-1">{t('Your sessions with', 'تم تأكيد حصصك مع')} <strong>{selectedTutor?.name}</strong>{t(' are confirmed.', '.')}</p>
        <p className="text-gray-400 text-sm">{lastBooking.length} {t('sessions booked', 'حصة محجوزة')}</p>
        <div className="mt-6 bg-white rounded-2xl p-4 shadow-sm text-left space-y-2 max-h-56 overflow-y-auto">
          {lastBooking.map(s => (
            <div key={s.id} className="flex justify-between text-sm">
              <span className="text-gray-400">{s.date}</span>
              <span className="font-semibold text-gray-800">{s.startTime} – {s.endTime}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
            <span className="text-gray-400">{t('Total Paid', 'إجمالي المدفوع')}</span>
            <span className="font-semibold text-gray-800">{formatCurrency(lastBooking.length * (selectedTutor?.hourlyRate || 0) * 1.05)}</span>
          </div>

        </div>
        <button onClick={() => { nav('home'); setActiveNav('home'); }} className="mt-6 w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all">
          Back to Home
        </button>
      </div>
    </div>
  );

  if (screen === 'chat' && selectedTutor) return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl border-x border-slate-100">
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('tutor-profile')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="relative">
            <img src={selectedTutor.avatarUrl} alt={selectedTutor.name} className="w-10 h-10 rounded-xl object-cover border border-slate-100"
              onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedTutor.name}&background=3B82F6&color=fff`; }} />
            {selectedTutor.isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />}
          </div>
          <div>
            <p className="font-bold text-gray-800 text-sm">{selectedTutor.name}</p>
            <p className="text-xs text-green-500 font-medium">{selectedTutor.isOnline ? t('Online now', 'متصل الآن') : t('Offline', 'غير متصل')}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {realMessages.length === 0 ? (
          <div className="text-center py-12 text-gray-400 space-y-2">
            <MessageSquare className="w-10 h-10 mx-auto text-gray-300" />
            <p className="text-xs font-semibold">{t('No messages yet', 'لا توجد رسائل بعد')}</p>
            <p className="text-[11px]">{t('Send a message to start your conversation with the teacher.', 'أرسل رسالة للبدء بالمحادثة مع الأستاذ.')}</p>
          </div>
        ) : (
          realMessages.map((msg) => {
            const isMe = msg.sender_id === user.id;
            const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                {!isMe && (
                  <img src={selectedTutor.avatarUrl} alt="" className="w-7 h-7 rounded-lg object-cover mr-2 mt-auto flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedTutor.name}&background=3B82F6&color=fff`; }} />
                )}
                <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-md shadow-md shadow-blue-200'
                      : 'bg-white text-gray-800 rounded-bl-md shadow-sm border border-slate-100'
                  }`}>
                    {msg.content}
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] text-gray-400 mt-1 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <span>{timeStr}</span>
                    {isMe && (
                      <span className="font-bold">
                        {msg.is_read || msg.status === 'read' ? (
                          <span className="text-blue-500 font-extrabold">✓✓</span>
                        ) : msg.status === 'delivered' ? (
                          <span className="text-slate-400">✓✓</span>
                        ) : (
                          <span className="text-slate-400">✓</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-100 p-3 flex gap-2 z-20">
        <input
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder={t('Type a message to teacher...', 'اكتب رسالة للمعلم...')}
          className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 text-sm focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all border border-transparent focus:border-blue-200"
        />
        <button
          onClick={sendMessage}
          disabled={!chatInput.trim()}
          className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-200"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (screen === 'meeting' && liveRoomId) return (
    <LiveMeetingRoom
      roomId={liveRoomId}
      userName={studentName}
      userId={user.id}
      isTutor={false}
      language={language}
      onClose={() => {
        setLiveRoomId(null);
        nav('home');
      }}
    />
  );

  return null;
}

function NavIconHome({ active, isDark }: { active: boolean; isDark: boolean }) {
  const stroke = active ? (isDark ? '#3B82F6' : '#2563EB') : (isDark ? '#94A3B8' : '#64748B');
  const fill = active ? (isDark ? '#1E3A8A' : '#EFF6FF') : (isDark ? '#111827' : '#FFFFFF');
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10.5L12 4L20 10.5" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 9.8V19.25C6.5 19.6642 6.83579 20 7.25 20H16.75C17.1642 20 17.5 19.6642 17.5 19.25V9.8" fill={fill} stroke={stroke} strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M10 20V14.75C10 14.3358 10.3358 14 10.75 14H13.25C13.6642 14 14 14.3358 14 14.75V20" stroke={stroke} strokeWidth="1.9" strokeLinejoin="round" />
    </svg>
  );
}

function NavIconProgress({ active, isDark }: { active: boolean; isDark: boolean }) {
  const stroke = active ? (isDark ? '#3B82F6' : '#2563EB') : (isDark ? '#94A3B8' : '#64748B');
  const bar1 = active ? (isDark ? '#1E3A8A' : '#BFDBFE') : (isDark ? '#334155' : '#CBD5E1');
  const bar2 = active ? (isDark ? '#3B82F6' : '#60A5FA') : (isDark ? '#475569' : '#94A3B8');
  const bar3 = active ? (isDark ? '#60A5FA' : '#2563EB') : (isDark ? '#64748B' : '#64748B');
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19.25H20" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <rect x="5" y="12" width="3.25" height="6.25" rx="1.4" fill={bar1} />
      <rect x="10.4" y="9" width="3.25" height="9.25" rx="1.4" fill={bar2} />
      <rect x="15.8" y="5.5" width="3.25" height="12.75" rx="1.4" fill={bar3} />
      <path d="M5.8 11L11.9 7.8L17.4 4.9" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17.4" cy="4.9" r="1.4" fill={stroke} />
    </svg>
  );
}

function NavIconSchedule({ active, isDark }: { active: boolean; isDark: boolean }) {
  const stroke = active ? (isDark ? '#3B82F6' : '#2563EB') : (isDark ? '#94A3B8' : '#64748B');
  const fill = active ? (isDark ? '#1E3A8A' : '#EFF6FF') : (isDark ? '#111827' : '#FFFFFF');
  const top = active ? (isDark ? '#2563EB' : '#DBEAFE') : (isDark ? '#1E293B' : '#F1F5F9');
  const dot = active ? (isDark ? '#3B82F6' : '#2563EB') : (isDark ? '#64748B' : '#94A3B8');
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="3" fill={fill} stroke={stroke} strokeWidth="1.8" />
      <path d="M4 9H20" stroke={stroke} strokeWidth="1.6" />
      <rect x="4" y="5" width="16" height="4.5" rx="3" fill={top} />
      <path d="M8 3.5V6.5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 3.5V6.5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="13" r="1.1" fill={dot} />
      <circle cx="12.5" cy="13" r="1.1" fill={dot} opacity="0.9" />
      <circle cx="16" cy="13" r="1.1" fill={dot} opacity="0.7" />
      <circle cx="9" cy="16.5" r="1.1" fill={dot} opacity="0.65" />
      <circle cx="12.5" cy="16.5" r="1.1" fill={dot} opacity="0.5" />
      <circle cx="16" cy="16.5" r="1.15" fill={active ? '#3B82F6' : (isDark ? '#94A3B8' : '#64748B')} />
    </svg>
  );
}

function NavIconProfile({ active, isDark }: { active: boolean; isDark: boolean }) {
  const stroke = active ? (isDark ? '#3B82F6' : '#2563EB') : (isDark ? '#94A3B8' : '#64748B');
  const fill = active ? (isDark ? '#1E3A8A' : '#EFF6FF') : (isDark ? '#111827' : '#FFFFFF');
  const skin = active ? (isDark ? '#2563EB' : '#BFDBFE') : (isDark ? '#1E293B' : '#E2E8F0');
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" fill={fill} stroke={stroke} strokeWidth="1.8" />
      <circle cx="12" cy="10" r="3.3" fill={skin} stroke={stroke} strokeWidth="1.5" />
      <path d="M7.5 18.2C8.3 15.9 10 14.8 12 14.8C14 14.8 15.7 15.9 16.5 18.2" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
      {active && <circle cx="17.7" cy="6.3" r="1.7" fill={isDark ? '#3B82F6' : '#2563EB'} />}
    </svg>
  );
}

function BottomNav({ active, onChange, language, isDark }: {
  active: string;
  onChange: (n: 'home' | 'dashboard' | 'schedule' | 'profile') => void;
  language: 'en' | 'ar' | 'fr';
  onLogout?: () => void;
  isDark?: boolean;
}) {
  const tabs = [
    { id: 'home',      label: 'Home',     labelAr: 'الرئيسية', Icon: NavIconHome },
    { id: 'dashboard', label: 'Progress', labelAr: 'التقدم',   Icon: NavIconProgress },
    { id: 'schedule',  label: 'Schedule', labelAr: 'المواعيد', Icon: NavIconSchedule },
    { id: 'profile',   label: 'Profile',  labelAr: 'الملف',    Icon: NavIconProfile },
  ];

  return (
    <div className="sticky bottom-0 z-30 px-3 pb-3 pt-1 bg-transparent pointer-events-none">
      <div className="grid grid-cols-4 gap-1.5 max-w-lg mx-auto rounded-[26px] glass-nav-bar px-2 py-1.5 pointer-events-auto transition-all duration-300">
        {tabs.map(({ id, label, labelAr, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id as any)}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-[20px] px-1 py-1.5 glass-nav-item touch-manipulation select-none ${
                isActive ? 'glass-nav-active-pill scale-[1.03]' : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40 active:scale-95'
              }`}
            >
              {isActive && (
                <div className="absolute inset-0 rounded-[20px] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition-all duration-300" />
              )}
              <div
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-xl transition-all duration-300 ${
                  isActive
                    ? 'text-white scale-110'
                    : 'text-slate-400 dark:text-slate-400'
                }`}
              >
                <Icon active={isActive} isDark={Boolean(isDark)} />
              </div>
              <span
                className={`relative z-10 text-[10px] font-bold tracking-tight transition-all duration-300 ${
                  isActive ? 'text-white font-extrabold' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {language === 'en' ? label : labelAr}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

