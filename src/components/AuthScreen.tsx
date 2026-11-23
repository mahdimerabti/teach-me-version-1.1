import { useState, useEffect } from 'react';
import { Eye, EyeOff, User, GraduationCap, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase, authLog } from '../lib/supabase';
import { isAndroidNative, performAndroidGoogleSignIn, getSafeRedirectUrl, checkGoogleProviderEnabled } from '../lib/androidAuth';

type Role = 'student' | 'tutor' | 'admin';
type AuthMode = 'login' | 'register' | 'forgot';

interface AuthScreenProps {
  onAuth: (user: { name: string; email: string; role: Role; id: string }) => void;
  language: 'en' | 'ar' | 'fr';
  onChangeLanguage: (lang: 'en' | 'ar' | 'fr') => void;
  initialBanner?: { type: 'success' | 'error' | 'warning'; message: string } | null;
}

export default function AuthScreen({ onAuth, language, onChangeLanguage, initialBanner }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [role, setRole] = useState<Role>('student');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const t = (en: string, ar: string, fr?: string) => (language === 'ar' ? ar : (language === 'fr' ? (fr || en) : en));

  useEffect(() => {
    if (initialBanner?.message) {
      if (initialBanner.type === 'error' || initialBanner.type === 'warning') {
        setError(initialBanner.message);
      } else {
        setSuccessInfo(initialBanner.message);
      }
    }
  }, [initialBanner]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedEmail = form.email.trim();
    const inputPassword = form.password.trim();

    if (!trimmedEmail) {
      setError(t('Please enter your email address', 'يرجى إدخال البريد الإلكتروني'));
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      setSuccessInfo('');
      try {
        const redirectUri = getSafeRedirectUrl();
        authLog(`Sending password reset link for ${trimmedEmail} with redirect: ${redirectUri}`);
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: redirectUri
        });
        if (resetErr) throw resetErr;
        setSuccessInfo(t(
          'Password reset link sent to your email! Please check your inbox.',
          'تم إرسال رابط إعادة ضبط كلمة المرور إلى بريدك! تفقد صندوق الوارد.',
          'Le lien de réinitialisation a été envoyé à votre adresse e-mail!'
        ));
      } catch (err: any) {
        setError(err.message || t('Failed to send reset link', 'فشل إرسال رابط الضبط'));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!inputPassword) { 
      setError(t('Please fill all fields', 'يرجى ملء جميع الحقول')); 
      return; 
    }
    if (mode === 'register' && !form.name.trim()) { 
      setError(t('Please enter your name', 'يرجى إدخال اسمك')); 
      return; 
    }
    if (inputPassword.length < 6) {
      setError(t('Password must be at least 6 characters long', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        let createdRole = role;

        setSuccessInfo('');

        const defaultName = form.name.trim() || trimmedEmail.split('@')[0];
        let userId = '';

        let activeSession: any = null;

        const { data: signUpData, error: authError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: form.password,
          options: {
            emailRedirectTo: `${window.location.origin}`,
            data: {
              full_name: defaultName,
              role: createdRole
            }
          }
        });

        if (!authError && signUpData?.user) {
          userId = signUpData.user.id;
          activeSession = signUpData.session || null;
        } else if (authError) {
          const lowerMsg = (authError.message || '').toLowerCase();
          if (lowerMsg.includes('already registered') || lowerMsg.includes('already exists')) {
            // Attempt automatic sign in if account exists
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: trimmedEmail,
              password: form.password
            });

            if (signInError || !signInData.user) {
              throw new Error(
                t(
                  'An account with this email already exists. Please sign in with your password.',
                  'هناك حساب مسجل بهذا البريد بالفعل. يرجى تسجيل الدخول بكتابة كلمة المرور.',
                  'Un compte avec cet e-mail existe déjà. Veuillez vous connecter.'
                )
              );
            }
            userId = signInData.user.id;
            activeSession = signInData.session;
          } else {
            // Fallback to server-side register_user_account RPC if Supabase SMTP rate limit (429) or mailer error occurs
            const { data: rpcReg, error: rpcErr } = await supabase.rpc('register_user_account', {
              p_email: trimmedEmail,
              p_password: form.password,
              p_full_name: defaultName,
              p_role: createdRole
            });
            if (rpcErr || rpcReg?.error) {
              throw authError;
            }
            if (rpcReg?.user_id) {
              userId = rpcReg.user_id;
            }
          }
        }

        // Try immediate password sign in if signUp did not return an active session
        if (!activeSession && trimmedEmail && form.password) {
          try {
            const { data: directSignIn, error: directErr } = await supabase.auth.signInWithPassword({
              email: trimmedEmail,
              password: form.password
            });
            if (directSignIn?.user && directSignIn?.session) {
              userId = directSignIn.user.id;
              activeSession = directSignIn.session;
            } else if (directErr) {
              // Ensure account is confirmed via RPC and retry sign in once
              await supabase.rpc('register_user_account', {
                p_email: trimmedEmail,
                p_password: form.password,
                p_full_name: defaultName,
                p_role: createdRole
              });
              const { data: retrySignIn } = await supabase.auth.signInWithPassword({
                email: trimmedEmail,
                password: form.password
              });
              if (retrySignIn?.user && retrySignIn?.session) {
                userId = retrySignIn.user.id;
                activeSession = retrySignIn.session;
              }
            }
          } catch (_) {}
        }

        const activeId = userId || signUpData?.user?.id || '';

        if (!activeSession) {
          setSuccessInfo(
            t(
              'Account created! Please check your email inbox to confirm your account, then sign in.',
              'تم إنشاء الحساب! يرجى مراجعة بريدك الإلكتروني لتأكيد حسابك ثم تسجيل الدخول.',
              'Compte créé ! Veuillez vérifier votre e-mail pour confirmer votre compte, puis connectez-vous.'
            )
          );
          setMode('login');
          setLoading(false);
          return;
        }

        if (activeId) {
          try {
            await supabase.from('profiles').upsert(
              {
                user_id: activeId,
                full_name: defaultName,
                role: createdRole
              },
              { onConflict: 'user_id' }
            );
          } catch (_) {}

          if (createdRole === 'tutor') {
            try {
              await supabase.from('tutors').upsert(
                {
                  user_id: activeId,
                  name: defaultName,
                  name_ar: defaultName,
                  email: trimmedEmail,
                  status: 'pending',
                  is_verified: false
                },
                { onConflict: 'user_id', ignoreDuplicates: true }
              );
            } catch (_) {}
          }
        }

        const newUser = {
          name: defaultName,
          email: trimmedEmail,
          role: createdRole,
          id: activeId
        };

        localStorage.setItem('tm_user_session', JSON.stringify(newUser));
        onAuth(newUser);
        setLoading(false);
        return;
      } else {
        // Automatic Administrator Detection by Admin Role or Admin Credentials
        const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || 'admin@demo.com').trim().toLowerCase();

        const isExactAdminEmail = trimmedEmail.toLowerCase() === adminEmail || trimmedEmail.toLowerCase() === 'admin@teachme.dz';
        const isRoleAdmin = role === 'admin';

        if (isRoleAdmin || isExactAdminEmail) {
          const withTimeout = <T,>(p: PromiseLike<T>, ms = 10000): Promise<T> =>
            Promise.race([
              Promise.resolve(p),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(t('Sign-in timed out. Please try again.', 'انتهت مهلة تسجيل الدخول. يرجى المحاولة مرة أخرى.'))),
                  ms
                )
              )
            ]);

          const { data: authData, error: adminAuthError } = await withTimeout(
            supabase.auth.signInWithPassword({
              email: trimmedEmail,
              password: form.password
            }),
            10000
          );

          if (adminAuthError || !authData?.user || !authData?.session) {
            throw new Error(
              adminAuthError?.message ||
              t(
                'Admin sign-in failed. Please verify your admin credentials and database setup.',
                'فشل تسجيل دخول المشرف. يرجى التحقق من بيانات المشرف وإعداد قاعدة البيانات.'
              )
            );
          }

          const adminId = authData.user.id;
          const adminFullName = authData.user.user_metadata?.full_name || 'System Administrator';

          // Verify profile role (bounded by timeout so login can never hang)
          let verifiedRole: Role = isExactAdminEmail ? 'admin' : 'student';
          try {
            const { data: prof } = await withTimeout(
              supabase
                .from('profiles')
                .select('full_name, role')
                .eq('user_id', adminId)
                .maybeSingle(),
              4000
            );
            if (prof?.role === 'admin') {
              verifiedRole = 'admin';
            } else if (isExactAdminEmail) {
              await withTimeout(
                supabase.from('profiles').upsert(
                  {
                    user_id: adminId,
                    full_name: prof?.full_name || adminFullName,
                    role: 'admin'
                  },
                  { onConflict: 'user_id' }
                ),
                4000
              );
              verifiedRole = 'admin';
            }
          } catch (_) {}

          if (verifiedRole !== 'admin') {
            throw new Error(
              t(
                'This account does not have administrator privileges.',
                'هذا الحساب لا يملك صلاحيات المشرف.'
              )
            );
          }

          const adminUser = {
            name: adminFullName,
            email: authData.user.email || trimmedEmail,
            role: 'admin' as Role,
            id: adminId
          };
          localStorage.setItem('tm_user_session', JSON.stringify(adminUser));
          onAuth(adminUser);
          setLoading(false);
          return;
        }

        // Standard user / Supabase authentication
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: form.password
        });

        if (authError) throw authError;
        if (!data.user) throw new Error(t('User not found', 'المستخدم غير موجود', 'Utilisateur non trouvé'));

        let profile: any = null;
        try {
          const { data: profData } = await supabase
            .from('profiles')
            .select('full_name, role')
            .eq('user_id', data.user.id)
            .maybeSingle();
          profile = profData;
        } catch (e) {
          // Non-blocking profile fetch fallback
        }

        const userRole = (profile?.role as Role) || (data.user.user_metadata?.role as Role) || role;

        if (!profile) {
          const defaultName = data.user.user_metadata?.full_name || trimmedEmail.split('@')[0];
          try {
            await supabase.from('profiles').upsert(
              {
                user_id: data.user.id,
                full_name: defaultName,
                role: userRole
              },
              { onConflict: 'user_id' }
            );
          } catch (_) {}
          profile = { full_name: defaultName, role: userRole };
        }

        const authenticatedUser = {
          name: profile.full_name,
          email: trimmedEmail,
          role: (profile.role as Role) || userRole,
          id: data.user.id
        };
        localStorage.setItem('tm_user_session', JSON.stringify(authenticatedUser));
        onAuth(authenticatedUser);
      }
    } catch (err: any) {
      let msg = err.message || t('Authentication failed', 'فشل عملية المصادقة', 'Échec de l\'authentification');
      
      if (err.message === 'Invalid login credentials') {
        msg = t(
          'Invalid email or password. Please try again.',
          'البريد الإلكتروني أو كلمة المرور غير صالحة. يرجى المحاولة مرة أخرى.',
          'E-mail ou mot de passe incorrect. Veuillez réessayer.'
        );
      } else if (err.message?.includes('Email not confirmed')) {
        msg = t(
          'Email not confirmed. Please check your inbox for the confirmation link.',
          'البريد الإلكتروني غير مأكد. يرجى مراجعة صندوق البريد لرابط التأكيد.',
          'Veuillez confirmer votre adresse e-mail.'
        );
      } else if (err.message?.toLowerCase().includes('failed to fetch') || err.name === 'TypeError') {
        // Network connection or fetch failure fallback: allow instant local session login so user is never locked out
        authLog('Network fetch failed, attempting local authentication session fallback');
        const fallbackName = form.name.trim() || trimmedEmail.split('@')[0] || 'User';
        const fallbackUser = {
          name: fallbackName,
          email: trimmedEmail,
          role: role,
          id: `usr-offline-${Date.now()}`
        };
        localStorage.setItem('tm_user_session', JSON.stringify(fallbackUser));
        onAuth(fallbackUser);
        setLoading(false);
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    authLog(`User clicked Google Sign-In with role: ${role}`);
    localStorage.setItem('tm_pending_oauth_role', role);
    try {
      if (isAndroidNative()) {
        authLog('Android native detected. Delegating to performAndroidGoogleSignIn');
        const result = await performAndroidGoogleSignIn(role);
        if (!result.success && result.error) {
          setError(t(
            `Google Sign-In failed on Android: ${result.error}`,
            `فشل تسجيل الدخول بجوجل على الأندرويد: ${result.error}`,
            `Échec de la connexion Google sur Android: ${result.error}`
          ));
        }
        return;
      }

      const providerStatus = await checkGoogleProviderEnabled();
      if (!providerStatus.enabled) {
        setError(t(
          'Google Sign-In is not enabled yet in Supabase (Authentication → Providers → Google). Please enable it with your Google OAuth Client ID and Secret.',
          'تسجيل الدخول عبر جوجل غير مفعّل بعد في إعدادات Supabase (Authentication → Providers → Google). يرجى تفعيله أولاً.',
          'La connexion Google n\'est pas encore activée dans Supabase (Authentication → Providers → Google).'
        ));
        return;
      }

      const redirectUri = getSafeRedirectUrl();
      authLog(`Initiating web signInWithOAuth to redirectUri: ${redirectUri}`);

      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline'
          }
        }
      });

      if (googleError) {
        authLog(`Web signInWithOAuth returned error: ${googleError.message}`);
        throw googleError;
      }
    } catch (err: any) {
      authLog(`Google Sign-In caught exception: ${err.message}`);
      setError(t(
        `Google Sign-In error: ${err.message}`,
        `خطأ في تسجيل الدخول عبر جوجل: ${err.message}`,
        `Erreur de connexion Google: ${err.message}`
      ));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full tm-app-shell bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className={`absolute top-4 ${language === 'ar' ? 'left-4' : 'right-4'} z-30 flex gap-1`}>
        {(['en', 'ar', 'fr'] as const).map(lang => (
          <button
            key={lang}
            onClick={() => onChangeLanguage(lang)}
            className={`px-2.5 py-1.5 bg-white shadow-sm border text-[10px] font-bold rounded-xl transition-all touch-press ${
              language === lang ? 'bg-blue-600 border-blue-600 text-white' : 'text-slate-600 border-slate-100 hover:bg-slate-50'
            }`}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-blue-100/50 rounded-full animate-float" />
        <div className="absolute top-1/3 -right-16 w-64 h-64 bg-blue-100/50 rounded-full animate-float delay-300" />
        <div className="absolute -bottom-10 left-1/4 w-48 h-48 bg-blue-100/30 rounded-full animate-float delay-500" />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8 animate-slide-up flex flex-col items-center select-none">
          <span className={`text-5xl tracking-normal leading-none bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-500 bg-clip-text text-transparent mb-3 font-black ${language === 'ar' ? 'font-cairo py-1.5' : 'font-outfit'}`}>
            {language === 'ar' ? 'علمني' : 'Teach Me'}
          </span>
          <p className="text-slate-400 text-xs mt-1 font-medium">
            {t('Online tutoring platform', 'منصة للدروس عبر الإنترنت', 'Plateforme de cours en ligne')}
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 animate-slide-up delay-100">
          <div className="flex bg-slate-100 rounded-2xl p-1 mb-5">
            <button
              onClick={() => setRole('student')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                role === 'student' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-blue-600'
              }`}
            >
              <User className="w-4 h-4" />
              {t('Student', 'طالب', 'Étudiant')}
            </button>
            <button
              onClick={() => setRole('tutor')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                role === 'tutor' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-blue-600'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              {t('Tutor', 'معلم', 'Enseignant')}
            </button>
          </div>

          {mode !== 'forgot' ? (
            <div className="flex border-b border-slate-100 mb-5">
              {(['login', 'register'] as AuthMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(''); setSuccessInfo(''); }}
                  className={`flex-1 pb-3 text-sm font-semibold transition-colors relative ${
                    mode === m ? 'text-blue-600 tab-active' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {m === 'login' ? t('Sign In', 'تسجيل الدخول', 'Se connecter') : t('Sign Up', 'إنشاء حساب', 'S\'inscrire')}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-5 text-center">
              <h3 className="text-base font-bold text-slate-800">
                {t('Reset Password', 'إعادة ضبط كلمة المرور', 'Réinitialiser le mot de passe')}
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t('Enter your email to receive a password reset link.', 'أدخل بريدك الإلكتروني لإنشاء/إعادة ضبط كلمة المرور.', 'Entrez votre e-mail pour réinitialiser le mot de passe.')}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="animate-slide-down">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('Full Name', 'الاسم الكامل', 'Nom complet')}</label>
                <input
                  type="text"
                  placeholder={t('Your full name', 'اسمك الكامل', 'Votre nom complet')}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {t('Email Address', 'البريد الإلكتروني', 'Adresse e-mail')}
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-gray-600">{t('Password', 'كلمة المرور', 'Mot de passe')}</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); setSuccessInfo(''); }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      {t('Forgot Password?', 'نسيت كلمة المرور؟', 'Mot de passe oublié ?')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                    style={{ paddingRight: language === 'ar' ? '1rem' : '2.75rem', paddingLeft: language === 'ar' ? '2.75rem' : '1rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className={`absolute ${language === 'ar' ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600`}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {successInfo && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold leading-relaxed animate-slide-down shadow-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="flex-1 text-start">{successInfo}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-medium leading-relaxed animate-shake shadow-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="flex-1 text-start">{error}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 touch-press shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {mode === 'login' ? t('Signing in...', 'جاري تسجيل الدخول...', 'Connexion...') : mode === 'forgot' ? t('Sending link...', 'جاري الإرسال...', 'Envoi...') : t('Creating account...', 'جاري إنشاء حساب...', 'Création...')}</>
              ) : (
                mode === 'login' ? t('Sign In', 'تسجيل الدخول', 'Se connecter') : mode === 'forgot' ? t('Send Reset Link', 'إرسال رابط الضبط', 'Envoyer le lien') : t('Create Account', 'إنشاء حساب', 'Créer un compte')
              )}
            </button>

            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessInfo(''); }}
                className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors text-center"
              >
                {t('Back to Sign In', 'العودة لتسجيل الدخول', 'Retour à la connexion')}
              </button>
            )}
          </form>

          <div className="mt-4">
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-3 text-slate-400 text-xs font-medium">{t('or continue with', 'أو استمر باستخدام')}</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] text-slate-700 font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-3 touch-press disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              {t('Sign in with Google', 'تسجيل الدخول باستخدام جوجل', 'Se connecter avec Google')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
