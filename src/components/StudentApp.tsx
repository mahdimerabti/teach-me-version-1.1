import React, { useEffect, useRef, useState } from 'react';
import { makeT, tr as trL, formatUnit as fmtUnit, formatClock as fmtClock, formatDate as fmtDate, formatDateTime as fmtDateTime, formatTime as fmtTime, formatNumber as fmtNumber } from '../i18n';
import {
  BookOpen, Search, Bell, User, ChevronRight, Star, Clock,
  MessageSquare, Calendar, TrendingUp, LogOut, Video,
  ArrowLeft, Globe, Check, CheckCheck, CheckCircle, Send, KeyRound,
  Award, Zap, X, Heart, Users, Shield, BookMarked, Mail,
  GraduationCap, Palette, FlaskConical, Music, Briefcase, HeartPulse, Target,
  Flame, Trophy, Lightbulb, Languages, Moon, Sun,
  CircleCheck, CreditCard, Wallet, Apple, UserPlus, UserCheck, BellRing
} from 'lucide-react';
import { categories, subjects, tutors, getSubjectsByCategory, getLevelsBySubject, type Category, type Subject, type Level, type Tutor } from '../lib/db';
import MultiSlotCalendar, { dayToNumber } from './booking/MultiSlotCalendar';
import TutorVideoIntro from './TutorVideoIntro';
import PackagesScreen from './PackagesScreen';
import CreditHistoryScreen from './CreditHistoryScreen';
import JoinSessionButton from './JoinSessionButton';
import LiveMeetingRoom from './LiveMeetingRoom';
import LiveClassCard from './LiveClassCard';
import { addSessionsRemote, useBookedSessions, convertDbTimeToFrontend, type BookedSession, type SelectedSlot } from '../lib/bookingsStore';
import { claimFreeTrialCredits, spendTrialCreditForLiveJoin } from '../lib/credits';
import { FREE_TRIAL_INITIAL_CREDITS, PAID_PLANS_ENABLED } from '../lib/config';
import { supabase } from '../lib/supabase';
import { sanitizeExternalUrl, isValidUuid } from '../lib/security';
import {
  enableWebPushNotifications,
  getPushStatus,
  type PushSupportStatus
} from '../lib/pushNotifications';
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
  initialRoomId?: string | null;
  onConsumeInitialRoom?: () => void;
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

export default function StudentApp({ user, onLogout, language, onChangeLanguage, onOpenSetPassword, initialRoomId, onConsumeInitialRoom }: StudentAppProps) {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);
  const [selectedTutor, setSelectedTutor] = useState<Tutor | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('Top Rated');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all');
  const [joiningLiveTutorId, setJoiningLiveTutorId] = useState<string | null>(null);
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

  const PUBLIC_TUTOR_FIELDS =
    'id, user_id, name, name_ar, bio, bio_ar, subjects, hourly_rate, rating, review_count, students_count, experience_years, languages, avatar_url, video_url, is_online, is_live, active_session_url, active_session_subject, live_started_at, is_verified, status, category, created_at';

  const FALLBACK_TUTOR_FIELDS =
    'id, user_id, name, name_ar, bio, bio_ar, subjects, hourly_rate, rating, review_count, experience_years, languages, avatar_url, video_url, is_online, is_live, active_session_url, active_session_subject, live_started_at, is_verified, status, category, created_at';

  const fetchApprovedTutors = async () => {
    let rows: any[] | null = null;
    const { data: viewData, error: viewErr } = await supabase
      .from('approved_tutors_public')
      .select(PUBLIC_TUTOR_FIELDS);

    if (!viewErr && viewData) {
      rows = viewData;
    } else {
      const { data, error } = await supabase
        .from('tutors')
        .select(FALLBACK_TUTOR_FIELDS)
        .eq('status', 'approved');
      if (!error && data) rows = data;
    }

    if (rows) {
      const mapped: Tutor[] = rows.map(t => {
        const revCount = Number(t.review_count || 0);
        const realRating = revCount > 0 && t.rating != null ? Number(t.rating) : null;
        return {
          id: t.id,
          user_id: t.user_id,
          name: t.name,
          nameAr: t.name_ar || t.name,
          bio: t.bio || '',
          bioAr: t.bio_ar || '',
          subjects: parseSubjects(t.subjects),
          hourlyRate: t.hourly_rate != null && Number(t.hourly_rate) > 0 ? Number(t.hourly_rate) : 0,
          rating: realRating,
          reviewCount: revCount,
          studentsCount: Number(t.students_count || 0),
          experienceYears: t.experience_years != null && Number(t.experience_years) > 0 ? Number(t.experience_years) : 0,
          languages: parseSubjects(t.languages),
          avatarUrl: t.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name || 'Tutor')}&background=2563EB&color=fff&size=150`,
          videoUrl: t.video_url || undefined,
          isOnline: Boolean(t.is_live && t.active_session_url),
          isLive: Boolean(t.is_live && t.active_session_url),
          activeSessionUrl: t.active_session_url || null,
          activeSessionSubject: t.active_session_subject || null,
          responseTime: null,
          isVerified: Boolean(t.is_verified),
          category: t.category || '',
          levelId: 'elementary-grade-5',
          schedule: []
        };
      });

      const dbIds = new Set(mapped.map(m => m.id));
      const combined = [...mapped, ...tutors.filter(st => !dbIds.has(st.id))];
      setTutorsList(combined);
      setSelectedTutor(prev => (prev ? combined.find(item => item.id === prev.id) || prev : null));
    }
  };

  const handleJoinLiveTutorSession = async (tutor: Tutor) => {
    if (!tutor.activeSessionUrl) return;
    setJoiningLiveTutorId(tutor.id);
    try {
      let spendRes = await spendTrialCreditForLiveJoin(tutor.id, 1);

      // In Free Trial mode, auto-top-up starter/refill credits if student has 0 credits
      if (!spendRes.ok && spendRes.error === 'insufficient_credits' && !PAID_PLANS_ENABLED) {
        const claim = await claimFreeTrialCredits(FREE_TRIAL_INITIAL_CREDITS);
        if (claim.ok && claim.balance > 0) {
          spendRes = await spendTrialCreditForLiveJoin(tutor.id, 1);
        }
      }

      if (!spendRes.ok && spendRes.error === 'insufficient_credits') {
        nav('packages');
        return;
      }

      const target = tutor.activeSessionUrl.trim();
      const safeExternal = sanitizeExternalUrl(target);
      if (safeExternal) {
        window.open(safeExternal, '_blank', 'noopener,noreferrer');
      } else if (/^[A-Za-z0-9_-]{3,100}$/.test(target)) {
        setLiveRoomId(target);
        nav('meeting');
      }
    } finally {
      setJoiningLiveTutorId(null);
    }
  };

  useEffect(() => {
    if (initialRoomId) {
      setLiveRoomId(initialRoomId);
      setScreen('meeting');
      onConsumeInitialRoom?.();
    }
  }, [initialRoomId]);

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

    const onFocus = () => fetchApprovedTutors();
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (screen === 'tutors' || screen === 'home') {
      fetchApprovedTutors();
    }
  }, [screen]);

  const [tutorReviews, setTutorReviews] = useState<Array<{
    id: string;
    tutor_id: string;
    student_id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    reviewer_name: string;
  }>>([]);
  const [canReviewSelectedTutor, setCanReviewSelectedTutor] = useState(false);
  const [profileReviewRating, setProfileReviewRating] = useState(0);
  const [profileReviewComment, setProfileReviewComment] = useState('');
  const [submittingProfileReview, setSubmittingProfileReview] = useState(false);
  const [profileReviewError, setProfileReviewError] = useState<string | null>(null);

  const loadSelectedTutorReviews = async (tutorId: string) => {
    const [{ data: revData }, { data: eligible }] = await Promise.all([
      supabase.rpc('get_tutor_reviews', { p_tutor_id: tutorId }),
      supabase.rpc('can_i_review_tutor', { p_tutor_id: tutorId })
    ]);
    const list = Array.isArray(revData) ? revData : [];
    setTutorReviews(list);
    setCanReviewSelectedTutor(Boolean(eligible));
    const myExisting = list.find((r: any) => r.student_id === user.id);
    if (myExisting) {
      setProfileReviewRating(myExisting.rating);
      setProfileReviewComment(myExisting.comment || '');
    } else {
      setProfileReviewRating(0);
      setProfileReviewComment('');
    }
    setProfileReviewError(null);
  };

  const handleSubmitProfileReview = async () => {
    if (!selectedTutor || !user?.id || profileReviewRating < 1 || profileReviewRating > 5) return;
    setSubmittingProfileReview(true);
    setProfileReviewError(null);
    try {
      const { error } = await supabase
        .from('reviews')
        .upsert(
          {
            tutor_id: selectedTutor.id,
            student_id: user.id,
            rating: profileReviewRating,
            comment: profileReviewComment.trim() || null,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'tutor_id,student_id' }
        );
      if (error) throw error;
      await Promise.all([loadSelectedTutorReviews(selectedTutor.id), fetchApprovedTutors()]);
    } catch (err: any) {
      setProfileReviewError(err?.message || 'Unable to submit review.');
    } finally {
      setSubmittingProfileReview(false);
    }
  };

  useEffect(() => {
    if (!selectedTutor) return;
    setTutorSchedule([]);
    setTutorBookedSessions([]);
    setTutorReviews([]);
    setCanReviewSelectedTutor(false);

    loadSelectedTutorReviews(selectedTutor.id);

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
  }, [selectedTutor?.id]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [realMessages, setRealMessages] = useState<DBMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [chatViewportHeight, setChatViewportHeight] = useState<number | null>(null);

  // Auto-scroll chat to newest message
  useEffect(() => {
    if (screen === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [screen, realMessages.length]);

  // Keep chat input visible above virtual keyboard using visualViewport
  useEffect(() => {
    if (screen !== 'chat' || typeof window === 'undefined' || !window.visualViewport) {
      setChatViewportHeight(null);
      return;
    }
    const vv = window.visualViewport;
    const handleResize = () => {
      setChatViewportHeight(Math.round(vv.height));
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      }, 60);
    };
    handleResize();
    vv.addEventListener('resize', handleResize);
    vv.addEventListener('scroll', handleResize);
    return () => {
      vv.removeEventListener('resize', handleResize);
      vv.removeEventListener('scroll', handleResize);
      setChatViewportHeight(null);
    };
  }, [screen]);

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
  const [notificationsList, setNotificationsList] = useState<Array<{
    id: string;
    title: string;
    title_ar?: string | null;
    body: string;
    body_ar?: string | null;
    kind: string;
    room_id?: string | null;
    tutor_id?: string | null;
    is_read: boolean;
    created_at: string;
  }>>([]);
  const [liveToast, setLiveToast] = useState<{
    id: string;
    title: string;
    body: string;
    roomId?: string | null;
    tutorId?: string | null;
  } | null>(null);
  const [followedTutorIds, setFollowedTutorIds] = useState<string[]>([]);
  const [followLoadingId, setFollowLoadingId] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<PushSupportStatus>('supported');
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [profileBackScreen, setProfileBackScreen] = useState<Screen>('tutors');

  const openTutorProfile = (tutor: Tutor, from: Screen = 'tutors') => {
    setSelectedTutor(tutor);
    setProfileBackScreen(from);
    setScreen('tutor-profile');
  };

  // Load real notifications, follows, push status, and subscribe to Realtime notifications
  useEffect(() => {
    if (!user?.id) return;

    const loadNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, title, title_ar, body, body_ar, kind, room_id, tutor_id, is_read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (data) setNotificationsList(data);
    };

    const loadFollows = async () => {
      const { data } = await supabase
        .from('student_follows')
        .select('tutor_id')
        .eq('student_id', user.id);
      if (data) {
        setFollowedTutorIds(data.map((r: any) => r.tutor_id).filter(Boolean));
      }
    };

    loadNotifications();
    loadFollows();
    getPushStatus().then(setPushStatus).catch(() => setPushStatus('unsupported'));

    const notifChannel = supabase
      .channel(`student-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as any;
          if (!n?.id) return;
          setNotificationsList(prev => (prev.some(x => x.id === n.id) ? prev : [n, ...prev]));
          setLiveToast({
            id: n.id,
            title: language === 'ar' && n.title_ar ? n.title_ar : n.title,
            body: language === 'ar' && n.body_ar ? n.body_ar : n.body,
            roomId: n.room_id || null,
            tutorId: n.tutor_id || null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
    };
  }, [user?.id, language]);

  const unreadNotifCount = notificationsList.filter(n => !n.is_read).length;

  const markNotificationRead = async (notifId: string) => {
    setNotificationsList(prev => prev.map(n => (n.id === notifId ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
  };

  const markAllNotificationsRead = async () => {
    setNotificationsList(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
  };

  const handleOpenNotification = async (n: { id: string; room_id?: string | null; tutor_id?: string | null; kind?: string }) => {
    await markNotificationRead(n.id);
    setShowNotifications(false);
    setLiveToast(null);
    if (n.room_id) {
      const target = n.room_id.trim();
      const safeExternal = sanitizeExternalUrl(target);
      if (safeExternal) {
        window.open(safeExternal, '_blank', 'noopener,noreferrer');
      } else if (/^[A-Za-z0-9_-]{3,100}$/.test(target)) {
        setLiveRoomId(target);
        nav('meeting');
      }
      return;
    }
    if (n.tutor_id) {
      const found = tutorsList.find(tut => tut.id === n.tutor_id);
      if (found) {
        if (found.isLive && found.activeSessionUrl) {
          handleJoinLiveTutorSession(found);
        } else {
          openTutorProfile(found, 'home');
        }
      }
    }
  };

  const toggleFollowTutor = async (tutorId: string) => {
    if (!user?.id || followLoadingId) return;
    setFollowLoadingId(tutorId);
    const isFollowing = followedTutorIds.includes(tutorId);
    try {
      if (isFollowing) {
        await supabase
          .from('student_follows')
          .delete()
          .eq('student_id', user.id)
          .eq('tutor_id', tutorId);
        setFollowedTutorIds(prev => prev.filter(id => id !== tutorId));
      } else {
        const { error } = await supabase
          .from('student_follows')
          .insert({ student_id: user.id, tutor_id: tutorId });
        if (!error) {
          setFollowedTutorIds(prev => [...prev, tutorId]);
        }
      }
    } finally {
      setFollowLoadingId(null);
    }
  };

  const handleEnablePush = async () => {
    setPushFeedback(null);
    const res = await enableWebPushNotifications(user.id);
    setPushStatus(res.status);
    if (res.ok) {
      setPushFeedback(t('Push notifications enabled!', 'تم تفعيل إشعارات المتصفح بنجاح!', 'Notifications push activées !'));
    } else if (res.message) {
      setPushFeedback(res.message);
    }
  };
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

  const t = makeT(language);

  const formatCurrency = (val: number) => {
    const amountDzd = val > 200 ? Math.round(val) : Math.round(val * 200);
    return `${fmtNumber(language, amountDzd)} ${t('DZD', 'د.ج', 'DA')}`;
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

  // Normalize teacher registration categories to Student catalog category IDs
  const normalizeTutorCategoryToId = (rawCategory?: string): string[] => {
    const c = (rawCategory || '').trim().toLowerCase();
    if (!c) return [];
    const ids: string[] = [];
    if (c.includes('school') || c.includes('المدرسي') || c.includes('elementary') || c.includes('middle') || c.includes('high')) ids.push('school');
    if (c.includes('university') || c.includes('الجامعي') || c.includes('science') || c.includes('engineering') || c.includes('business') || c.includes('health') || c.includes('medicine') || c.includes('law')) ids.push('university');
    if (c.includes('digital') || c.includes('creative') || c.includes('arts') || c.includes('music') || c.includes('design') || c.includes('programming')) ids.push('digital');
    if (c.includes('technology') || c.includes('finance') || c.includes('fintech') || c.includes('accounting') || c.includes('business')) ids.push('technology');
    if (c.includes('language') || c.includes('لغات')) ids.push('languages');
    if (c.includes('personal') || c.includes('development') || c.includes('life') || c.includes('health')) ids.push('personal');
    if (ids.length === 0) ids.push(c);
    return ids;
  };

  const isSubjectMatch = (tutorSubject: string, targetSubject: Subject): boolean => {
    if (!tutorSubject || !targetSubject) return false;
    const s = tutorSubject.trim().toLowerCase();
    const subName = targetSubject.name.trim().toLowerCase();
    const subNameAr = targetSubject.nameAr ? targetSubject.nameAr.trim().toLowerCase() : '';

    const cleanS = s.replace(/language|لغة|اللغة/gi, '').replace(/[أإآ]/g, 'ا').trim();
    const cleanSubName = subName.replace(/language/gi, '').trim();
    const cleanSubNameAr = subNameAr.replace(/لغة|اللغة/gi, '').replace(/[أإآ]/g, 'ا').trim();

    if (
      s === subName ||
      s === subNameAr ||
      s.includes(subName) ||
      subName.includes(s) ||
      (subNameAr !== '' && (s.includes(subNameAr) || subNameAr.includes(s))) ||
      (cleanS.length >= 3 && (cleanSubName.includes(cleanS) || cleanS.includes(cleanSubName))) ||
      (cleanS.length >= 3 && cleanSubNameAr.length >= 3 && (cleanSubNameAr.includes(cleanS) || cleanS.includes(cleanSubNameAr)))
    ) {
      return true;
    }

    // Also check if tutorSubject matches any level/course under this targetSubject
    // (e.g. teacher registered with "Mathematics" or "Python" or "Graphic Design" or "Accounting")
    const subLevels = getLevelsBySubject(targetSubject.id);
    if (
      subLevels.some(lvl => {
        const lName = lvl.name.trim().toLowerCase();
        const lNameAr = (lvl.nameAr || '').trim().toLowerCase();
        return (
          s === lName ||
          lName.includes(s) ||
          s.includes(lName) ||
          (lNameAr !== '' && (s.includes(lNameAr) || lNameAr.includes(s)))
        );
      })
    ) {
      return true;
    }

    // School-stage curriculum subjects (Mathematics, Physics, Chemistry, Biology, Arabic, French, English, History, Computer Science)
    if (targetSubject.categoryId === 'school') {
      const schoolCore = ['math', 'physics', 'chemistry', 'biology', 'arabic', 'french', 'english', 'history', 'geography', 'computer', 'islamic', 'philosophy', 'calculus', 'algebra', 'geometry'];
      if (schoolCore.some(k => s.includes(k))) return true;
    }

    // Technology & Finance subjects (Finance, Accounting, Economics, Mathematics, Business)
    if (targetSubject.categoryId === 'technology') {
      const techFinCore = ['finance', 'accounting', 'economics', 'fintech', 'blockchain', 'trading', 'banking'];
      if (techFinCore.some(k => s.includes(k))) return true;
    }

    return false;
  };

  const doesTutorMatchSubject = (tutor: Tutor, targetSubject: Subject): boolean => {
    const tutorSubjects = parseSubjects(tutor.subjects);
    if (tutorSubjects.some(ts => isSubjectMatch(ts, targetSubject))) return true;
    // Also match if the teacher registered directly under this subject's parent category
    const catIds = normalizeTutorCategoryToId(tutor.category);
    if (catIds.includes(targetSubject.categoryId)) return true;
    return false;
  };

  const getSubjectTutorCount = (sub: Subject): number => {
    return tutorsList.filter(tut => doesTutorMatchSubject(tut, sub)).length;
  };

  const getSubjectMinPrice = (sub: Subject): number => {
    const matched = tutorsList.filter(tut => doesTutorMatchSubject(tut, sub));
    if (matched.length === 0) return sub.minPrice || 15;
    return Math.min(...matched.map(tut => tut.hourlyRate));
  };

  const getLevelTutorCount = (_level: Level): number => {
    if (selectedSubject) {
      return tutorsList.filter(tut => doesTutorMatchSubject(tut, selectedSubject)).length;
    }
    return 0;
  };

  const getLevelPrice = (level: Level): number => {
    if (selectedSubject) {
      const matched = tutorsList.filter(tut => doesTutorMatchSubject(tut, selectedSubject));
      if (matched.length > 0) {
        return Math.min(...matched.map(tut => tut.hourlyRate));
      }
    }
    return level.price;
  };

  useEffect(() => {
    localStorage.setItem('tm_theme', themeMode);
    document.body.classList.toggle('theme-dark', themeMode === 'dark');
  }, [themeMode]);

  // Dark mode belongs to the student shell only; do not leak it into other roles after logout
  useEffect(() => () => { document.body.classList.remove('theme-dark'); }, []);

  const nav = (s: Screen) => setScreen(s);

  const confirmBooking = async () => {
    if (!selectedTutor || selectedSlots.length === 0) return;
    const subjectName = selectedLevel
      ? (trL(language, selectedLevel.name, selectedLevel.nameAr))
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
    const resolvedTutorId = sess?.tutorId;

    if (resolvedTutorId && isValidUuid(resolvedTutorId) && isValidUuid(user.id)) {
      try {
        await supabase.from('reviews').insert({
          tutor_id: resolvedTutorId,
          student_id: user.id,
          session_id: isValidUuid(reviewTarget.id) ? reviewTarget.id : null,
          rating: Math.max(1, Math.min(5, Math.round(reviewStars))),
          comment: reviewMessage.trim().slice(0, 1000)
        });
      } catch (_err) {
        // Trigger recomputes aggregate rating server-side; ignore duplicate session review
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

  // Clear the tapped-tile highlight whenever the user comes back to a tile grid
  useEffect(() => {
    if (screen === 'home' || screen === 'categories') setActiveCategoryCard('');
  }, [screen]);

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

  // Dynamic list of specialties/subjects available across approved tutors
  const availableSpecialties = Array.from(
    new Set(
      tutorsList
        .flatMap(tut => [
          ...(tut.category ? [tut.category.trim()] : []),
          ...parseSubjects(tut.subjects).map(s => s.trim())
        ])
        .filter(Boolean)
    )
  );

  const liveApprovedTutors = tutorsList.filter(tut => tut.isLive && tut.activeSessionUrl);

  const filteredTutors = (() => {
    const activeList = tutorsList.length > 0 ? tutorsList : tutors;
    let list = activeList.filter(tut => {
      const tutorSubjects = parseSubjects(tut.subjects);
      const tutorCategory = (tut.category || '').trim().toLowerCase();
      const matchesSubject = !selectedSubject || doesTutorMatchSubject(tut, selectedSubject);
      const matchesCategoryOnly =
        selectedSubject || !selectedCategory
          ? true
          : normalizeTutorCategoryToId(tut.category).includes(selectedCategory.id) ||
            tutorCategory.includes(selectedCategory.name.toLowerCase());
      const matchesSpecialty =
        specialtyFilter === 'all' ||
        (specialtyFilter === 'live' && Boolean(tut.isLive && tut.activeSessionUrl)) ||
        tutorCategory === specialtyFilter.toLowerCase() ||
        tutorSubjects.some(s => s.trim().toLowerCase() === specialtyFilter.toLowerCase());
      const matchesQuery = !q ||
        tut.name.toLowerCase().includes(q) ||
        (tut.nameAr && tut.nameAr.toLowerCase().includes(q)) ||
        tutorCategory.includes(q) ||
        (tut.bio && tut.bio.toLowerCase().includes(q)) ||
        tutorSubjects.some(s => s.toLowerCase().includes(q));
      return matchesSubject && matchesCategoryOnly && matchesSpecialty && matchesQuery;
    });
    if (filterType === 'Price') list = [...list].sort((a, b) => a.hourlyRate - b.hourlyRate);
    if (filterType === 'Experience') list = [...list].sort((a, b) => b.experienceYears - a.experienceYears);
    if (filterType === 'Top Rated') list = [...list].sort((a, b) => Number(Boolean(b.isLive)) - Number(Boolean(a.isLive)) || (b.rating ?? 0) - (a.rating ?? 0));
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
    <div className="min-h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col overflow-x-hidden">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20">
        <h1 className="font-bold text-gray-900">{t('My Dashboard', 'لوحتي', 'Mon tableau de bord')}</h1>
        <p className="text-xs text-gray-400 mt-0.5">{t('Track your learning progress', 'تابع تقدمك الدراسي', 'Suivez vos progrès')}</p>
      </div>
      <div className="flex-1 overflow-y-auto pb-20 p-4 space-y-4 animate-slide-up">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: t('Sessions Done', 'الجلسات المكتملة'), value: String(completedSessionsCount), icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: t('Hours Learned', 'ساعات التعلم'), value: fmtUnit(language, hoursLearned, 'hour'), icon: Clock, color: 'text-green-600', bg: 'bg-green-50' },
            { label: t('Streak', 'السلسلة اليومية'), value: fmtUnit(language, streakDays, 'day'), icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-50' },
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
    <div className="min-h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col overflow-x-hidden">
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
          {bookedSessions.filter(s => s.status === 'confirmed' || s.status === 'live').length === 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center text-sm text-gray-400">
              {t('No upcoming sessions yet. Book a tutor to get started!', 'لا توجد حصص قادمة بعد. احجز مع أستاذ للبدء!')}
            </div>
          )}
          {bookedSessions.filter(s => s.status === 'confirmed' || s.status === 'live').map((s) => (
            <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 card-hover hover-blue-card interactive-card">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="font-bold text-gray-800 text-sm truncate">{s.subject}</p>
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${
                      s.status === 'live'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {s.status === 'live' && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                      )}
                      {s.status === 'live' ? t('LIVE NOW', 'مباشر الآن', 'En direct') : t('confirmed', 'مؤكدة', 'confirmé')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{s.tutorName}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-blue-600 font-medium mt-1.5">
                    <span>{s.date}</span>
                    <span>•</span>
                    <span>{fmtClock(language, s.startTime)} – {fmtClock(language, s.endTime)}</span>
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
                        <span>{fmtClock(language, s.startTime)} – {fmtClock(language, s.endTime)}</span>
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
    <div className="min-h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col overflow-x-hidden text-left">
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
              { label: t('Hours', 'الساعات', 'Heures'), value: fmtUnit(language, hoursLearned, 'hour', 'short') },
              { label: t('Streak', 'الاستمرارية', 'Série'), value: fmtUnit(language, streakDays, 'day') },
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
                { label: t('Hours Learned', 'ساعات التعلم', 'Heures apprises'), value: fmtUnit(language, hoursLearned, 'hour'), icon: Clock, color: 'text-green-600', bg: 'bg-green-50' },
                { label: t('Streak', 'الاستمرارية', 'Série'), value: fmtUnit(language, streakDays, 'day'), icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-50' },
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

  const upcomingSession =
    bookedSessions.find(s => s.status === 'live') ||
    bookedSessions.find(s => s.status === 'confirmed');

  if (screen === 'home' && activeNav === 'home') return (
    <div className="min-h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col overflow-x-hidden">
      {upcomingSession && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-white animate-bounce shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">
                {t('Reminder: Upcoming Session!', 'تذكير: حصتك القادمة قريباً!')}
              </p>
              <p className="text-[10px] text-blue-100 truncate">
                {upcomingSession.tutorName} • {upcomingSession.subject} ({fmtDate(language, upcomingSession.date)} {fmtClock(language, upcomingSession.startTime)})
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
              aria-label={t('Change language', 'تغيير اللغة', 'Changer de langue')}
            >
              {language.toUpperCase()}
            </button>
            <button
              onClick={() => setThemeMode(prev => prev === 'light' ? 'dark' : 'light')}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label={t('Toggle theme', 'تبديل المظهر', 'Changer de thème')}
            >
              {themeMode === 'light' ? <Moon className="w-4 h-4 text-gray-600" /> : <Sun className="w-4 h-4 text-amber-500" />}
            </button>
            <button
              onClick={() => setShowNotifications(true)}
              className="relative p-2 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-gray-600" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </span>
              )}
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
                  <p className="text-sm font-semibold text-gray-800">{trL(language, cat.name, cat.nameAr)}</p>
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
                    <p className="text-sm font-semibold text-gray-800">{trL(language, subject.name, subject.nameAr)}</p>
                    <p className="text-xs text-gray-400">{parentCategory ? (trL(language, parentCategory.name, parentCategory.nameAr)) : t('Subject', 'مادة')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-600">{formatCurrency(subject.minPrice)}</p>
                    <p className="text-[10px] text-gray-400">{t('from', 'ابتداءً من')}</p>
                  </div>
                </button>
              );
            })}

            {filteredTutors.slice(0, 4).map(tut => (
              <button key={tut.id} onClick={() => { setSearchQuery(''); openTutorProfile(tut, 'home'); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 text-left"
              >
                <img src={tut.avatarUrl} alt={tut.name} className="w-9 h-9 rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${tut.name}&background=3B82F6&color=fff`; }} />
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-800">{tut.name}</p>
                  <p className="text-xs text-gray-400">{tut.subjects.slice(0, 2).join(', ')}</p>
                </div>
                <div className="ml-auto text-right">
                  {tut.hourlyRate > 0 && (
                    <p className="text-sm font-bold text-blue-600">{formatCurrency(tut.hourlyRate)}/{t('hr', 'ساعة')}</p>
                  )}
                  {tut.reviewCount > 0 && tut.rating != null && (
                    <p className="text-xs text-yellow-500">{tut.rating} / 5</p>
                  )}
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
              { label: t('Expert Tutors', 'مدرسين خبراء', 'Tuteurs experts'), value: tutorsList.length > 0 ? `${tutorsList.length}` : '0' },
              { label: t('Subjects', 'المواد', 'Matières'), value: `${subjects.length}+` },
              {
                label: t('Avg Rating', 'متوسط التقييم', 'Note moy.'),
                value: (() => {
                  const rated = tutorsList.filter(x => x.reviewCount > 0 && x.rating != null);
                  if (rated.length === 0) return '—';
                  return (rated.reduce((acc, curr) => acc + (curr.rating || 0), 0) / rated.length).toFixed(1);
                })()
              },
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
        {/* In-app Realtime Live-Class Toast */}
        {liveToast && (
          <div className="mx-4 mt-3 bg-white border border-blue-200 rounded-2xl p-3.5 shadow-md flex items-center justify-between gap-3 animate-slide-down">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                <BellRing className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 truncate">{liveToast.title}</p>
                <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{liveToast.body}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {liveToast.roomId && (
                <button
                  onClick={() => handleOpenNotification({ id: liveToast.id, room_id: liveToast.roomId, tutor_id: liveToast.tutorId })}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {t('Join', 'انضمام', 'Rejoindre')}
                </button>
              )}
              <button
                onClick={() => setLiveToast(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                aria-label={t('Dismiss notification', 'إغلاق الإشعار', 'Fermer la notification')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Active Live Classes (refined white cards with green pulsing dot & primary blue Join button) */}
        {liveApprovedTutors.length > 0 && (
          <div className="mx-4 mt-3 space-y-2.5">
            {liveApprovedTutors.map(liveTutor => (
              <LiveClassCard
                key={`live-banner-${liveTutor.id}`}
                tutorName={liveTutor.name}
                avatarUrl={liveTutor.avatarUrl}
                subject={liveTutor.activeSessionSubject || liveTutor.subjects[0] || liveTutor.category || t('Live Class', 'حصة مباشرة', 'Cours en direct')}
                joining={joiningLiveTutorId === liveTutor.id}
                onJoin={() => handleJoinLiveTutorSession(liveTutor)}
                onOpenProfile={() => openTutorProfile(liveTutor, 'home')}
                language={language}
              />
            ))}
          </div>
        )}

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
                  <p className={`font-bold text-base transition-colors ${isActive ? 'text-white' : 'text-gray-800'}`}>{trL(language, cat.name, cat.nameAr)}</p>
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
                  onClick={() => openTutorProfile(tutor, 'home')}
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
                    {tutor.isLive && (
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
                      {tutor.hourlyRate > 0 && (
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-blue-600">{formatCurrency(tutor.hourlyRate)}</p>
                          <p className="text-gray-400 text-[10px]">{t('per hour', 'في الساعة', 'par heure')}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {tutor.reviewCount > 0 && tutor.rating != null ? (
                        <>
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <Star key={j} className={`w-3 h-3 ${j < Math.floor(tutor.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 fill-gray-200'}`} />
                            ))}
                          </div>
                          <span className="text-xs font-bold text-gray-700">{tutor.rating}</span>
                          <span className="text-xs text-gray-400">({tutor.reviewCount})</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">{t('No reviews yet', 'لا توجد تقييمات بعد', 'Aucun avis')}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {tutor.isLive && tutor.activeSessionUrl && (
                        <span
                          onClick={e => { e.stopPropagation(); handleJoinLiveTutorSession(tutor); }}
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg shadow-sm cursor-pointer hover:bg-emerald-100 transition-colors"
                        >
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                          <Video className="w-3 h-3" /> {t('LIVE · Join Now', 'مباشر · انضم الآن', 'En direct · Rejoindre')}
                        </span>
                      )}
                      {tutor.languages.map(l => (
                        <span key={l} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-lg font-semibold">{l}</span>
                      ))}
                      {tutor.experienceYears > 0 && (
                        <span className="ml-auto text-[10px] text-gray-500 flex items-center gap-0.5">
                          <Award className="w-3 h-3" /> {t(`${tutor.experienceYears} yrs`, `${tutor.experienceYears} سنوات`, `${tutor.experienceYears} ans`)}
                        </span>
                      )}
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
        <div className="fixed inset-0 z-50 flex justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNotifications(false)} />
          <div className="relative w-full tm-app-shell bg-white rounded-b-3xl shadow-2xl overflow-hidden animate-slide-down self-start max-h-[90dvh] flex flex-col">
            <div className="bg-blue-600 px-5 pt-10 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-white text-lg">{t('Notifications', 'الإشعارات', 'Notifications')}</h2>
                  <p className="text-blue-100 text-xs mt-0.5">
                    {unreadNotifCount > 0
                      ? t(`${unreadNotifCount} unread alerts`, `${unreadNotifCount} إشعارات غير مقروءة`, `${unreadNotifCount} alertes non lues`)
                      : t('All caught up', 'لا توجد إشعارات جديدة', 'Tout est à jour')}
                  </p>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 bg-white/10 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BellRing className="w-4 h-4 text-blue-100 flex-shrink-0" />
                  <p className="text-[11px] text-blue-50 truncate">
                    {pushStatus === 'subscribed'
                      ? t('Browser push notifications active', 'إشعارات المتصفح مفعّلة', 'Notifications push actives')
                      : pushStatus === 'unsupported'
                      ? t('In-app live alerts active on this device', 'التنبيهات المباشرة داخل التطبيق مفعّلة', 'Alertes en direct actives dans l\'app')
                      : t('Get notified when teachers go live', 'استقبل تنبيهاً عند بدء الحصة المباشرة', 'Recevez une alerte quand un cours démarre')}
                  </p>
                </div>
                {pushStatus !== 'subscribed' && pushStatus !== 'unsupported' && (
                  <button
                    onClick={handleEnablePush}
                    className="px-2.5 py-1 bg-white text-blue-600 hover:bg-blue-50 rounded-lg text-[11px] font-bold flex-shrink-0 transition-colors"
                  >
                    {t('Enable', 'تفعيل', 'Activer')}
                  </button>
                )}
              </div>
              {pushFeedback && (
                <p className="text-[11px] text-blue-100 mt-2">{pushFeedback}</p>
              )}
            </div>
            <div className="divide-y divide-gray-100 max-h-[65vh] overflow-y-auto">
              {notificationsList.length === 0 ? (
                <div className="px-6 py-10 text-center space-y-2">
                  <Bell className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">
                    {t('No notifications yet', 'لا توجد إشعارات بعد', 'Aucune notification')}
                  </p>
                  <p className="text-xs text-slate-400">
                    {t('Follow teachers to be notified instantly when they start a live class.', 'تابع الأساتذة لتصلك إشعارات فورية فور بدئهم حصة مباشرة.', 'Suivez des enseignants pour être alerté dès le début d\'un cours en direct.')}
                  </p>
                </div>
              ) : (
                notificationsList.map(n => {
                  const isLiveNotif = n.kind === 'live_class';
                  const displayTitle = language === 'ar' && n.title_ar ? n.title_ar : n.title;
                  const displayBody = language === 'ar' && n.body_ar ? n.body_ar : n.body;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleOpenNotification(n)}
                      className={`w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-slate-50 transition-colors ${
                        !n.is_read ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isLiveNotif ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {isLiveNotif ? <Video className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-bold leading-snug ${!n.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                            {displayTitle}
                          </p>
                          {!n.is_read && (
                            <span className="w-2.5 h-2.5 bg-blue-600 rounded-full flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{displayBody}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-slate-400 font-medium">
                            {fmtDateTime(language, n.created_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isLiveNotif && n.room_id && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600">
                              <Video className="w-3 h-3" /> {t('Join Class', 'انضمام للحصة', 'Rejoindre')}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {notificationsList.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={markAllNotificationsRead}
                  className="w-full text-center text-sm font-semibold text-blue-600 hover:text-blue-700 py-1"
                >
                  {t('Mark all as read', 'تحديد الكل كمقروء', 'Tout marquer comme lu')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (screen === 'categories') return (
    <div className="min-h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col overflow-x-hidden">
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
              <p className={`font-bold text-base transition-colors ${isActive ? 'text-white' : 'text-gray-800'}`}>{trL(language, cat.name, cat.nameAr)}</p>
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
    <div className="min-h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col overflow-x-hidden">
      <div className="bg-white border-b border-gray-100 px-5 py-5 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={() => nav('home')} className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="font-bold text-gray-900 text-lg">{trL(language, selectedCategory.name, selectedCategory.nameAr)}</h1>
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
              className={`w-full rounded-2xl p-4 sm:p-5 shadow-sm card-hover interactive-card subject-card-hover flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-slide-up text-start border-2 transition-all duration-300 bg-white border-gray-100 hover:border-blue-300`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className={`cat-icon-box w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 bg-blue-50`}>
                  <BookMarked className={`w-6 h-6 text-blue-600`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`font-bold text-base leading-snug truncate text-gray-800`}>{trL(language, sub.name, sub.nameAr)}</p>
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
                  <p className={`font-bold text-sm sm:text-base whitespace-nowrap-safe text-gray-700`}>{t('From', 'من')} {formatCurrency(getSubjectMinPrice(sub))}/{t('hr', 'ساعة')}</p>
                  <p className="text-[11px] text-gray-400 whitespace-nowrap-safe">{getSubjectLevels(sub).length} {t('courses available', 'مواد متاحة')}</p>
                </div>
                <ChevronRight className={`w-5 h-5 flex-shrink-0 rtl:rotate-180 text-gray-300`} />
              </div>
            </button>
          ))}

        </div>
      </div>
    </div>
  );

  if (screen === 'levels' && selectedSubject) {
    const coursesForSubject = getSubjectLevels(selectedSubject);
    return (
    <div className="min-h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col overflow-x-hidden">
      <div className="bg-white border-b border-gray-100 px-5 py-5 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={() => nav('subjects')} className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="font-bold text-gray-900 text-lg">{trL(language, selectedSubject.name, selectedSubject.nameAr)}</h1>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5 animate-slide-up">
        <div>
          <h2 className="font-bold text-gray-900 text-xl">{t('Available Courses', 'المواد المتاحة للتعلم')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t(`${coursesForSubject.length} courses available — choose what you want to learn`, `${coursesForSubject.length} مادة متاحة — اختر ما تريد تعلمه`, `${coursesForSubject.length} cours disponibles — choisissez ce que vous voulez apprendre`)}</p>
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
                    {trL(language, course.name, course.nameAr)}
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
    <div className="min-h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col overflow-x-hidden">
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

        {/* Specialty & Live Filter Chips */}
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSpecialtyFilter('all')}
            className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
              specialtyFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t('All Specialties', 'كل التخصصات')}
          </button>
          {liveApprovedTutors.length > 0 && (
            <button
              onClick={() => setSpecialtyFilter('live')}
              className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all inline-flex items-center gap-1.5 ${
                specialtyFilter === 'live'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${specialtyFilter === 'live' ? 'bg-emerald-200' : 'bg-emerald-400'}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${specialtyFilter === 'live' ? 'bg-white' : 'bg-emerald-500'}`} />
              </span>
              {t('Live Now', 'مباشر الآن', 'En direct')} ({liveApprovedTutors.length})
            </button>
          )}
          {availableSpecialties.map(spec => (
            <button
              key={spec}
              onClick={() => setSpecialtyFilter(spec)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${
                specialtyFilter === spec ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              {spec}
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
            onClick={() => openTutorProfile(tutor, 'tutors')}
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
                {tutor.isLive && (
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
                  {tutor.hourlyRate > 0 && (
                    <div className="text-start sm:text-end flex-shrink-0">
                      <p className="font-bold text-blue-600 text-base whitespace-nowrap-safe">{formatCurrency(tutor.hourlyRate)}</p>
                      <p className="text-gray-400 text-[10px] whitespace-nowrap-safe">{t('per hour', 'في الساعة')}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-2">
                  {tutor.reviewCount > 0 && tutor.rating != null ? (
                    <>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <Star
                            key={j}
                            className={`w-3.5 h-3.5 ${j < Math.floor(tutor.rating || 0) ? 'fill-yellow-400 text-yellow-400' : j < (tutor.rating || 0) ? 'fill-yellow-200 text-yellow-300' : 'text-gray-200 fill-gray-200'}`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-gray-700">{tutor.rating}</span>
                      <span className="text-xs text-gray-400">({tutor.reviewCount})</span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">{t('No reviews yet', 'لا توجد تقييمات بعد', 'Aucun avis')}</span>
                  )}
                </div>
                {tutor.experienceYears > 0 && (
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-gray-400 text-xs">
                      <Award className="w-3 h-3" /> {t(`${tutor.experienceYears} yrs`, `${tutor.experienceYears} سنوات`, `${tutor.experienceYears} ans`)}
                    </span>
                  </div>
                )}
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
              <span className={`ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
                tutor.isLive
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold'
                  : tutor.isOnline
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {tutor.isLive ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    {t('LIVE NOW', 'مباشر الآن', 'En direct')}
                  </>
                ) : tutor.isOnline ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {t('Online', 'متصل', 'En ligne')}
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                    {t('Offline', 'غير متصل', 'Hors ligne')}
                  </>
                )}
              </span>
            </div>
            {tutor.isLive && tutor.activeSessionUrl && (
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  {tutor.activeSessionSubject || tutor.subjects[0] || t('Live class now', 'حصة مباشرة الآن', 'Cours en direct')}
                </span>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={e => {
                    e.stopPropagation();
                    handleJoinLiveTutorSession(tutor);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      handleJoinLiveTutorSession(tutor);
                    }
                  }}
                  className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-blue-200 transition-all"
                >
                  <Video className="w-3.5 h-3.5" />
                  {joiningLiveTutorId === tutor.id
                    ? t('Joining...', 'جاري الانضمام...', 'Connexion...')
                    : t('Join', 'انضمام', 'Rejoindre')}
                </div>
              </div>
            )}
          </button>
        ))
        )}
      </div>
    </div>
  );

  if (screen === 'tutor-profile' && selectedTutor) {
    const isFollowingTutor = followedTutorIds.includes(selectedTutor.id);
    return (
    <div className="h-[100dvh] w-full tm-app-shell bg-white flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="bg-gray-900 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-7 w-full">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => nav(profileBackScreen)} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl transition-colors flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleFollowTutor(selectedTutor.id)}
                disabled={followLoadingId === selectedTutor.id}
                className={`h-10 px-3 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  isFollowingTutor
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {isFollowingTutor ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                <span>{isFollowingTutor ? t('Following', 'متابَع', 'Suivi') : t('Follow', 'متابعة', 'Suivre')}</span>
              </button>
              <button onClick={() => toggleFav(selectedTutor.id)} className={`w-10 h-10 rounded-xl transition-colors flex items-center justify-center ${favorites.includes(selectedTutor.id) ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'}`}>
                <Heart className={`w-5 h-5 ${favorites.includes(selectedTutor.id) ? 'text-white fill-white' : 'text-white'}`} />
              </button>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="relative flex-shrink-0">
              <img src={selectedTutor.avatarUrl} alt={selectedTutor.name} className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white/20"
                onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedTutor.name}&background=3B82F6&color=fff&size=200`; }} />
              {selectedTutor.isLive && <span className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-green-400 border-2 border-gray-900 rounded-full" />}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-white text-lg sm:text-xl leading-tight truncate">{selectedTutor.name}</h2>
              {selectedTutor.nameAr && selectedTutor.nameAr !== selectedTutor.name && (
                <p className="text-gray-300 text-xs sm:text-sm font-cairo truncate">{selectedTutor.nameAr}</p>
              )}
              {selectedTutor.category && (
                <span className="inline-block mt-1 text-[11px] font-semibold bg-white/15 text-blue-200 px-2.5 py-0.5 rounded-full max-w-full truncate">
                  {selectedTutor.category}
                </span>
              )}
              {selectedTutor.isVerified && (
                <div className="flex items-center gap-1 mt-1">
                  <CheckCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <span className="text-blue-400 text-xs font-semibold truncate">{t('Verified Tutor', 'أستاذ موثق', 'Enseignant vérifié')}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {selectedTutor.reviewCount > 0 && selectedTutor.rating != null ? (
                  <span className="flex items-center gap-1 text-yellow-400 text-xs sm:text-sm font-bold">
                    <Star className="w-3.5 h-3.5 fill-yellow-400" /> {selectedTutor.rating} ({selectedTutor.reviewCount})
                  </span>
                ) : (
                  <span className="text-gray-400 text-xs">{t('No reviews yet', 'لا توجد تقييمات بعد', 'Aucun avis')}</span>
                )}
                {selectedTutor.experienceYears > 0 && (
                  <span className="text-gray-400 text-xs">• {t(`${selectedTutor.experienceYears} yrs`, `${selectedTutor.experienceYears} سنوات`, `${selectedTutor.experienceYears} ans`)}</span>
                )}
              </div>
            </div>
            {selectedTutor.hourlyRate > 0 && (
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-white text-base sm:text-xl whitespace-nowrap">{formatCurrency(selectedTutor.hourlyRate)}</p>
                <p className="text-gray-400 text-[11px]">{t('per hour', 'في الساعة', 'par heure')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-t-3xl -mt-3 p-4 space-y-5 pb-6">
          {selectedTutor.isLive && selectedTutor.activeSessionUrl && (
            <LiveClassCard
              tutorName={selectedTutor.name}
              avatarUrl={selectedTutor.avatarUrl}
              subject={selectedTutor.activeSessionSubject || selectedTutor.subjects[0] || selectedTutor.category || t('Live Class', 'حصة مباشرة', 'Cours en direct')}
              joining={joiningLiveTutorId === selectedTutor.id}
              onJoin={() => handleJoinLiveTutorSession(selectedTutor)}
              language={language}
            />
          )}
          {(() => {
            const realStats = [
              { label: t('Students', 'الطلاب', 'Élèves'), value: String(selectedTutor.studentsCount ?? 0), icon: Users },
              ...(selectedTutor.experienceYears > 0
                ? [{ label: t('Experience', 'الخبرة', 'Expérience'), value: t(`${selectedTutor.experienceYears} yrs`, `${selectedTutor.experienceYears} سنوات`, `${selectedTutor.experienceYears} ans`), icon: Award }]
                : []),
              { label: t('Reviews', 'التقييمات', 'Avis'), value: String(selectedTutor.reviewCount), icon: Star },
            ];
            return (
              <div className={`grid gap-2 ${realStats.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {realStats.map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-gray-50 rounded-2xl p-2.5 text-center min-w-0">
                    <Icon className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                    <p className="font-bold text-gray-800 text-xs sm:text-sm truncate">{value}</p>
                    <p className="text-[10px] text-gray-400 truncate">{label}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          <TutorVideoIntro videoUrl={selectedTutor.videoUrl} tutorName={selectedTutor.name} language={language} />
          <div>
            <h3 className="font-bold text-gray-900 mb-2">{t('About', 'نبذة عن الأستاذ', 'À propos')}</h3>
            {selectedTutor.bio || selectedTutor.bioAr ? (
              <>
                {selectedTutor.bio && <p className="text-sm text-gray-600 leading-relaxed">{selectedTutor.bio}</p>}
                {selectedTutor.bioAr && selectedTutor.bioAr !== selectedTutor.bio && (
                  <p className="text-sm text-gray-500 leading-relaxed mt-2 font-cairo text-right" dir="rtl">{selectedTutor.bioAr}</p>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400">{t('The teacher has not added a bio yet.', 'لم يضف الأستاذ نبذة تعريفية بعد.', 'L\'enseignant n\'a pas encore ajouté de biographie.')}</p>
            )}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-2">{t('Subjects', 'المواد', 'Matières')}</h3>
            {selectedTutor.subjects.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedTutor.subjects.map(s => (
                  <span key={s} className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full">{s}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">{t('The teacher has not added subjects yet.', 'لم يضف الأستاذ مواد بعد.', 'L\'enseignant n\'a pas encore ajouté de matières.')}</p>
            )}
          </div>
          {selectedTutor.languages.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2">{t('Languages', 'اللغات', 'Langues')}</h3>
              <div className="flex flex-wrap gap-2">
                {selectedTutor.languages.map(l => (
                  <span key={l} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full">
                    <Globe className="w-3 h-3" /> {l}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="font-bold text-gray-900 mb-2">{t('Availability', 'أوقات التوفر', 'Disponibilités')}</h3>
            {tutorSchedule.length === 0 ? (
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
                <Calendar className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                <p className="text-xs text-gray-500">{t('No availability published yet', 'لم يتم نشر أوقات التوفر بعد', 'Aucune disponibilité publiée')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tutorSchedule.map(slot => {
                  const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                  const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                  const dayIdx = dayToNumber(slot.dayOfWeek);
                  return (
                    <div key={slot.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                      <span className="text-sm font-medium text-gray-700">{t(DAYS_EN[dayIdx], DAYS_AR[dayIdx])}</span>
                      <span className="text-sm text-gray-500">{String(slot.startTime || '').slice(0, 5)} – {String(slot.endTime || '').slice(0, 5)}</span>
                      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">{t('Available', 'متاح', 'Disponible')}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">
                {tutorReviews.length > 0
                  ? `${t('Reviews', 'التقييمات', 'Avis')} (${tutorReviews.length})`
                  : t('Reviews', 'التقييمات', 'Avis')}
              </h3>
            </div>

            {canReviewSelectedTutor && (
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-3.5 mb-3 space-y-2.5">
                <p className="text-xs font-bold text-slate-800">{t('Write a review', 'أضف تقييمك', 'Laisser un avis')}</p>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setProfileReviewRating(star)}
                      className="p-1 rounded-lg hover:bg-blue-100/60 transition-colors"
                      aria-label={`Rate ${star} stars`}
                    >
                      <Star className={`w-5 h-5 ${star <= profileReviewRating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                    </button>
                  ))}
                </div>
                <textarea
                  value={profileReviewComment}
                  onChange={e => setProfileReviewComment(e.target.value.slice(0, 500))}
                  rows={2}
                  placeholder={t('Share your experience (optional)...', 'شارك تجربتك مع الأستاذ (اختياري)...', 'Partagez votre avis (optionnel)...')}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:border-blue-300 focus:ring-2 focus:ring-blue-100 resize-none"
                />
                {profileReviewError && <p className="text-[11px] text-red-600">{profileReviewError}</p>}
                <button
                  type="button"
                  onClick={handleSubmitProfileReview}
                  disabled={submittingProfileReview || profileReviewRating < 1}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  {submittingProfileReview ? '...' : t('Submit Review', 'إرسال التقييم', 'Publier l\'avis')}
                </button>
              </div>
            )}

            {tutorReviews.length === 0 ? (
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
                <p className="text-xs text-gray-500">{t('No reviews yet', 'لا توجد تقييمات بعد', 'Aucun avis pour le moment')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tutorReviews.map((r, i) => (
                  <div key={r.id} className="bg-gray-50 rounded-2xl p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                          {(r.reviewer_name || 'S').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{r.reviewer_name}</p>
                          <div className="flex">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <Star key={j} className={`w-3 h-3 ${j < r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {fmtDate(language, r.created_at)}
                      </span>
                    </div>
                    {r.comment && <p className="text-xs text-gray-600 leading-relaxed">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0 w-full bg-white border-t border-gray-100 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-3">
        <button
          onClick={() => { nav('chat'); }}
          className="flex-1 min-h-[44px] py-3 border border-blue-200 text-blue-600 rounded-xl font-semibold text-sm hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
        >
          <MessageSquare className="w-4 h-4" /> {t('Message', 'مراسلة', 'Message')}
        </button>
        <button
          onClick={() => nav('booking')}
          className="flex-1 min-h-[44px] py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Calendar className="w-4 h-4" /> {t('Book Session', 'حجز حصة', 'Réserver')}
        </button>
      </div>
    </div>
  );
  }

  if (screen === 'booking' && selectedTutor) return (
    <div className="h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col overflow-hidden">
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-4 z-20 flex items-center gap-3">
        <button onClick={() => nav('tutor-profile')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="font-bold text-gray-900">{t('Book a Session', 'احجز حصة', 'Réserver une session')}</h1>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 animate-slide-up pb-6">
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
      <div className="shrink-0 w-full bg-white border-t border-gray-100 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          onClick={() => (!PAID_PLANS_ENABLED ? confirmBooking() : nav('payment'))}
          disabled={selectedSlots.length === 0}
          className={`w-full py-3.5 text-white rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
            !PAID_PLANS_ENABLED
              ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
              : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
          }`}
        >
          {!PAID_PLANS_ENABLED
            ? t(`Confirm Free Trial Booking (${selectedSlots.length} sessions) →`, `تأكيد الحجز التجريبي المجاني (${selectedSlots.length} حصص) ←`, `Confirmer la réservation d'essai (${selectedSlots.length} sessions) →`)
            : t(`Continue to Payment (${selectedSlots.length} sessions) →`, `متابعة للدفع (${selectedSlots.length} حصص) ←`, `Continuer vers le paiement (${selectedSlots.length} sessions) →`)}
        </button>
      </div>
    </div>
  );

  if (screen === 'payment' && selectedTutor) return (
    <div className="h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col overflow-hidden">
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-4 z-20 flex items-center gap-3">
        <button onClick={() => nav('booking')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="font-bold text-gray-900">Payment</h1>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 animate-slide-up pb-6">
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
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('Card Number', 'رقم البطاقة', 'Numéro de carte')}</label>
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
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('Cardholder Name', 'اسم حامل البطاقة', 'Titulaire de la carte')}</label>
              <input placeholder={t('Name on card', 'الاسم على البطاقة', 'Nom sur la carte')} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
            </div>
          </div>
        )}

        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          {[
            { label: t(`Sessions (${selectedSlots.length})`, `الحصص (${selectedSlots.length})`, `Sessions (${selectedSlots.length})`), value: formatCurrency(selectedSlots.length * selectedTutor.hourlyRate) },
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
      <div className="shrink-0 w-full bg-white border-t border-gray-100 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
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
    <div className="min-h-[100dvh] w-full tm-app-shell bg-gray-50 flex flex-col items-center justify-center p-6 overflow-x-hidden">
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
              <span className="font-semibold text-gray-800">{fmtClock(language, s.startTime)} – {fmtClock(language, s.endTime)}</span>
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
    <div
      className="w-full tm-app-shell bg-gray-50 flex flex-col overflow-hidden"
      style={{ height: chatViewportHeight ? `${chatViewportHeight}px` : '100dvh' }}
    >
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('tutor-profile')} className="w-10 h-10 hover:bg-gray-100 rounded-xl transition-colors flex items-center justify-center flex-shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="relative flex-shrink-0">
            <img src={selectedTutor.avatarUrl} alt={selectedTutor.name} className="w-10 h-10 rounded-xl object-cover border border-slate-100"
              onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedTutor.name}&background=3B82F6&color=fff`; }} />
            {selectedTutor.isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-800 text-sm truncate">{selectedTutor.name}</p>
            <p className="text-xs text-green-500 font-medium">{selectedTutor.isOnline ? t('Online now', 'متصل الآن', 'En ligne') : t('Offline', 'غير متصل', 'Hors ligne')}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-3">
        {realMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 text-gray-400 space-y-2">
            <MessageSquare className="w-10 h-10 mx-auto text-gray-300" />
            <p className="text-sm font-semibold text-gray-500">{t('No messages yet', 'لا توجد رسائل بعد', 'Aucun message')}</p>
            <p className="text-xs max-w-xs">{t('Send a message to start your conversation with the teacher.', 'أرسل رسالة للبدء بالمحادثة مع الأستاذ.', 'Envoyez un message pour démarrer la conversation.')}</p>
          </div>
        ) : (
          realMessages.map((msg) => {
            const isMe = msg.sender_id === user.id;
            const timeStr = fmtTime(language, msg.created_at);

            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                {!isMe && (
                  <img src={selectedTutor.avatarUrl} alt="" className="w-7 h-7 rounded-lg object-cover me-2 mt-auto flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedTutor.name}&background=3B82F6&color=fff`; }} />
                )}
                <div className={`max-w-[80%] min-w-0 flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-md shadow-sm shadow-blue-200'
                      : 'bg-white text-gray-800 rounded-bl-md shadow-sm border border-slate-200/70'
                  }`}>
                    {msg.content}
                  </div>
                  <div className={`flex items-center gap-1 text-[11px] text-gray-500 mt-1 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <span>{timeStr}</span>
                    {isMe && (
                      <span className="inline-flex items-center">
                        {msg.is_read || msg.status === 'read' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="shrink-0 w-full bg-white border-t border-gray-100 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-2 z-20">
        <input
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          onFocus={() => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 120)}
          placeholder={t('Type a message to teacher...', 'اكتب رسالة للمعلم...', 'Écrire un message...')}
          className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-gray-100 text-sm focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all border border-transparent focus:border-blue-200"
        />
        <button
          onClick={sendMessage}
          disabled={!chatInput.trim()}
          aria-label={t('Send message', 'إرسال الرسالة', 'Envoyer le message')}
          className="w-11 h-11 min-w-[44px] min-h-[44px] bg-blue-600 rounded-xl flex items-center justify-center text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm shadow-blue-200 flex-shrink-0"
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
    <div className="sticky bottom-0 z-30 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-1 bg-transparent pointer-events-none w-full">
      <div className="grid grid-cols-4 gap-1.5 w-full rounded-[26px] glass-nav-bar px-2 py-1.5 pointer-events-auto transition-all duration-300">
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
                {trL(language, label, labelAr)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

