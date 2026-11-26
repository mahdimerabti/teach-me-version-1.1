import { useState, useEffect, useCallback } from 'react';
import { makeT, formatUnit as fmtUnit, formatClock as fmtClock, formatDate as fmtDate } from '../i18n';
import {
  BookOpen, Star, Users, Clock, MessageSquare, Calendar,
  CheckCircle, Send, ChevronRight, Bell, LogOut, User,
  TrendingUp, DollarSign, Video, Plus, Edit3, ShieldAlert,
  ArrowLeft, Search, HelpCircle, X
} from 'lucide-react';
import { type Question } from '../lib/db';
import type { TutorProfile } from './TutorRegisterScreen';
import LiveMeetingRoom from './LiveMeetingRoom';
import { supabase } from '../lib/supabase';
import { dayToNumber } from './booking/MultiSlotCalendar';
import { CURRENCY_CODE } from '../lib/config';
import { getSafeUploadExtension } from '../lib/security';
import {
  fetchUserConversations,
  fetchMessages,
  sendChatMessage,
  markMessagesAsRead,
  subscribeToConversationMessages,
  subscribeToUserInbox,
  type DBConversation,
  type DBMessage
} from '../lib/messagingService';
import { triggerLivePushEdgeFunction } from '../lib/pushNotifications';

interface TutorDashboardProps {
  user: { name: string; email: string; id: string };
  profile: TutorProfile | null;
  onLogout: () => void;
  onEditProfile: () => void;
  language: 'en' | 'ar' | 'fr';
  onChangeLanguage: (lang: 'en' | 'ar' | 'fr') => void;
}

type Tab = 'home' | 'messages' | 'questions' | 'schedule' | 'profile';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TutorDashboard({ user, profile, onLogout, onEditProfile, language, onChangeLanguage }: TutorDashboardProps) {
  const [tab, setTab] = useState<Tab>('home');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [submittingAnswer, setSubmittingAnswer] = useState<string | null>(null);

  const [tutorId, setTutorId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(profile?.status || 'pending');
  const [hasLoadedStatus, setHasLoadedStatus] = useState(false);
  const [dbRating, setDbRating] = useState<number | null>(null);
  const [dbReviewCount, setDbReviewCount] = useState<number>(0);
  const [sessions, setSessions] = useState<any[]>([]);
  const [dbSchedules, setDbSchedules] = useState<any[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});

  const [conversations, setConversations] = useState<DBConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<DBConversation | null>(null);
  const [activeMessages, setActiveMessages] = useState<DBMessage[]>([]);
  const [replyInput, setReplyInput] = useState('');
  const [totalUnreadMessages, setTotalUnreadMessages] = useState(0);
  const [convSearch, setConvSearch] = useState('');

  // Profile & Schedule Edit Modals (real fields saved to public.tutors)
  const [isEditingProfileModal, setIsEditingProfileModal] = useState(false);
  const [editBio, setEditBio] = useState(profile?.bio || '');
  const [editHourlyRate, setEditHourlyRate] = useState<number>(profile?.hourlyRate || 0);
  const [editCategory, setEditCategory] = useState(profile?.category || '');
  const [editSubjects, setEditSubjects] = useState<string[]>(profile?.subjects || []);
  const [newSubjectInput, setNewSubjectInput] = useState('');
  const [editLanguages, setEditLanguages] = useState<string[]>(profile?.languages || []);
  const [newLanguageInput, setNewLanguageInput] = useState('');
  const [editExperienceYears, setEditExperienceYears] = useState<number>(profile?.experienceYears || 0);
  const [editAvatarUrl, setEditAvatarUrl] = useState<string>(profile?.avatarUrl || '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);

  const [isEditingScheduleModal, setIsEditingScheduleModal] = useState(false);
  const [editScheduleList, setEditScheduleList] = useState<{ day: string; startTime: string; endTime: string }[]>([]);
  const [newSlotDay, setNewSlotDay] = useState('Sunday');
  const [newSlotStart, setNewSlotStart] = useState('09:00');
  const [newSlotEnd, setNewSlotEnd] = useState('10:00');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleSuccessMsg, setScheduleSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setEditBio(profile.bio || '');
      setEditHourlyRate(profile.hourlyRate || 0);
      setEditCategory(profile.category || '');
      setEditSubjects(profile.subjects || []);
      setEditLanguages(profile.languages || []);
      setEditExperienceYears(profile.experienceYears || 0);
      setEditAvatarUrl(profile.avatarUrl || '');
    }
  }, [profile]);

  const DAY_NAME_MAP: Record<string, number> = {
    'Sunday': 0, 'Sun': 0,
    'Monday': 1, 'Mon': 1,
    'Tuesday': 2, 'Tue': 2,
    'Wednesday': 3, 'Wed': 3,
    'Thursday': 4, 'Thu': 4,
    'Friday': 5, 'Fri': 5,
    'Saturday': 6, 'Sat': 6
  };

  const DAY_NUM_MAP: Record<number, string> = {
    0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday'
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(t('File size exceeds 5MB', 'حجم الملف يتجاوز 5 ميغابايت', 'La taille dépasse 5 Mo'));
      return;
    }
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimes.includes(file.type)) {
      alert(t('Only JPG, PNG, WEBP, or GIF images are allowed', 'يسمح بملفات الصور (JPG, PNG, WEBP, GIF) فقط', 'Seules les images JPG, PNG, WEBP ou GIF sont autorisées'));
      return;
    }
    setAvatarUploading(true);
    try {
      const fileExt = getSafeUploadExtension(file.name, ['jpg', 'jpeg', 'png', 'webp', 'gif'], 'jpg');
      const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { cacheControl: '3600', contentType: file.type, upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setEditAvatarUrl(publicUrl);
    } catch (err: any) {
      alert(t('Photo upload failed: ', 'فشل رفع الصورة: ') + (err?.message || err));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSaveProfileModal = async () => {
    if (!user?.id) return;
    setIsSavingProfile(true);
    setProfileSuccessMsg(null);

    try {
      let realTutorId = tutorId;
      if (!realTutorId) {
        const { data: tData } = await supabase.from('tutors').select('id').eq('user_id', user.id).maybeSingle();
        if (tData?.id) {
          realTutorId = tData.id;
          setTutorId(realTutorId);
        }
      }

      const cleanBio = editBio.trim().slice(0, 600);
      const cleanRate = Math.max(0, Number(editHourlyRate) || 0);
      const cleanExp = Math.max(0, Math.min(60, Number(editExperienceYears) || 0));
      const cleanSubjects = editSubjects.map(s => s.trim()).filter(Boolean);
      const cleanLanguages = editLanguages.map(l => l.trim()).filter(Boolean);

      const updatePayload: any = {
        user_id: user.id,
        name: user.name,
        bio: cleanBio,
        hourly_rate: cleanRate,
        category: editCategory.trim(),
        subjects: cleanSubjects,
        languages: cleanLanguages,
        experience_years: cleanExp,
        avatar_url: editAvatarUrl || null
      };
      if (realTutorId) {
        updatePayload.id = realTutorId;
      } else {
        updatePayload.status = 'pending';
      }

      const { data: savedTutor, error: tutErr } = await supabase
        .from('tutors')
        .upsert(updatePayload, { onConflict: 'user_id' })
        .select('id')
        .maybeSingle();

      if (tutErr) throw tutErr;
      if (savedTutor?.id) setTutorId(savedTutor.id);

      await supabase.from('profiles').upsert(
        {
          user_id: user.id,
          full_name: user.name,
          avatar_url: editAvatarUrl || null
        },
        { onConflict: 'user_id' }
      );

      setProfileSuccessMsg(t('Profile updated successfully!', 'تم تحديث الملف الشخصي بنجاح!', 'Profil mis à jour!'));
      setTimeout(() => {
        setProfileSuccessMsg(null);
        setIsEditingProfileModal(false);
      }, 1200);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      alert(t('Failed to save profile: ', 'فشل حفظ الملف الشخصي: ') + (err?.message || err));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const openScheduleModal = () => {
    const current = dbSchedules.length > 0 ? dbSchedules.map(s => {
      const dayStr = typeof s.day_of_week === 'number'
        ? (DAY_NUM_MAP[s.day_of_week] || 'Sunday')
        : (s.day || 'Sunday');
      return {
        day: dayStr,
        startTime: s.start_time ? String(s.start_time).slice(0, 5) : '09:00',
        endTime: s.end_time ? String(s.end_time).slice(0, 5) : '10:00'
      };
    }) : [];
    setEditScheduleList(current);
    setIsEditingScheduleModal(true);
  };

  const handleAddSlot = () => {
    setEditScheduleList(prev => [...prev, { day: newSlotDay, startTime: newSlotStart, endTime: newSlotEnd }]);
  };

  const handleRemoveSlot = (index: number) => {
    setEditScheduleList(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveScheduleModal = async () => {
    let realTutorId = tutorId;
    if (!realTutorId && user?.id) {
      const { data: tData } = await supabase.from('tutors').select('id').eq('user_id', user.id).maybeSingle();
      if (tData?.id) {
        realTutorId = tData.id;
        setTutorId(realTutorId);
      }
    }

    if (!realTutorId && user?.id) {
      const { data: createdTutor } = await supabase.from('tutors').upsert(
        {
          user_id: user.id,
          name: user.name,
          bio: editBio || 'Tutor Profile',
          hourly_rate: Number(editHourlyRate) || 1500,
          category: editCategory || 'General',
          status: 'pending'
        },
        { onConflict: 'user_id' }
      ).select('id').maybeSingle();
      if (createdTutor?.id) {
        realTutorId = createdTutor.id;
        setTutorId(realTutorId);
      }
    }

    if (!realTutorId) {
      alert(t('Tutor account not found. Please refresh or create your tutor profile first.', 'حساب الأستاذ غير موجود. يرجى إعادة التحميل أو ملء البيانات أولاً.'));
      setIsEditingScheduleModal(false);
      return;
    }

    setIsSavingSchedule(true);
    setScheduleSuccessMsg(null);

    try {
      await supabase.from('schedules').delete().eq('tutor_id', realTutorId);

      const toInsert = editScheduleList.map(s => {
        const dayInt = typeof s.day === 'number' ? s.day : (DAY_NAME_MAP[s.day] ?? 0);
        return {
          tutor_id: realTutorId,
          day_of_week: dayInt,
          start_time: s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime,
          end_time: s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime,
          is_available: true
        };
      });

      if (toInsert.length > 0) {
        const { data: newScheds, error: insertErr } = await supabase.from('schedules').insert(toInsert).select('*');
        if (insertErr) throw insertErr;
        if (newScheds) setDbSchedules(newScheds);
      } else {
        setDbSchedules([]);
      }

      setScheduleSuccessMsg(t('Schedule updated successfully!', 'تم تحديث الجدول بنجاح!', 'Planning mis à jour!'));
      setTimeout(() => {
        setScheduleSuccessMsg(null);
        setIsEditingScheduleModal(false);
      }, 1200);
    } catch (err: any) {
      console.error('Error saving schedule:', err);
      alert(t('Failed to save schedule: ', 'فشل حفظ الجدول: ') + (err?.message || err));
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Real-time inbox loading & subscription for teacher
  useEffect(() => {
    if (!user?.id) return;

    const loadInbox = async () => {
      const convs = await fetchUserConversations(user.id, true);
      setConversations(convs);
      const totalUnread = convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      setTotalUnreadMessages(totalUnread);
    };

    loadInbox();

    const unsubInbox = subscribeToUserInbox(user.id, () => {
      loadInbox();
    });

    return () => {
      unsubInbox();
    };
  }, [user?.id]);

  // Real-time message thread loading & subscription when opening a student conversation
  useEffect(() => {
    if (!selectedConv?.id || !user?.id) return;

    let unsub: (() => void) | null = null;

    const loadThread = async () => {
      const msgs = await fetchMessages(selectedConv.id);
      setActiveMessages(msgs);
      await markMessagesAsRead(selectedConv.id, user.id);

      unsub = subscribeToConversationMessages(selectedConv.id, (newMsg) => {
        setActiveMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        markMessagesAsRead(selectedConv.id, user.id);
      });
    };

    loadThread();

    return () => {
      if (unsub) unsub();
    };
  }, [selectedConv?.id, user?.id]);

  const handleTeacherSendReply = async () => {
    if (!replyInput.trim() || !selectedConv || !user?.id) return;
    const text = replyInput.trim();
    setReplyInput('');

    const tempId = `temp-${Date.now()}`;
    const tempMsg: DBMessage = {
      id: tempId,
      conversation_id: selectedConv.id,
      sender_id: user.id,
      receiver_id: selectedConv.student_id,
      content: text,
      status: 'sent',
      is_read: false,
      created_at: new Date().toISOString()
    };

    setActiveMessages(prev => [...prev, tempMsg]);

    const sent = await sendChatMessage({
      conversationId: selectedConv.id,
      senderId: user.id,
      receiverId: selectedConv.student_id,
      content: text
    });

    if (sent) {
      setActiveMessages(prev => prev.map(m => m.id === tempId ? sent : m));
    }
  };

  const loadTutorData = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('tutors')
      .select('id, status, rating, review_count, bio, hourly_rate, category, subjects, languages, experience_years, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('Error loading tutor status:', error.message);
      return;
    }

    if (data) {
      setTutorId(data.id);
      setStatus((data.status || 'pending').toLowerCase());
      setHasLoadedStatus(true);
      const revCount = Number(data.review_count || 0);
      setDbReviewCount(revCount);
      setDbRating(revCount > 0 && data.rating != null ? Number(data.rating) : null);
      setEditBio(data.bio || '');
      setEditHourlyRate(Number(data.hourly_rate || 0));
      setEditCategory(data.category || '');
      setEditSubjects(Array.isArray(data.subjects) ? data.subjects : []);
      setEditLanguages(Array.isArray(data.languages) ? data.languages : []);
      setEditExperienceYears(Number(data.experience_years || 0));
      setEditAvatarUrl(data.avatar_url || '');

      const [{ data: scheds }, { data: sessData }, { data: qData }] = await Promise.all([
        supabase.from('schedules').select('*').eq('tutor_id', data.id),
        supabase.from('sessions').select('*').eq('tutor_id', data.id),
        supabase.from('questions').select('*').eq('tutor_id', data.id)
      ]);

      if (scheds) {
        setDbSchedules(scheds);
      }

      const studentIdsSet = new Set<string>();
      if (sessData) {
        sessData.forEach(s => studentIdsSet.add(s.student_id));
      }
      if (qData) {
        qData.forEach(q => studentIdsSet.add(q.student_id));
      }
      const studentIds = Array.from(studentIdsSet);

      let studentMapping: Record<string, string> = {};
      if (studentIds.length > 0) {
        const { data: profiles } = await supabase.rpc('get_participant_profiles', {
          p_user_ids: studentIds
        });
        if (Array.isArray(profiles)) {
          studentMapping = profiles.reduce((acc: any, curr: any) => {
            acc[curr.user_id] = curr.full_name;
            return acc;
          }, {});
          setStudentNames(studentMapping);
        }
      }

      if (sessData) {
        setSessions(sessData);
      }

      if (qData) {
        const mappedQuestions = qData.map((q: any) => {
          const name = studentMapping[q.student_id] || 'Student';
          return {
            id: q.id,
            studentName: name,
            studentAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3B82F6&color=fff`,
            subject: q.subject,
            question: q.question,
            answer: q.answer,
            isAnswered: q.is_answered,
            createdAt: q.created_at,
            answeredAt: q.answered_at
          };
        });
        setQuestions(mappedQuestions);
      }
    }
  }, [user.id]);

  useEffect(() => {
    loadTutorData();

    // Realtime subscription for instant approval propagation & session updates
    const tutorChannel = supabase
      .channel(`tutor-status-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tutors', filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          if (payload?.new?.status) {
            setStatus(String(payload.new.status).toLowerCase());
            setHasLoadedStatus(true);
          }
          loadTutorData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        () => {
          loadTutorData();
        }
      )
      .subscribe();

    const onFocus = () => loadTutorData();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadTutorData();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(tutorChannel);
    };
  }, [user.id, loadTutorData]);

  const t = makeT(language);
 
  const DAYS_EN = [
    t('Sunday', 'الأحد', 'Dimanche'),
    t('Monday', 'الاثنين', 'Lundi'),
    t('Tuesday', 'الثلاثاء', 'Mardi'),
    t('Wednesday', 'الأربعاء', 'Mercredi'),
    t('Thursday', 'الخميس', 'Jeudi'),
    t('Friday', 'الجمعة', 'Vendredi'),
    t('Saturday', 'السبت', 'Samedi')
  ];
 
  const [activeMeetingRoomId, setActiveMeetingRoomId] = useState<string | null>(null);

  const displayName = profile?.name || user.name;
  const unanswered = questions.filter(q => !q.isAnswered).length;

  const submitAnswer = async (questionId: string) => {
    const answer = answerInputs[questionId]?.trim();
    if (!answer) return;
    setSubmittingAnswer(questionId);
    try {
      const { error } = await supabase
        .from('questions')
        .update({
          answer,
          is_answered: true,
          answered_at: new Date().toISOString()
        })
        .eq('id', questionId);
      if (!error) {
        setQuestions(qs =>
          qs.map(q => q.id === questionId
            ? { ...q, isAnswered: true, answer, answeredAt: new Date().toISOString() }
            : q
          )
        );
        setAnswerInputs(prev => { const n = { ...prev }; delete n[questionId]; return n; });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingAnswer(null);
    }
  };

  const scheduleSlots = dbSchedules.length > 0
    ? dbSchedules.map(s => {
        const dayIdx = dayToNumber(s.day_of_week);
        const startStr = s.start_time ? String(s.start_time).slice(0, 5) : '09:00';
        const endStr = s.end_time ? String(s.end_time).slice(0, 5) : '10:00';
        return {
          day: DAYS_EN[dayIdx] || DAYS_EN[0],
          startTime: startStr,
          endTime: endStr
        };
      })
    : [];

  const totalStudents = Array.from(new Set(sessions.map(s => s.student_id))).length;
  const completedSessions = sessions.filter(s => s.status === 'completed').length;
  const totalEarnings = sessions.filter(s => s.status === 'completed').reduce((sum, s) => sum + (s.credit_cost * 25), 0);
  const totalSessionsCount = sessions.length;

  // Local calendar day (toISOString() is UTC and shifts the day around midnight in Algeria)
  const nowLocal = new Date();
  const todayStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
  // Only today's sessions, one row per session id. Past sessions left in 'live' state no longer pile up here.
  const todaySessions = Array.from(
    new Map(
      sessions
        .filter(s => (s.status === 'confirmed' || s.status === 'live') && String(s.date || '').slice(0, 10) === todayStr)
        .map(s => [s.id, s] as [string, any])
    ).values()
  )
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
    .map(s => ({
      id: s.id,
      time: fmtClock(language, s.start_time),
      student: studentNames[s.student_id] || t('Student', 'طالب', 'Élève'),
      subject: s.subject || t('Private lesson', 'حصة خاصة', 'Cours particulier'),
      duration: fmtUnit(language, 60, 'minute', 'short'),
      avatar: (studentNames[s.student_id] || 'S').charAt(0),
      liveRoomId: s.live_room_id,
      startTime: s.start_time,
      endTime: s.end_time,
      status: s.status
    }));

  const isApprovedByAdmin = hasLoadedStatus
    ? status === 'approved'
    : (status === 'approved' || profile?.status === 'approved');

  const handleStartLesson = async (sessionId: string, liveRoomId?: string) => {
    if (!isApprovedByAdmin) {
      alert(
        t('Sorry, your tutor account is pending approval by administration. Live class creation will be activated once your profile is approved.', 'عذراً، حسابك كأستاذ ما زال قيد المراجعة والتدقيق من طرف الإدارة. سيتم تفعيل ميزة فتح الحصص المباشرة فور موافقة المسؤول على حسابك.', "Désolé, votre compte enseignant est en attente de validation par l'administration. Les cours en direct seront activés dès l'approbation de votre profil.")
      );
      return;
    }

    // Preserve the session's UUID live_room_id so student & tutor join the exact same room
    let roomId = liveRoomId || sessionId;
    let sessionSubject = profile?.subjects?.[0] || profile?.category || 'Live Lesson';
    try {
      const { data: updatedSess, error: updateErr } = await supabase
        .from('sessions')
        .update({ status: 'live' })
        .eq('id', sessionId)
        .select('live_room_id, subject')
        .maybeSingle();

      if (updateErr) {
        console.warn('Notice updating session status to live:', updateErr.message);
      } else if (updatedSess?.live_room_id) {
        roomId = updatedSess.live_room_id;
        if (updatedSess.subject) sessionSubject = updatedSess.subject;
        setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, status: 'live' } : s)));
      }
    } catch (e) {
      console.warn('Notice updating session status:', e);
    }

    // Broadcast teacher's active live Zoom room on public.tutors so students see LIVE NOW immediately
    try {
      const { data: liveRes } = await supabase.rpc('start_tutor_live_session', {
        p_room_id: roomId,
        p_subject: sessionSubject
      });
      if ((liveRes as any)?.tutor_id) {
        void triggerLivePushEdgeFunction({
          tutorId: (liveRes as any).tutor_id,
          tutorName: displayName,
          subject: sessionSubject,
          roomId
        });
      }
    } catch (e) {
      console.warn('Notice broadcasting tutor live session:', e);
    }

    setActiveMeetingRoomId(roomId);
  };

  const handleStartQuickZoomSession = async () => {
    if (!isApprovedByAdmin) {
      alert(
        t('Sorry, your tutor account is pending approval by administration. Live class creation will be activated once your profile is approved.', 'عذراً، حسابك كأستاذ ما زال قيد المراجعة والتدقيق من طرف الإدارة. سيتم تفعيل ميزة فتح الحصص المباشرة فور موافقة المسؤول على حسابك.', "Désolé, votre compte enseignant est en attente de validation par l'administration. Les cours en direct seront activés dès l'approbation de votre profil.")
      );
      return;
    }

    let realId = tutorId;
    if (!realId && user?.id) {
      const { data: tData } = await supabase.from('tutors').select('id').eq('user_id', user.id).maybeSingle();
      realId = tData?.id || null;
      if (realId) setTutorId(realId);
    }

    let roomId = `teachme-zoom-${realId ? realId.slice(0, 8) : user.id.slice(0, 8)}`;
    let liveSubject = profile?.subjects?.[0] || profile?.category || 'Live Zoom Class';

    if (realId) {
      try {
        const { data: activeSess } = await supabase
          .from('sessions')
          .select('id, live_room_id, subject')
          .eq('tutor_id', realId)
          .in('status', ['confirmed', 'live'])
          .order('date', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (activeSess?.id) {
          const { error: liveErr } = await supabase
            .from('sessions')
            .update({ status: 'live' })
            .eq('id', activeSess.id);
          if (liveErr) {
            console.warn('Notice setting session live:', liveErr.message);
          } else {
            setSessions(prev => prev.map(s => (s.id === activeSess.id ? { ...s, status: 'live' } : s)));
          }
          if (activeSess.live_room_id) {
            roomId = activeSess.live_room_id;
          }
          if (activeSess.subject) {
            liveSubject = activeSess.subject;
          }
        }
      } catch (_) {}
    }

    // Mark tutor as LIVE in public.tutors so matching students can join directly
    try {
      const { data: liveRes } = await supabase.rpc('start_tutor_live_session', {
        p_room_id: roomId,
        p_subject: liveSubject
      });
      if ((liveRes as any)?.tutor_id) {
        void triggerLivePushEdgeFunction({
          tutorId: (liveRes as any).tutor_id,
          tutorName: displayName,
          subject: liveSubject,
          roomId
        });
      }
    } catch (e) {
      console.warn('Notice broadcasting tutor live session:', e);
    }

    setActiveMeetingRoomId(roomId);
  };



  const upcomingBookings = sessions
    .filter(s => s.status === 'confirmed' && s.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
    .slice(0, 5)
    .map(s => ({
      date: fmtDate(language, s.date, { weekday: 'short', month: 'short', day: 'numeric' }),
      time: fmtClock(language, s.start_time),
      student: studentNames[s.student_id] || t('Student', 'طالب', 'Élève'),
      subject: s.subject || t('Private lesson', 'حصة خاصة', 'Cours particulier')
    }));

  if (activeMeetingRoomId) {
    return (
      <LiveMeetingRoom
        roomId={activeMeetingRoomId}
        userName={displayName}
        userAvatar={profile?.avatarUrl}
        userId={user.id}
        isTutor={true}
        language={language}
        onClose={() => {
          setActiveMeetingRoomId(null);
          supabase.rpc('end_tutor_live_session').then(() => {}, () => {});
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full max-w-5xl mx-auto md:shadow-2xl md:border-x border-slate-100">
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-200">
              {displayName.charAt(0)}
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-sm">{displayName}</h1>
              <p className="text-xs text-blue-600 font-medium">{t('Tutor Dashboard', 'لوحة المعلم', 'Tableau de bord')}</p>
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
            <button onClick={() => setTab('questions')} className="relative p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <Bell className="w-5 h-5 text-gray-600" />
              {unanswered > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unanswered}
                </span>
              )}
            </button>
            <button onClick={onLogout} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <LogOut className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {tab === 'home' && (
          <div className="px-4 pt-5 pb-4 space-y-4 animate-slide-up">
            {status !== 'approved' && (
              <div className={`rounded-2xl p-4 border flex flex-col gap-2 ${
                status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                status === 'info_requested' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                status === 'suspended' ? 'bg-orange-50 border-orange-200 text-orange-800' :
                status === 'banned' ? 'bg-red-50 border-red-200 text-red-800' :
                'bg-red-50 border-red-200 text-red-800'
              }`}>
                <div className="flex items-center gap-2 font-bold text-sm">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                  <span>
                    {status === 'pending' && t('Application Under Review', 'الطلب قيد المراجعة', 'Candidature en cours d\'examen')}
                    {status === 'info_requested' && t('Additional Information Required', 'مطلوب معلومات إضافية', 'Informations complémentaires requises')}
                    {status === 'suspended' && t('Tutor Account Suspended', 'تم تعليق حساب المعلم', 'Compte tuteur suspendu')}
                    {status === 'banned' && t('Tutor Account Banned', 'تم حظر حساب المعلم', 'Compte tuteur banni')}
                    {status === 'rejected' && t('Application Rejected', 'تم رفض الطلب', 'Candidature rejetée')}
                  </span>
                </div>
                <p className="text-xs leading-relaxed">
                  {status === 'pending' && t('Thank you for applying! Your application is currently under review by our administration. You will receive a notification once approved.', 'شكراً لك على التقديم! طلبك كمعلم قيد المراجعة حالياً من قبل الإدارة. ستتلقى إشعاراً بمجرد الموافقة.', 'Merci pour votre candidature! Votre candidature est actuellement en cours d\'examen par notre administration. Vous recevrez une notification après approbation.')}
                  {status === 'info_requested' && t('Our team needs more information to verify your credentials. Please email supporting certificates or documentation to support@teachme.com.', 'يحتاج فريقنا إلى مزيد من المعلومات للتحقق من أوراق اعتمادك. يرجى إرسال الشهادات أو الوثائق الداعمة بالبريد الإلكتروني إلى support@teachme.com.', 'Notre équipe a besoin de plus d\'informations pour vérifier vos qualifications. Veuillez envoyer les certificats ou documents justificatifs par e-mail à support@teachme.com.')}
                  {status === 'suspended' && t('Your account has been temporarily suspended due to a policy review. Please reach out to system admins at support@teachme.com.', 'تم تعليق حسابك مؤقتاً بسبب مراجعة السياسة. يرجى التواصل مع مسؤولي النظام على support@teachme.com.', 'Votre compte a été suspendu temporairement en raison d\'un examen des règles. Veuillez contacter les administrateurs à support@teachme.com.')}
                  {status === 'banned' && t('Your account has been permanently banned from Teach Me due to severe violations of our terms.', 'تم حظر حسابك نهائياً من علمني بسبب انتهاكات جسيمة لشروطنا.', 'Votre compte a été banni définitivement de Teach Me en raison de violations graves de nos conditions.')}
                  {status === 'rejected' && t('Unfortunately, your tutor application was rejected. Please contact administration for more details on your decision.', 'للأسف، تم رفض طلب المعلم الخاص بك. يرجى الاتصال بالإدارة لمزيد من التفاصيل حول القرار.', 'Malheureusement, votre candidature de tuteur a été rejetée. Veuillez contacter l\'administration pour plus de détails.')}
                </p>
              </div>
            )}
 
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Users, label: t('Total Students', 'إجمالي الطلاب', 'Total des élèves'), value: String(totalStudents), color: 'text-blue-600', bg: 'bg-blue-50' },
                { icon: Star, label: t('Rating', 'التقييم', 'Évaluation'), value: dbReviewCount > 0 && dbRating != null ? `${dbRating.toFixed(1)} (${dbReviewCount})` : '—', color: 'text-yellow-500', bg: 'bg-yellow-50' },
                { icon: DollarSign, label: t('This Month', 'هذا الشهر', 'Ce mois-ci'), value: `${totalEarnings.toLocaleString()} ${CURRENCY_CODE}`, color: 'text-green-600', bg: 'bg-green-50' },
                { icon: TrendingUp, label: t('Sessions', 'الجلسات', 'Sessions'), value: String(totalSessionsCount), color: 'text-indigo-600', bg: 'bg-indigo-50' },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className="bg-white rounded-2xl p-4 shadow-sm card-hover">
                  <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
 
            {unanswered > 0 && (
              <div
                onClick={() => setTab('questions')}
                className="bg-blue-600 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-blue-700 active:scale-[0.99] transition-all shadow-lg shadow-blue-200 touch-press"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{unanswered} {t('Unanswered Questions', 'أسئلة غير مجابة', 'Questions sans réponse')}</p>
                    <p className="text-blue-100 text-xs">{t('Students are waiting for your reply', 'الطلاب في انتظار ردك', 'Les élèves attendent votre réponse')}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-white/70" />
              </div>
            )}
 
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Video className="w-4 h-4 text-blue-600" />
                  {t('Live Zoom & Video', 'حصة زوم المباشرة والفيديو', 'Vidéo & Zoom')}
                </h3>
              </div>

              <button
                onClick={handleStartQuickZoomSession}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-700 hover:to-green-600 text-white rounded-xl font-bold text-sm shadow-md shadow-green-200 transition-all flex items-center justify-center gap-2 active:scale-95 touch-press"
              >
                <Video className="w-4.5 h-4.5" />
                {t('▶ Start Instant Zoom Classroom Now', '▶ بدء حصة زوم مباشرة الآن', '▶ Démarrer cours Zoom')}
              </button>

              {profile?.videoUrl ? (
                <div className="flex items-center gap-3 bg-green-50 p-3 rounded-xl">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-green-800">{t('Video uploaded ✓', 'تم رفع الفيديو ✓', 'Vidéo mise en ligne ✓')}</p>
                    <p className="text-xs text-green-600 truncate">{profile.videoUrl}</p>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-gray-200 rounded-xl p-3 flex items-center justify-between bg-gray-50">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{t('No intro video uploaded', 'لا يوجد فيديو تعريفي بعد')}</p>
                    <p className="text-[10px] text-gray-400">{t('Add a video to attract more students', 'إضافة فيديو لجذب الطلاب')}</p>
                  </div>
                  <button onClick={onEditProfile} className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors touch-press flex-shrink-0">
                    {t('Add Video', 'إضافة فيديو')}
                  </button>
                </div>
              )}
            </div>
 
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                {t("Today's Sessions", 'جلسات اليوم', 'Sessions d\'aujourd\'hui')}
              </h3>
              <div className="space-y-3">
                {todaySessions.length > 0 ? (
                  todaySessions.map((session) => (
                    <div key={session.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white text-sm font-bold">
                        {session.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm">{session.student}</p>
                        <p className="text-xs text-gray-500">{session.subject} · {session.duration}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => handleStartLesson(session.id, session.liveRoomId)}
                            className="px-3.5 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 touch-press"
                          >
                            <Video className="w-4 h-4" />
                            {session.status === 'live'
                              ? t('Join live lesson', 'دخول الحصة المباشرة', 'Rejoindre le cours en direct')
                              : t('▶ Start Lesson', '▶ بدء الحصة المباشرة', '▶ Démarrer le cours')}
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-blue-600">{session.time}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          session.status === 'live' ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {session.status === 'live' ? t('LIVE NOW', 'مباشر الآن', 'EN DIRECT') : t('Confirmed', 'مؤكد', 'Confirmé')}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">{t('No sessions scheduled for today', 'لا توجد جلسات مجدولة اليوم', 'Aucune session prévue aujourd\'hui')}</p>
                )}
              </div>
            </div>
 
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Edit3, label: t('Edit Profile', 'تعديل الملف الشخصي', 'Modifier le profil'), onClick: () => setIsEditingProfileModal(true), color: 'text-blue-600', bg: 'bg-blue-50' },
                { icon: MessageSquare, label: t('Questions', 'الأسئلة', 'Questions'), onClick: () => setTab('questions'), color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { icon: Calendar, label: t('Schedule', 'الجدول', 'Planning'), onClick: () => setTab('schedule'), color: 'text-green-600', bg: 'bg-green-50' },
              ].map(({ icon: Icon, label, onClick, color, bg }) => (
                <button key={label} onClick={onClick} className="bg-white rounded-2xl p-3 shadow-sm card-hover flex flex-col items-center gap-2 touch-press">
                  <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <p className="text-[10px] font-semibold text-gray-700">{label}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'questions' && (
          <div className="p-4 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{t('Student Questions', 'أسئلة الطلاب', 'Questions des élèves')}</h2>
              <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                {unanswered} {t('pending', 'قيد الانتظار', 'en attente')}
              </span>
            </div>

            {questions.length === 0 && (
              <div className="text-center py-12">
                <MessageSquare className="w-14 h-14 mx-auto text-gray-200 mb-3" />
                <p className="text-gray-500 font-medium">{t('No questions yet', 'لا توجد أسئلة بعد', 'Pas encore de questions')}</p>
                <p className="text-sm text-gray-400">{t('Questions from students will appear here', 'ستظهر أسئلة الطلاب هنا', 'Les questions des élèves apparaîtront ici')}</p>
              </div>
            )}

            {questions.map((q, i) => (
              <div key={q.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden animate-slide-up`} style={{ animationDelay: `${i * 80}ms` }}>
                <div className="p-4 pb-3">
                  <div className="flex items-start gap-3">
                    <img
                      src={q.studentAvatar}
                      alt={q.studentName}
                      className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                      onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${q.studentName}&background=3B82F6&color=fff`; }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-800 text-sm">{q.studentName}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          q.isAnswered ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {q.isAnswered ? t('✓ Answered', '✓ تمت الإجابة', '✓ Répondu') : t('Pending', 'قيد الانتظار', 'En attente')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{q.subject}</span>
                        <span className="text-xs text-gray-400">{new Date(q.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 bg-gray-50 rounded-xl p-3">
                    <p className="text-sm text-gray-700 leading-relaxed">{q.question}</p>
                  </div>
                </div>

                {q.isAnswered && q.answer && (
                  <div className="px-4 pb-4">
                    <div className="bg-green-50 rounded-xl p-3 border-l-4 border-green-400">
                      <p className="text-xs font-semibold text-green-700 mb-1.5 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        {t('Your Answer', 'إجابتك', 'Votre réponse')}
                      </p>
                      <p className="text-sm text-green-800 leading-relaxed">{q.answer}</p>
                    </div>
                  </div>
                )}

                {!q.isAnswered && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3">
                    <div className="flex gap-2">
                      <textarea
                        value={answerInputs[q.id] || ''}
                        onChange={e => setAnswerInputs(prev => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder={t('Type your answer...', 'اكتب إجابتك...', 'Écrivez votre réponse...')}
                        rows={2}
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all resize-none"
                      />
                      <button
                        onClick={() => submitAnswer(q.id)}
                        disabled={!answerInputs[q.id]?.trim() || submittingAnswer === q.id}
                        className="px-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex-shrink-0 flex items-center justify-center touch-press"
                      >
                        {submittingAnswer === q.id
                          ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <Send className="w-4 h-4" />
                        }
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'schedule' && (
          <div className="p-4 space-y-4 animate-slide-up">
            <h2 className="font-bold text-gray-900">{t('Weekly Schedule', 'جدول العمل الأسبوعي', 'Planning hebdomadaire')}</h2>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS.map(d => (
                  <div key={d} className="text-center">
                    <p className="text-[10px] font-semibold text-gray-400 mb-1.5">{d}</p>
                    <div className={`w-8 h-8 mx-auto rounded-xl flex items-center justify-center text-xs font-bold ${
                      scheduleSlots.some(s => s.day.startsWith(d === 'Sun' ? 'Sun' : d === 'Mon' ? 'Mon' : d))
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      {d.charAt(0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {scheduleSlots.map((slot, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 card-hover">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-gray-800">{slot.day}</p>
                    <p className="text-sm text-gray-500">{slot.startTime} – {slot.endTime}</p>
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-semibold">{t('Available', 'متاح', 'Disponible')}</span>
                </div>
              ))}
            </div>

            <button onClick={openScheduleModal} className="w-full py-3 border-2 border-dashed border-blue-200 rounded-2xl text-sm text-blue-600 font-semibold hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 touch-press">
              <Plus className="w-4 h-4" />
              {t('Edit Schedule', 'تعديل الجدول', 'Modifier le planning')}
            </button>

            <div className="bg-white rounded-2xl p-4 shadow-sm text-left">
              <h3 className="font-semibold text-gray-800 mb-3">{t('Upcoming Bookings', 'الحجوزات القادمة', 'Réservations à venir')}</h3>
              {upcomingBookings.length > 0 ? (
                upcomingBookings.map((b, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{b.student} · {b.subject}</p>
                      <p className="text-xs text-gray-500">{b.date} at {b.time}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">{t('No upcoming bookings', 'لا توجد حجوزات قادمة', 'Aucune réservation à venir')}</p>
              )}
            </div>
          </div>
        )}

        {tab === 'profile' && (
          <div className="p-4 space-y-4 animate-slide-up text-start">
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-blue-200">
                  {displayName.charAt(0)}
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">{language === 'ar' && profile?.nameAr ? profile.nameAr : displayName}</h2>
                  <p className="text-blue-600 text-sm font-medium mt-1">{profile?.category || t('Tutor', 'معلم', 'Enseignant')}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{user.email}</p>
                </div>
              </div>
              {profile?.bio && (
                <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
              )}
              <button onClick={() => setIsEditingProfileModal(true)} className="w-full mt-4 py-2.5 border border-blue-200 text-blue-600 rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 touch-press">
                <Edit3 className="w-4 h-4" />
                {t('Edit Profile', 'تعديل الملف الشخصي', 'Modifier le profil')}
              </button>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-3">{t('My Stats', 'إحصاءاتي', 'Mes stats')}</h3>
              {[
                { label: t('Total Students', 'إجمالي الطلاب', 'Total des élèves'), value: String(totalStudents), icon: Users },
                { label: t('Sessions Completed', 'الجلسات المكتملة', 'Sessions terminées'), value: String(completedSessions), icon: BookOpen },
                { label: t('Average Rating', 'متوسط التقييم', 'Évaluation moyenne'), value: dbReviewCount > 0 && dbRating != null ? `${dbRating.toFixed(1)} (${dbReviewCount})` : t('No reviews yet', 'لا توجد تقييمات بعد', 'Aucun avis'), icon: Star },
                { label: t('Monthly Earnings', 'الأرباح الشهرية', 'Revenus mensuels'), value: `${totalEarnings.toLocaleString()} ${CURRENCY_CODE}`, icon: DollarSign },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-gray-600">{label}</span>
                  </div>
                  <span className="font-bold text-gray-900">{value}</span>
                </div>
              ))}
            </div>

            <button onClick={onLogout} className="w-full py-3 border border-red-100 text-red-500 rounded-xl text-sm font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-2 touch-press">
              <LogOut className="w-4 h-4" />
              {t('Sign Out', 'تسجيل الخروج', 'Se déconnecter')}
            </button>
          </div>
        )}
        {tab === 'messages' && (
          <div className="p-4 space-y-4 animate-slide-up">
            {!selectedConv ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 text-base">{t('Student Messages & Inbox', 'رسائل الطلاب والمحادثات')}</h3>
                  <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2.5 py-1 rounded-full">
                    {conversations.length} {t('threads', 'محادثة')}
                  </span>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={convSearch}
                    onChange={e => setConvSearch(e.target.value)}
                    placeholder={t('Search student messages...', 'بحث عن طالب أو رسالة...')}
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  {conversations
                    .filter(c => !convSearch.trim() || (c.participantName && c.participantName.toLowerCase().includes(convSearch.toLowerCase())) || (c.last_message && c.last_message.toLowerCase().includes(convSearch.toLowerCase())))
                    .map(conv => (
                      <div
                        key={conv.id}
                        onClick={() => setSelectedConv(conv)}
                        className="flex items-center justify-between p-3.5 bg-white hover:bg-blue-50/50 active:scale-[0.99] cursor-pointer rounded-2xl border border-gray-100 shadow-sm transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={conv.participantAvatar || `https://ui-avatars.com/api/?name=${conv.participantName}&background=3B82F6&color=fff`}
                            alt={conv.participantName}
                            className="w-11 h-11 rounded-xl object-cover border border-slate-100 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-gray-900 text-xs truncate">{conv.participantName}</p>
                              {conv.unreadCount != null && conv.unreadCount > 0 && (
                                <span className="bg-red-500 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full">
                                  {conv.unreadCount} new
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{conv.last_message || t('No messages yet', 'لا توجد رسائل')}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-[10px] text-gray-400 font-medium">
                            {conv.last_message_at ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    ))}

                  {conversations.length === 0 && (
                    <div className="text-center py-12 text-gray-400 space-y-2 bg-white rounded-3xl p-6 border border-gray-100">
                      <MessageSquare className="w-10 h-10 mx-auto text-gray-300" />
                      <p className="text-xs font-semibold">{t('No active student conversations', 'لا توجد محادثات طلاب حتى الآن')}</p>
                      <p className="text-[11px]">{t('When students message you, their conversations will appear here in real time.', 'عندما يرسل لك الطلاب رسائل ستظهر محادثاتهم هنا مباشرة.')}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Active Chat Thread View */
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                  <button onClick={() => setSelectedConv(null)} className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors">
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <img
                    src={selectedConv.participantAvatar || `https://ui-avatars.com/api/?name=${selectedConv.participantName}&background=3B82F6&color=fff`}
                    alt={selectedConv.participantName}
                    className="w-10 h-10 rounded-xl object-cover border border-slate-100"
                  />
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">{selectedConv.participantName}</h3>
                    <p className="text-[10px] text-green-500 font-semibold">{t('Active Chat Thread', 'محادثة نشطة')}</p>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm min-h-[320px] max-h-[420px] overflow-y-auto space-y-3">
                  {activeMessages.map((msg) => {
                    const isMe = msg.sender_id === user.id;
                    const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                        <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                          <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            isMe
                              ? 'bg-blue-600 text-white rounded-br-md shadow-md shadow-blue-200'
                              : 'bg-gray-100 text-gray-800 rounded-bl-md shadow-sm'
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
                  })}
                  {activeMessages.length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-12">{t('No messages in this thread yet.', 'لا توجد رسائل في هذه المحادثة بعد.')}</p>
                  )}
                </div>

                <div className="flex gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
                  <input
                    type="text"
                    value={replyInput}
                    onChange={e => setReplyInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleTeacherSendReply()}
                    placeholder={t('Type manual reply to student...', 'اكتب رداً للطالب...')}
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-transparent focus:border-blue-200 focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-xl text-xs transition-all"
                  />
                  <button
                    onClick={handleTeacherSendReply}
                    disabled={!replyInput.trim()}
                    className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-all shadow-md shadow-blue-200"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border-t border-gray-100 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] grid grid-cols-5 gap-1 sticky bottom-0 z-20">
        {([
          { id: 'home', icon: TrendingUp, label: t('Overview', 'نظرة عامة', 'Aperçu') },
          { id: 'messages', icon: MessageSquare, label: t('Messages', 'الرسائل', 'Messages'), badge: totalUnreadMessages },
          { id: 'questions', icon: HelpCircle, label: t('Questions', 'الأسئلة', 'Questions'), badge: unanswered },
          { id: 'schedule', icon: Calendar, label: t('Schedule', 'الجدول', 'Planning') },
          { id: 'profile', icon: User, label: t('Profile', 'الملف الشخصي', 'Profil') },
        ] as { id: Tab; icon: any; label: string; badge?: number }[]).map(({ id, icon: Icon, label, badge }) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              if (id !== 'messages') setSelectedConv(null);
            }}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-all touch-press ${
              tab === id ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {badge != null && badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold">{label}</span>
          </button>
        ))}
      </div>

      {/* Profile Edit Modal */}
      {isEditingProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setIsEditingProfileModal(false)} />
          <div className="relative w-full max-w-md max-h-[88dvh] overflow-y-auto bg-white rounded-3xl p-5 shadow-2xl space-y-4 border border-gray-100 z-10 animate-slide-up">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-base">{t('Edit Profile', 'تعديل الملف الشخصي', 'Modifier le profil')}</h3>
              <button onClick={() => setIsEditingProfileModal(false)} className="p-1.5 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {profileSuccessMsg && (
              <div className="p-3 bg-green-50 text-green-700 font-semibold text-xs rounded-xl flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span>{profileSuccessMsg}</span>
              </div>
            )}

            <div className="space-y-3.5">
              {/* Profile Photo */}
              <div className="flex items-center gap-3">
                <img
                  src={editAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'Tutor')}&background=2563EB&color=fff&size=120`}
                  alt={user.name}
                  className="w-14 h-14 rounded-2xl object-cover border border-gray-200 flex-shrink-0"
                />
                <label className="flex-1 py-2.5 px-3 border border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 text-blue-600 rounded-xl text-xs font-bold text-center cursor-pointer transition-colors">
                  {avatarUploading ? t('Uploading...', 'جاري الرفع...', 'Téléchargement...') : t('Upload Profile Photo', 'رفع الصورة الشخصية', 'Changer la photo')}
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={avatarUploading} />
                </label>
              </div>

              {/* Bio with 600 char limit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-700">{t('Bio / About', 'نبذة عنك', 'À propos')}</label>
                  <span className="text-[10px] text-gray-400">{editBio.length}/600</span>
                </div>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value.slice(0, 600))}
                  maxLength={600}
                  rows={3}
                  placeholder={t('Describe your teaching experience and approach...', 'اكتب نبذة عن خبرتك وأسلوبك في التدريس...', 'Décrivez votre expérience...')}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                />
              </div>

              {/* Specialty / Category */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">{t('Specialty / Category', 'التخصص الرئيسي', 'Spécialité / Catégorie')}</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  placeholder={t('e.g. School Education, Languages, Technology & Finance', 'مثال: التعليم المدرسي، اللغات...', 'Ex: Éducation, Langues...')}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              {/* Subjects */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">{t('Subjects', 'المواد الدراسية', 'Matières')}</label>
                <div className="flex gap-1.5 mb-2">
                  <input
                    type="text"
                    value={newSubjectInput}
                    onChange={e => setNewSubjectInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newSubjectInput.trim()) {
                        e.preventDefault();
                        const val = newSubjectInput.trim();
                        if (!editSubjects.includes(val)) setEditSubjects(prev => [...prev, val]);
                        setNewSubjectInput('');
                      }
                    }}
                    placeholder={t('Add subject (e.g. Mathematics)', 'أضف مادة (مثال: الرياضيات)', 'Ajouter une matière')}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = newSubjectInput.trim();
                      if (val && !editSubjects.includes(val)) setEditSubjects(prev => [...prev, val]);
                      setNewSubjectInput('');
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {editSubjects.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                      {s}
                      <button type="button" onClick={() => setEditSubjects(prev => prev.filter(x => x !== s))} className="hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Languages */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">{t('Languages', 'اللغات', 'Langues')}</label>
                <div className="flex gap-1.5 mb-2">
                  <input
                    type="text"
                    value={newLanguageInput}
                    onChange={e => setNewLanguageInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newLanguageInput.trim()) {
                        e.preventDefault();
                        const val = newLanguageInput.trim();
                        if (!editLanguages.includes(val)) setEditLanguages(prev => [...prev, val]);
                        setNewLanguageInput('');
                      }
                    }}
                    placeholder={t('Add language (e.g. Arabic, French)', 'أضف لغة (مثال: العربية، الفرنسية)', 'Ajouter une langue')}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = newLanguageInput.trim();
                      if (val && !editLanguages.includes(val)) setEditLanguages(prev => [...prev, val]);
                      setNewLanguageInput('');
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {editLanguages.map(l => (
                    <span key={l} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                      {l}
                      <button type="button" onClick={() => setEditLanguages(prev => prev.filter(x => x !== l))} className="hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Experience & Hourly Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">{t('Years of Experience', 'سنوات الخبرة', 'Années d\'expérience')}</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={editExperienceYears}
                    onChange={e => setEditExperienceYears(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">{t('Hourly Rate (DZD)', 'السعر بالساعة (دج)', 'Tarif horaire')}</label>
                  <input
                    type="number"
                    min={0}
                    value={editHourlyRate}
                    onChange={e => setEditHourlyRate(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsEditingProfileModal(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-xs transition-all"
              >
                {t('Cancel', 'إلغاء', 'Annuler')}
              </button>
              <button
                onClick={handleSaveProfileModal}
                disabled={isSavingProfile || avatarUploading}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-200 transition-all disabled:opacity-50"
              >
                {isSavingProfile ? '...' : t('Save Changes', 'حفظ التغييرات', 'Enregistrer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Edit Modal */}
      {isEditingScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setIsEditingScheduleModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-gray-100 z-10 max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-base">{t('Edit Schedule & Availability', 'تعديل جدول الحصص والأوقات', 'Modifier le planning')}</h3>
              <button onClick={() => setIsEditingScheduleModal(false)} className="p-1.5 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {scheduleSuccessMsg && (
              <div className="p-3 bg-green-50 text-green-700 font-semibold text-xs rounded-xl flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span>{scheduleSuccessMsg}</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="bg-gray-50 p-3 rounded-2xl space-y-2 border border-gray-100">
                <p className="text-xs font-bold text-gray-800">{t('Add Available Slot', 'إضافة موعد متاح')}</p>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={newSlotDay}
                    onChange={e => setNewSlotDay(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium"
                  >
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={newSlotStart}
                    onChange={e => setNewSlotStart(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-gray-200 rounded-xl text-xs"
                  />
                  <input
                    type="time"
                    value={newSlotEnd}
                    onChange={e => setNewSlotEnd(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-gray-200 rounded-xl text-xs"
                  />
                </div>
                <button
                  onClick={handleAddSlot}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('Add Slot', 'إضافة موعد')}
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-700">{t('Current Slots', 'المواعيد الحالية')}</p>
                {editScheduleList.map((slot, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-white border border-gray-100 rounded-xl shadow-sm">
                    <span className="text-xs font-semibold text-gray-800">{slot.day} · {slot.startTime} - {slot.endTime}</span>
                    <button onClick={() => handleRemoveSlot(i)} className="p-1 text-red-500 hover:bg-red-50 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {editScheduleList.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">{t('No slots added', 'لم يتم إضافة مواعيد بعد')}</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsEditingScheduleModal(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-xs transition-all"
              >
                {t('Cancel', 'إلغاء')}
              </button>
              <button
                onClick={handleSaveScheduleModal}
                disabled={isSavingSchedule}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-200 transition-all disabled:opacity-50"
              >
                {isSavingSchedule ? '...' : t('Save Schedule', 'حفظ الجدول', 'Enregistrer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
