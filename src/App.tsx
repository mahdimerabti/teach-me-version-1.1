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
  const [tutorRegistered, setTutorRegistered] = useState(false);
  const [language, setLanguage] = useState<'en' | 'ar' | 'fr'>(() =>
    (localStorage.getItem('tm_lang') as 'en' | 'ar' | 'fr') || 'en'
  );

  const [initialAuthBanner, setInitialAuthBanner] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  useEffect(() => {
    localStorage.setItem('tm_lang', language);
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      const search = window.location.search;

      if (search.includes('error_code=otp_expired') || hash.includes('error_code=otp_expired') || search.includes('expired') || hash.includes('expired')) {
        setInitialAuthBanner({
          type: 'warning',
          message: language === 'ar'
            ? 'رابط تفعيل البريد الإلكتروني انتهت صلاحيته. يرجى إدخال بريدك والنقر على "إعادة إرسال رابط التفعيل".'
            : 'Your email verification link has expired. Please enter your email and click "Resend Verification Email".'
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

  useEffect(() => {
    let appUrlListener: any = null;

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

    // 2. Local storage session recovery (instant UI launch)
    const savedUserStr = localStorage.getItem('tm_user_session');
    let hasLocalSession = false;
    if (savedUserStr) {
      try {
        const savedUser: User = JSON.parse(savedUserStr);
        setUser(savedUser);
        hasLocalSession = true;
        authLog('Restored local user session from localStorage:', savedUser.email);
        if (savedUser.role === 'admin') setAppState('admin-dashboard');
        else if (savedUser.role === 'student') setAppState('student-app');
        else setAppState(tutorRegistered ? 'tutor-dashboard' : 'tutor-register');
        setIsAuthLoading(false); // Instant unlock! Zero wait time
      } catch (e) {
        authLog('Error parsing saved local session:', e);
      }
    }

    // Fast 1.5s fallback safety timer to guarantee loading screen never freezes
    const loadingTimeout = setTimeout(() => {
      setIsAuthLoading(false);
    }, 1500);

    // 3. Complete & robust auth initialization flow
    const initAuth = async () => {
      authLog('Starting initAuth execution...');
      try {
        if (typeof window !== 'undefined') {
          const search = window.location.search;
          const hash = window.location.hash;
          authLog(`Checking current window location. Search: "${search}", Hash: "${hash}"`);

          const urlParams = new URLSearchParams(search);
          const code = urlParams.get('code');

          if (code) {
            authLog(`OAuth authorization code found in URL ("${code}"). Exchanging code for session...`);
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              authLog(`exchangeCodeForSession notice: ${error.message} (Will fallback to getSession)`);
            } else if (data?.session?.user) {
              authLog(`Successfully exchanged PKCE code for user session: ${data.session.user.id}`);
              await handleSessionUser(data.session.user);
              setIsAuthLoading(false);
              clearTimeout(loadingTimeout);
              window.history.replaceState(null, '', window.location.pathname);
              return;
            }
            window.history.replaceState(null, '', window.location.pathname);
          }
        }

        // Fetch Supabase session
        authLog('Querying supabase.auth.getSession()...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          authLog(`getSession error notice: ${sessionError.message}`);
        }

        if (session?.user) {
          authLog(`Active Supabase session retrieved for user: ${session.user.id}`);
          await handleSessionUser(session.user);
        } else if (hasLocalSession) {
          authLog('No active Supabase session, using saved local user session');
        } else {
          authLog('No session found. Directing to Sign In page');
          setAppState('auth');
        }

        if (typeof window !== 'undefined' && (window.location.hash.includes('access_token=') || window.location.search.includes('code='))) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (err: any) {
        authLog(`initAuth exception caught: ${err?.message || err}`);
      } finally {
        setIsAuthLoading(false);
        clearTimeout(loadingTimeout);
        authLog('initAuth finished. isAuthLoading set to false');
      }
    };

    initAuth();

    // 4. Listen to Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      authLog(`onAuthStateChange event fired: "${event}", userId: "${session?.user?.id || 'none'}"`);
      if (session?.user) {
        await handleSessionUser(session.user);
        setIsAuthLoading(false);
      } else if (event === 'SIGNED_OUT') {
        authLog('User signed out event received. Clearing state & directing to login.');
        localStorage.removeItem('tm_user_session');
        localStorage.removeItem('tm_pending_oauth_role');
        setUser(null);
        setTutorProfile(null);
        setTutorRegistered(false);
        setAppState('auth');
        setIsAuthLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (appUrlListener?.remove) appUrlListener.remove();
    };
  }, []);

  const handleSessionUser = async (authUser: any) => {
    if (!authUser?.id) return;
    authLog(`handleSessionUser processing for user: ${authUser.id} (${authUser.email})`);

    const pendingRole = localStorage.getItem('tm_pending_oauth_role') as 'student' | 'tutor' | 'admin' | null;
    const userRole: 'student' | 'tutor' | 'admin' =
      pendingRole || (authUser.user_metadata?.role as any) || 'student';

    const defaultName = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User';

    const initialUser: User = {
      id: authUser.id,
      name: defaultName,
      email: authUser.email || '',
      role: userRole
    };

    // INSTANT UNLOCK & NAVIGATION: 0ms wait time
    authLog(`Instantly unlocking dashboard for role "${userRole}"...`);
    localStorage.setItem('tm_user_session', JSON.stringify(initialUser));
    setUser(initialUser);
    setIsAuthLoading(false);

    if (userRole === 'admin') {
      setAppState('admin-dashboard');
    } else if (userRole === 'student') {
      setAppState('student-app');
    } else {
      // Check if tutor is already registered to avoid temporary flickering to register screen
      const isLocallyRegistered = localStorage.getItem(`tm_tutor_reg_${authUser.id}`) === 'true';
      if (isLocallyRegistered) {
        setAppState('tutor-dashboard');
      } else {
        try {
          const { data: quickTutor } = await supabase
            .from('tutors')
            .select('id')
            .eq('user_id', authUser.id)
            .maybeSingle();

          if (quickTutor?.id) {
            localStorage.setItem(`tm_tutor_reg_${authUser.id}`, 'true');
            setAppState('tutor-dashboard');
          } else {
            setAppState('tutor-register');
          }
        } catch (_) {
          setAppState('tutor-register');
        }
      }
    }

    // Background profile & tutor sync
    try {
      const fastFetch = <T,>(p: PromiseLike<T>, ms = 1500): Promise<T> => {
        return Promise.race([
          Promise.resolve(p),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
        ]);
      };

      let profile: any = null;
      try {
        const { data: profData } = await fastFetch(
          supabase
            .from('profiles')
            .select('full_name, role')
            .eq('user_id', authUser.id)
            .maybeSingle(),
          1500
        );
        if (profData) profile = profData;
      } catch (_) {}

      if (pendingRole) {
        try {
          await supabase.from('profiles').upsert({
            user_id: authUser.id,
            full_name: defaultName,
            role: pendingRole
          });
        } catch (_) {}
        localStorage.removeItem('tm_pending_oauth_role');
      }

      let registered = false;
      let tProfile: TutorProfile | null = null;

      if (userRole === 'tutor') {
        try {
          const { data: tutor } = await fastFetch(
            supabase
              .from('tutors')
              .select('*')
              .eq('user_id', authUser.id)
              .maybeSingle(),
            1500
          );

          if (tutor) {
            registered = true;
            tProfile = {
              name: tutor.name,
              nameAr: tutor.name_ar,
              bio: tutor.bio,
              bioAr: tutor.bio_ar,
              subjects: tutor.subjects || [],
              hourlyRate: Number(tutor.hourly_rate || 0),
              experienceYears: tutor.experience_years || 0,
              languages: tutor.languages || [],
              videoUrl: tutor.video_url || '',
              schedule: [],
              category: tutor.category || '',
              status: tutor.status || 'pending',
              certificates: tutor.certificates || [],
              identityVerified: tutor.identity_verified || false
            };
            setAppState('tutor-dashboard');
          } else {
            setAppState('tutor-register');
          }
        } catch (_) {
          setAppState('tutor-register');
        }
      }

      const updatedUser: User = {
        id: authUser.id,
        name: profile?.full_name || defaultName,
        email: authUser.email || '',
        role: (profile?.role as any) || userRole
      };

      localStorage.setItem('tm_user_session', JSON.stringify(updatedUser));
      setUser(updatedUser);
      setTutorRegistered(registered);
      if (tProfile) setTutorProfile(tProfile);

      trackEvent('user_session_active', { role: updatedUser.role, user_id: updatedUser.id });
      requestNotificationPermission().catch(() => {});
    } catch (err: any) {
      authLog(`Background handleSessionUser notice: ${err?.message || err}`);
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
        .or(`user_id.eq.${u.id},id.eq.${u.id}`)
        .maybeSingle();

      if (tutor?.id) {
        authLog(`Found existing tutor profile for user ${u.id}:`, tutor.name);
        localStorage.setItem(`tm_tutor_reg_${u.id}`, 'true');
        const updatedUser: User = { ...u, role: 'tutor' };
        setUser(updatedUser);
        localStorage.setItem('tm_user_session', JSON.stringify(updatedUser));
        setTutorRegistered(true);
        setTutorProfile({
          name: tutor.name,
          nameAr: tutor.name_ar,
          bio: tutor.bio,
          bioAr: tutor.bio_ar,
          subjects: tutor.subjects || [],
          hourlyRate: Number(tutor.hourly_rate || 0),
          experienceYears: tutor.experience_years || 0,
          languages: tutor.languages || [],
          videoUrl: tutor.video_url || '',
          schedule: [],
          category: tutor.category || '',
          status: tutor.status || 'pending',
          certificates: tutor.certificates || [],
          identityVerified: tutor.identity_verified || false
        });
        setAppState('tutor-dashboard');
        return;
      }
    } catch (e) {
      authLog('Notice checking tutors table in handleAuth:', e);
    }

    if (u.role === 'student') {
      setAppState('student-app');
    } else {
      setTutorRegistered(false);
      setAppState('tutor-register');
    }
  };

  const handleTutorComplete = async (profile: TutorProfile) => {
    if (!user) return;
    
    // 1. Upsert tutor application into tutors table
    const { data: tutorData, error: tutorError } = await supabase
      .from('tutors')
      .upsert({
        user_id: user.id,
        name: profile.name,
        name_ar: profile.nameAr || profile.name,
        bio: profile.bio,
        bio_ar: profile.bioAr || profile.bio,
        subjects: profile.subjects,
        hourly_rate: profile.hourlyRate,
        experience_years: profile.experienceYears || 5,
        languages: profile.languages,
        category: profile.category,
        is_online: true,
        response_time: 'within an hour',
        is_verified: false,
        status: 'pending',
        certificates: profile.certificates || [],
        identity_verified: profile.identityVerified || false,
        avatar_url: profile.avatarUrl || null,
        id_document_url: profile.idDocumentUrl || null,
        meeting_settings: profile.meetingSettings || null
      })
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
      .upsert({
        user_id: user.id,
        full_name: user.name,
        role: 'tutor',
        avatar_url: profile.avatarUrl || null
      });

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
      
      const schedulesToInsert = profile.schedule.map(s => ({
        tutor_id: tutorData.id,
        day_of_week: DAY_MAP[s.day] ?? 1,
        start_time: s.startTime + ':00',
        end_time: s.endTime + ':00',
        is_available: true
      }));

      const { error: scheduleError } = await supabase
        .from('schedules')
        .insert(schedulesToInsert);
      if (scheduleError) {
        console.warn('Schedules insert notice (non-fatal):', scheduleError.message);
      }
    }

    // 5. Update application state
    setTutorProfile(profile);
    setTutorRegistered(true);
    setAppState('tutor-dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('tm_user_session');
    localStorage.removeItem('tm_pending_oauth_role');
    sessionStorage.clear();
    setUser(null);
    setTutorProfile(null);
    setTutorRegistered(false);
    setAppState('auth');
    supabase.auth.signOut().catch((err) => console.error('Sign out error:', err));
  };


  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 max-w-lg mx-auto shadow-2xl border-x border-slate-100">
        <div className="flex flex-col items-center animate-pulse">
          <span className="text-4xl font-black bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-500 bg-clip-text text-transparent mb-4">
            {language === 'ar' ? 'علمني' : 'Teach Me'}
          </span>
          <div className="flex items-center gap-2.5 text-slate-500 text-sm font-medium bg-white px-4 py-2.5 rounded-2xl shadow-sm border border-slate-100">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span>{language === 'ar' ? 'جاري التحقق من الجلسة...' : 'Verifying session...'}</span>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'auth') {
    return <AuthScreen onAuth={handleAuth} language={language} onChangeLanguage={setLanguage} />;
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
