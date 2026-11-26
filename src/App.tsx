import { useState, useEffect } from 'react';
import AuthScreen from './components/AuthScreen';
import TutorRegisterScreen from './components/TutorRegisterScreen';
import TutorDashboard from './components/TutorDashboard';
import StudentApp from './components/StudentApp';
import type { TutorProfile } from './components/TutorRegisterScreen';
import AdminDashboard from './components/AdminDashboard';
import SetPasswordModal from './components/SetPasswordModal';
import { Loader2 } from 'lucide-react';
import { supabase, authLog } from './lib/supabase';
import { handleOAuthDeepLink } from './lib/androidAuth';
import { trackEvent, requestNotificationPermission } from './lib/firebase';

type User = {
  name: string;
  email: string;
  role: 'student' | 'tutor' | 'admin';
  id: string;
};

type AppState = 'auth' | 'tutor-register' | 'tutor-dashboard' | 'student-app' | 'admin-dashboard';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [appState, setAppState] = useState<AppState>('auth');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSetPasswordOpen, setIsSetPasswordOpen] = useState(false);
  const [tutorProfile, setTutorProfile] = useState<TutorProfile | null>(null);
  const [language, setLanguage] = useState<'en' | 'ar' | 'fr'>(() => {
    const stored = localStorage.getItem('tm_lang');
    return stored === 'ar' || stored === 'fr' ? stored : 'en';
  });

  const [initialAuthBanner, setInitialAuthBanner] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const rawRoom = new URLSearchParams(window.location.search).get('room');
    const cleanRoom = rawRoom && /^[A-Za-z0-9_-]{3,100}$/.test(rawRoom.trim()) ? rawRoom.trim() : null;
    if (cleanRoom) {
      sessionStorage.setItem('tm_pending_room_id', cleanRoom);
      return cleanRoom;
    }
    const cached = sessionStorage.getItem('tm_pending_room_id');
    return cached && /^[A-Za-z0-9_-]{3,100}$/.test(cached) ? cached : null;
  });

  const isTutorProfileComplete = (tutor: any) =>
    Boolean(
      tutor?.id &&
      (
        (tutor.category && String(tutor.category).trim() !== '') ||
        (Array.isArray(tutor.subjects) && tutor.subjects.length > 0) ||
        tutor.status === 'approved'
      )
    );

  const mapDbTutorToProfile = (tutor: any): TutorProfile => ({
    name: tutor.name,
    nameAr: tutor.name_ar || tutor.name || '',
    bio: tutor.bio || '',
    bioAr: tutor.bio_ar || '',
    subjects: tutor.subjects || [],
    hourlyRate: Number(tutor.hourly_rate || 0),
    experienceYears: tutor.experience_years || 0,
    languages: tutor.languages || [],
    videoUrl: tutor.video_url || '',
    schedule: [],
    category: tutor.category || '',
    status: tutor.status || 'pending',
    certificates: tutor.certificates || [],
    identityVerified: tutor.identity_verified || false,
    avatarUrl: tutor.avatar_url || '',
    idDocumentUrl: tutor.id_document_url || '',
    meetingSettings: tutor.meeting_settings || undefined
  });

  useEffect(() => {
    localStorage.setItem('tm_lang', language);
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      const search = window.location.search;

      const searchParams = new URLSearchParams(search);
      const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
      const oauthErrorDesc = searchParams.get('error_description') || hashParams.get('error_description') || searchParams.get('error') || hashParams.get('error');

      if (search.includes('error_code=otp_expired') || hash.includes('error_code=otp_expired') || search.includes('expired') || hash.includes('expired')) {
        setInitialAuthBanner({
          type: 'warning',
          message: language === 'ar'
            ? 'رابط تفعيل البريد الإلكتروني انتهت صلاحيته. يرجى إدخال بريدك والنقر على "إعادة إرسال رابط التفعيل".'
            : 'Your email verification link has expired. Please enter your email and click "Resend Verification Email".'
        });
        window.history.replaceState(null, '', window.location.pathname);
      } else if (oauthErrorDesc) {
        setInitialAuthBanner({
          type: 'error',
          message: decodeURIComponent(oauthErrorDesc.replace(/\+/g, ' '))
        });
        window.history.replaceState(null, '', window.location.pathname);
      } else if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        authLog('Detected password recovery redirect link in URL!');
        setIsSetPasswordOpen(true);
        window.history.replaceState(null, '', window.location.pathname);
      } else if (hash.includes('type=signup') || search.includes('type=signup')) {
        setInitialAuthBanner({
          type: 'success',
          message: language === 'ar'
            ? 'تم تفعيل حسابك وبريدك الإلكتروني بنجاح! يمكنك الآن تسجيل الدخول.'
            : 'Your email has been successfully verified! You can now sign in to your account.'
        });
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [language]);

  // Hide the inline dark splash overlay smoothly only AFTER React mounts and auth state resolves
  useEffect(() => {
    if (isAuthLoading || typeof document === 'undefined') return;
    const splash = document.getElementById('tm-initial-splash');
    if (!splash) return;
    const raf = requestAnimationFrame(() => {
      splash.classList.add('tm-splash-hidden');
      window.setTimeout(() => {
        splash.remove();
      }, 260);
    });
    return () => cancelAnimationFrame(raf);
  }, [isAuthLoading]);

  useEffect(() => {
    let appUrlListener: any = null;
    let isMounted = true;
    let initialResolved = false;

    // 1. Global Capacitor Deep-Link listener for Mobile App
    const CapacitorApp = (window as any).Capacitor?.Plugins?.App;
    if (CapacitorApp?.addListener) {
      authLog('Registering global Capacitor appUrlOpen deep-link listener...');
      CapacitorApp.addListener('appUrlOpen', async (event: { url: string }) => {
        authLog(`Global appUrlOpen received deep link: ${event.url}`);
        if (event.url) {
          const ok = await handleOAuthDeepLink(event.url);
          if (ok) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              await handleSessionUser(session.user);
            }
          }
        }
      }).then((l: any) => { appUrlListener = l; });
    }

    // Safety ceiling timer so splash can never hang indefinitely on offline networks
    const loadingTimeout = setTimeout(() => {
      if (isMounted) setIsAuthLoading(false);
    }, 8000);

    const cleanOAuthParamsFromUrl = () => {
      if (typeof window === 'undefined') return;
      const hasParams =
        window.location.search.includes('code=') ||
        window.location.hash.includes('access_token=') ||
        window.location.hash.includes('refresh_token=');
      if (!hasParams) return;
      if (window.location.protocol !== 'file:') {
        window.history.replaceState(null, '', window.location.pathname);
      } else {
        window.location.hash = '';
      }
    };

    // Guard against concurrent duplicate handleSessionUser calls for the same user
    let inFlightUserId: string | null = null;
    const scheduleSessionUser = (sessionUser: any) => {
      if (!sessionUser?.id) return;
      if (inFlightUserId === sessionUser.id) return;
      inFlightUserId = sessionUser.id;
      // CRITICAL: Defer outside Supabase's onAuthStateChange callback so GoTrue releases
      // its internal navigator.locks auth lock before supabase.from(...) calls getSession().
      setTimeout(() => {
        if (!isMounted) {
          inFlightUserId = null;
          return;
        }
        handleSessionUser(sessionUser)
          .catch((err) => {
            authLog(`handleSessionUser error: ${err?.message || err}`);
          })
          .finally(() => {
            inFlightUserId = null;
            if (isMounted) {
              initialResolved = true;
              setIsAuthLoading(false);
              clearTimeout(loadingTimeout);
            }
          });
      }, 0);
    };

    // 2. Register a single onAuthStateChange listener FIRST so no SIGNED_IN / INITIAL_SESSION event is ever missed.
    //    NEVER await supabase.from()/rpc() directly inside this callback (causes @supabase/auth-js v2 lock deadlock).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      authLog(`onAuthStateChange event fired: "${event}", userId: "${session?.user?.id || 'none'}"`);

      if (event === 'SIGNED_OUT') {
        authLog('User signed out event received. Clearing state & directing to login.');
        localStorage.removeItem('tm_user_session');
        localStorage.removeItem('tm_pending_oauth_role');
        inFlightUserId = null;
        if (isMounted) {
          setUser(null);
          setTutorProfile(null);
          setAppState('auth');
          setIsAuthLoading(false);
          clearTimeout(loadingTimeout);
        }
        return;
      }

      if (
        session?.user &&
        (event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED')
      ) {
        cleanOAuthParamsFromUrl();
        scheduleSessionUser(session.user);
      }
    });

    // 3. Deterministic auth initialization:
    //    CRITICAL: Always await supabase.auth.getSession() FIRST so @supabase/auth-js
    //    (detectSessionInUrl: true, flowType: 'pkce') finishes its internal PKCE ?code= exchange
    //    WITHOUT racing against a duplicate exchangeCodeForSession() or stripping ?code= prematurely.
    const initAuth = async () => {
      authLog('Starting initAuth execution...');
      try {
        authLog('Awaiting supabase.auth.getSession() (allows detectSessionInUrl PKCE exchange to finish)...');
        let { data: { session }, error: sessionError } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AUTH_SESSION_TIMEOUT')), 7000))
        ]);
        if (sessionError) {
          authLog(`getSession notice: ${sessionError.message}`);
        }

        // Fallback ONLY if getSession() did not yet produce a session and OAuth params remain in URL
        // (e.g., Android WebView file:///android_asset/index.html#access_token=... or ?code=...)
        if (!session && typeof window !== 'undefined') {
          const fullUrl = window.location.href;
          if (fullUrl.includes('access_token=') || fullUrl.includes('code=')) {
            authLog('Session not yet hydrated from URL; running handleOAuthDeepLink fallback...');
            const ok = await handleOAuthDeepLink(fullUrl);
            if (ok) {
              const retry = await supabase.auth.getSession();
              session = retry.data.session;
            }
          }
        }

        if (session?.user) {
          cleanOAuthParamsFromUrl();
          authLog(`Active Supabase session retrieved for user: ${session.user.id}`);
          await handleSessionUser(session.user);
          initialResolved = true;
        } else if (!initialResolved) {
          if (localStorage.getItem('tm_user_session')) {
            authLog('No active Supabase JWT session found; clearing stale local session.');
            localStorage.removeItem('tm_user_session');
          }
          if (isMounted) {
            setUser(null);
            setAppState('auth');
          }
          authLog('No session found. Directing to Sign In page');
        }
      } catch (err: any) {
        authLog(`initAuth exception caught: ${err?.message || err}`);
        if (isMounted && !initialResolved) {
          setAppState('auth');
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
        clearTimeout(loadingTimeout);
        authLog('initAuth finished. isAuthLoading set to false');
      }
    };

    initAuth();

    return () => {
      isMounted = false;
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
      if (appUrlListener?.remove) appUrlListener.remove();
    };
  }, []);

  const handleSessionUser = async (authUser: any) => {
    if (!authUser?.id) {
      setIsAuthLoading(false);
      return;
    }
    authLog(`handleSessionUser processing for user: ${authUser.id} (${authUser.email})`);

    const pendingRole = localStorage.getItem('tm_pending_oauth_role') as 'student' | 'tutor' | 'admin' | null;
    const defaultName =
      authUser.user_metadata?.full_name ||
      authUser.user_metadata?.name ||
      authUser.email?.split('@')[0] ||
      'User';

    const fastFetch = <T,>(p: PromiseLike<T>, ms = 4500): Promise<T> => {
      return Promise.race([
        Promise.resolve(p),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
      ]);
    };

    let profile: any = null;
    let tutorRow: any = null;

    try {
      const [{ data: profData, error: profErr }, { data: tutData }] = await Promise.all([
        fastFetch(
          supabase
            .from('profiles')
            .select('full_name, role, avatar_url')
            .eq('user_id', authUser.id)
            .maybeSingle()
        ).catch((err) => ({ data: null, error: err } as any)),
        fastFetch(
          supabase
            .from('tutors')
            .select('*')
            .eq('user_id', authUser.id)
            .maybeSingle()
        ).catch(() => ({ data: null } as any))
      ]);
      if (profErr) {
        authLog(`Profile query notice: ${profErr?.message || profErr}`);
      }
      profile = profData;
      tutorRow = tutData;

      // Determine authoritative role strictly from server profile / tutor records (never client email matching)
      let resolvedRole: 'student' | 'tutor' | 'admin';
      if (profile?.role === 'admin') {
        resolvedRole = 'admin';
      } else if (tutorRow?.id || profile?.role === 'tutor') {
        resolvedRole = 'tutor';
      } else if (pendingRole === 'tutor' || authUser.user_metadata?.role === 'tutor') {
        resolvedRole = 'tutor';
      } else {
        resolvedRole = 'student';
      }

      // Ensure profiles row exists (never hang on upsert — bounded by fastFetch)
      if (!profile || (pendingRole === 'tutor' && profile.role === 'student' && !tutorRow?.id)) {
        try {
          await fastFetch(
            supabase.from('profiles').upsert(
              {
                user_id: authUser.id,
                full_name: profile?.full_name || defaultName,
                role: resolvedRole,
                avatar_url: profile?.avatar_url || authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null
              },
              { onConflict: 'user_id' }
            ),
            4000
          );
        } catch (upsertErr: any) {
          authLog(`Profile upsert notice: ${upsertErr?.message || upsertErr}`);
        }
      }

      // Ensure a pending tutors row exists for brand-new Google tutors immediately
      if (resolvedRole === 'tutor' && !tutorRow?.id) {
        try {
          const { data: createdTutor } = await fastFetch(
            supabase
              .from('tutors')
              .upsert(
                {
                  user_id: authUser.id,
                  name: profile?.full_name || defaultName,
                  name_ar: profile?.full_name || defaultName,
                  email: authUser.email || null,
                  avatar_url: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null,
                  status: 'pending',
                  is_verified: false
                },
                { onConflict: 'user_id' }
              )
              .select('*')
              .maybeSingle(),
            4000
          );
          if (createdTutor) tutorRow = createdTutor;
        } catch (tutUpsertErr: any) {
          authLog(`Tutor upsert notice: ${tutUpsertErr?.message || tutUpsertErr}`);
        }
      }

      if (pendingRole) {
        localStorage.removeItem('tm_pending_oauth_role');
      }

      const updatedUser: User = {
        id: authUser.id,
        name: profile?.full_name || defaultName,
        email: authUser.email || '',
        role: resolvedRole
      };

      localStorage.setItem('tm_user_session', JSON.stringify(updatedUser));
      setUser(updatedUser);

      if (resolvedRole === 'admin') {
        setAppState('admin-dashboard');
      } else if (resolvedRole === 'student') {
        setAppState('student-app');
      } else {
        if (isTutorProfileComplete(tutorRow)) {
          localStorage.setItem(`tm_tutor_reg_${authUser.id}`, 'true');
          setTutorProfile(mapDbTutorToProfile(tutorRow));
          setAppState('tutor-dashboard');
        } else {
          if (tutorRow) setTutorProfile(mapDbTutorToProfile(tutorRow));
          setAppState('tutor-register');
        }
      }

      trackEvent('user_session_active', { role: updatedUser.role, user_id: updatedUser.id });
      requestNotificationPermission().catch(() => {});
    } catch (err: any) {
      authLog(`handleSessionUser unexpected error: ${err?.message || err}`);
      const fallbackUser: User = {
        id: authUser.id,
        name: defaultName,
        email: authUser.email || '',
        role: 'student'
      };
      setUser(fallbackUser);
      setAppState('student-app');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAuth = async (u: User) => {
    setUser(u);
    trackEvent('user_logged_in', { role: u.role, user_id: u.id });
    requestNotificationPermission().catch(() => {});

    if (u.role === 'admin') {
      setAppState('admin-dashboard');
      return;
    }

    // Always check if this user has an existing tutor profile in the tutors table
    try {
      const { data: tutor } = await supabase
        .from('tutors')
        .select('*')
        .eq('user_id', u.id)
        .maybeSingle();

      if (tutor?.id) {
        authLog(`Found existing tutor profile for user ${u.id}:`, tutor.name);
        const updatedUser: User = { ...u, role: 'tutor' };
        setUser(updatedUser);
        localStorage.setItem('tm_user_session', JSON.stringify(updatedUser));
        setTutorProfile(mapDbTutorToProfile(tutor));

        if (isTutorProfileComplete(tutor)) {
          localStorage.setItem(`tm_tutor_reg_${u.id}`, 'true');
          setAppState('tutor-dashboard');
        } else {
          setAppState('tutor-register');
        }
        return;
      }
    } catch (e) {
      authLog('Notice checking tutors table in handleAuth:', e);
    }

    if (u.role === 'student') {
      setAppState('student-app');
    } else {
      setAppState('tutor-register');
    }
  };

  const handleTutorComplete = async (profile: TutorProfile) => {
    if (!user) return;

    // 1. Upsert tutor application into tutors table (conflict on user_id preserves existing pending row)
    const { data: tutorData, error: tutorError } = await supabase
      .from('tutors')
      .upsert(
        {
          user_id: user.id,
          name: profile.name,
          name_ar: profile.nameAr || profile.name,
          email: user.email || null,
          bio: profile.bio,
          bio_ar: profile.bioAr || profile.bio,
          subjects: profile.subjects,
          hourly_rate: profile.hourlyRate,
          experience_years: profile.experienceYears || 0,
          languages: profile.languages,
          category: profile.category,
          video_url: profile.videoUrl || null,
          is_online: false,
          response_time: null,
          is_verified: false,
          status: 'pending',
          certificates: profile.certificates || [],
          identity_verified: profile.identityVerified || false,
          avatar_url: profile.avatarUrl || null,
          id_document_url: profile.idDocumentUrl || null,
          meeting_settings: profile.meetingSettings || null
        },
        { onConflict: 'user_id' }
      )
      .select()
      .maybeSingle();

    if (tutorError) {
      console.error('Supabase tutor upsert error:', tutorError);
      throw new Error(`Database save failed: ${tutorError.message}`);
    }

    if (!tutorData?.id) {
      throw new Error('Database saved record but failed to return valid tutor ID.');
    }

    // 2. Ensure user profile role is set to tutor in profiles table
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          full_name: profile.name || user.name,
          role: 'tutor',
          avatar_url: profile.avatarUrl || null
        },
        { onConflict: 'user_id' }
      );

    if (profileUpdateError) {
      console.warn('Profiles role update warning:', profileUpdateError.message);
    }

    // 3. Update local user state to tutor role
    const updatedUser: User = { ...user, role: 'tutor' };
    setUser(updatedUser);
    localStorage.setItem('tm_user_session', JSON.stringify(updatedUser));
    localStorage.setItem(`tm_tutor_reg_${user.id}`, 'true');

    // 4. Save schedule slots if provided
    if (profile.schedule && profile.schedule.length > 0) {
      const DAY_MAP: Record<string, number> = {
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
      };

      const schedulesToInsert = profile.schedule
        .map(s => {
          const start = (s.startTime || '09:00').slice(0, 5);
          let end = (s.endTime || '12:00').slice(0, 5);
          if (end <= start) {
            const startHour = Math.min(22, parseInt(start.split(':')[0] || '9', 10));
            end = `${String(startHour + 1).padStart(2, '0')}:00`;
          }
          return {
            tutor_id: tutorData.id,
            day_of_week: DAY_MAP[s.day] ?? 1,
            start_time: `${start}:00`,
            end_time: `${end}:00`,
            is_available: true
          };
        });

      await supabase.from('schedules').delete().eq('tutor_id', tutorData.id);
      const { error: scheduleError } = await supabase
        .from('schedules')
        .insert(schedulesToInsert);
      if (scheduleError) {
        console.warn('Schedules insert notice (non-fatal):', scheduleError.message);
      }
    }

    // 5. Update application state
    setTutorProfile(profile);
    setAppState('tutor-dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('tm_user_session');
    localStorage.removeItem('tm_pending_oauth_role');
    sessionStorage.clear();
    setUser(null);
    setTutorProfile(null);
    setAppState('auth');
    supabase.auth.signOut().catch(() => {});
  };


  if (isAuthLoading) {
    return (
      <div className="min-h-[100dvh] w-full bg-white flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center">
          <span className={`text-4xl font-black tracking-tight bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent mb-4 ${language === 'ar' ? 'font-cairo py-1' : ''}`}>
            {language === 'ar' ? 'علمني' : 'Teach Me'}
          </span>
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (appState === 'auth') {
    return <AuthScreen onAuth={handleAuth} language={language} onChangeLanguage={setLanguage} initialBanner={initialAuthBanner} />;
  }

  if (appState === 'tutor-register' && user) {
    return (
      <TutorRegisterScreen
        user={user}
        onBack={handleLogout}
        onComplete={handleTutorComplete}
        language={language}
      />
    );
  }

  if (appState === 'tutor-dashboard' && user) {
    return (
      <TutorDashboard
        user={user}
        profile={tutorProfile}
        onLogout={handleLogout}
        onEditProfile={() => {}}
        language={language}
        onChangeLanguage={setLanguage}
      />
    );
  }

  if (appState === 'student-app' && user) {
    return (
      <>
        <StudentApp
          user={user}
          onLogout={handleLogout}
          language={language}
          onChangeLanguage={setLanguage}
          onOpenSetPassword={() => setIsSetPasswordOpen(true)}
          initialRoomId={pendingRoomId}
          onConsumeInitialRoom={() => {
            setPendingRoomId(null);
            sessionStorage.removeItem('tm_pending_room_id');
            if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
              window.history.replaceState(null, '', window.location.pathname);
            }
          }}
        />
        <SetPasswordModal
          isOpen={isSetPasswordOpen}
          onClose={() => setIsSetPasswordOpen(false)}
          language={language}
        />
      </>
    );
  }
 
  if (appState === 'admin-dashboard' && user) {
    if (user.role !== 'admin') {
      return (
        <>
          <StudentApp
            user={user}
            onLogout={handleLogout}
            language={language}
            onChangeLanguage={setLanguage}
            onOpenSetPassword={() => setIsSetPasswordOpen(true)}
          />
          <SetPasswordModal
            isOpen={isSetPasswordOpen}
            onClose={() => setIsSetPasswordOpen(false)}
            language={language}
          />
        </>
      );
    }
    return (
      <>
        <AdminDashboard
          user={user}
          onLogout={handleLogout}
          language={language}
          onChangeLanguage={setLanguage}
        />
        <SetPasswordModal
          isOpen={isSetPasswordOpen}
          onClose={() => setIsSetPasswordOpen(false)}
          language={language}
        />
      </>
    );
  }

  return (
    <>
      <AuthScreen onAuth={handleAuth} language={language} onChangeLanguage={setLanguage} initialBanner={initialAuthBanner} />
      <SetPasswordModal
        isOpen={isSetPasswordOpen}
        onClose={() => setIsSetPasswordOpen(false)}
        language={language}
      />
    </>
  );

}
