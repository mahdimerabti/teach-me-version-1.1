import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  Users,
  Calendar,
  DollarSign,
  LogOut,
  Search,
  RefreshCw,
  UserCheck,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  ChevronRight,
  CreditCard,
  X,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CURRENCY_CODE } from '../lib/config';

interface AdminDashboardProps {
  user: { name: string; email: string; id: string };
  onLogout: () => void;
  language: 'en' | 'ar' | 'fr';
  onChangeLanguage: (lang: 'en' | 'ar' | 'fr') => void;
}

export default function AdminDashboard({ user, onLogout, language, onChangeLanguage }: AdminDashboardProps) {
  const t = (en: string, ar: string, fr?: string) => (language === 'ar' ? ar : (language === 'fr' ? (fr || en) : en));

  const [tutors, setTutors] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'tutors' | 'sessions' | 'finance'>('overview');
  const [tutorSearch, setTutorSearch] = useState('');
  const [tutorStatusFilter, setTutorStatusFilter] = useState('all');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [selectedTutor, setSelectedTutor] = useState<any | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [updatingTutorId, setUpdatingTutorId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const withTimeout = <T,>(p: PromiseLike<T>, ms = 8000): Promise<T> =>
      Promise.race([
        Promise.resolve(p),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out while loading admin data. Please click Refresh.')), ms))
      ]);
    try {
      const [
        { data: tutorsData, error: tutorsErr },
        { data: sessionsData, error: sessionsErr },
        { data: txData, error: txErr }
      ] = await withTimeout(
        Promise.all([
          supabase
            .from('tutors')
            .select('*')
            .order('created_at', { ascending: false }),
          supabase
            .from('sessions')
            .select('*')
            .order('date', { ascending: false }),
          supabase
            .from('credit_transactions')
            .select('*')
            .order('created_at', { ascending: false })
        ]),
        8000
      );

      if (tutorsErr) {
        console.error('Error fetching tutors:', tutorsErr);
        setFetchError(tutorsErr.message);
      } else if (tutorsData) {
        setTutors(tutorsData);
        setSelectedTutor((prev: any) =>
          prev ? tutorsData.find(item => item.id === prev.id) || prev : null
        );
      }

      if (sessionsErr) {
        console.warn('Notice fetching sessions:', sessionsErr.message);
      } else if (sessionsData) {
        setSessions(sessionsData);
      }

      if (txErr) {
        console.warn('Notice fetching transactions:', txErr.message);
      } else if (txData) {
        setTransactions(txData);
      }
    } catch (err: any) {
      console.error('Error fetching admin data:', err);
      setFetchError(err?.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tutors' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        fetchData();
      })
      .subscribe();

    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const handlePerformLogout = async () => {
    try {
      localStorage.removeItem('tm_user_session');
      sessionStorage.clear();
      await supabase.auth.signOut().catch(() => {});
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      onLogout();
    }
  };

  const toggleVerification = async (tutorId: string, currentStatus: boolean) => {
    setUpdatingTutorId(tutorId);
    try {
      const { data: updated, error } = await supabase
        .from('tutors')
        .update({ is_verified: !currentStatus })
        .eq('id', tutorId)
        .select('id, is_verified')
        .maybeSingle();

      if (error) throw error;
      if (!updated) {
        throw new Error('Permission denied or tutor row not found. Please sign out and sign in again as Admin.');
      }

      setTutors((prev: any[]) =>
        prev.map(t => (t.id === tutorId ? { ...t, is_verified: !currentStatus } : t))
      );
      if (selectedTutor && selectedTutor.id === tutorId) {
        setSelectedTutor((prev: any) => (prev ? { ...prev, is_verified: !currentStatus } : null));
      }
      await fetchData();
    } catch (err: any) {
      alert('Failed to update tutor verification: ' + err.message);
    } finally {
      setUpdatingTutorId(null);
    }
  };

  const updateTutorStatus = async (tutorId: string, newStatus: string) => {
    const normalizedStatus = newStatus.toLowerCase();
    setUpdatingTutorId(tutorId);
    try {
      const updatePayload: any = { status: normalizedStatus };
      if (normalizedStatus === 'approved') {
        updatePayload.is_verified = true;
      } else if (normalizedStatus === 'rejected' || normalizedStatus === 'suspended' || normalizedStatus === 'banned') {
        updatePayload.is_verified = false;
      }
      const { data: tutorData, error } = await supabase
        .from('tutors')
        .update(updatePayload)
        .eq('id', tutorId)
        .select('id, user_id, name, status, is_verified')
        .maybeSingle();

      if (error) throw error;
      if (!tutorData) {
        throw new Error('Update blocked by database permissions (RLS). Please verify you are signed in with a valid Admin session.');
      }

      if (tutorData?.user_id) {
        try {
          await supabase.from('notifications').insert({
            user_id: tutorData.user_id,
            title: normalizedStatus === 'approved' ? 'Application Approved!' : 'Application Status Update',
            title_ar: normalizedStatus === 'approved' ? 'تمت الموافقة على طلبك!' : 'تحديث حالة الطلب',
            body: normalizedStatus === 'approved' 
              ? 'Congratulations! Your tutor application has been approved. You are now live on Teach Me.' 
              : 'Your tutor application status has been updated by administration.',
            body_ar: normalizedStatus === 'approved'
              ? 'مبارك! تمت الموافقة على طلب انضمامك كمعلم. حسابك الآن ظاهر للطلاب.'
              : 'تم تحديث حالة طلب انضمامك من قبل الإدارة.',
            kind: 'booking'
          });
        } catch (_) {}
      }

      setTutors((prev: any[]) =>
        prev.map(t => (t.id === tutorId ? { ...t, ...updatePayload } : t))
      );
      if (selectedTutor && selectedTutor.id === tutorId) {
        setSelectedTutor((prev: any) => (prev ? { ...prev, ...updatePayload } : null));
      }
      await fetchData();
    } catch (err: any) {
      alert('Failed to update tutor status: ' + err.message);
    } finally {
      setUpdatingTutorId(null);
    }
  };

  const toggleIdentityVerification = async (tutorId: string, currentStatus: boolean) => {
    setUpdatingTutorId(tutorId);
    try {
      const { data: updated, error } = await supabase
        .from('tutors')
        .update({ identity_verified: !currentStatus })
        .eq('id', tutorId)
        .select('id, identity_verified')
        .maybeSingle();

      if (error) throw error;
      if (!updated) {
        throw new Error('Permission denied or tutor row not found.');
      }

      setTutors((prev: any[]) =>
        prev.map(t => (t.id === tutorId ? { ...t, identity_verified: !currentStatus } : t))
      );
      if (selectedTutor && selectedTutor.id === tutorId) {
        setSelectedTutor((prev: any) => (prev ? { ...prev, identity_verified: !currentStatus } : null));
      }
      await fetchData();
    } catch (err: any) {
      alert('Failed to update identity verification: ' + err.message);
    } finally {
      setUpdatingTutorId(null);
    }
  };

  const totalTutors = tutors.length;
  const verifiedTutors = tutors.filter(t => t.is_verified).length;
  const pendingTutors = tutors.filter(t => (t.status || 'pending').toLowerCase() === 'pending').length;
  const totalSessions = sessions.length;
  
  const totalEarnings = transactions.filter(t => t.type === 'purchase').reduce((sum, t) => {
    if (t.amount === 60) return sum + 3000;
    if (t.amount === 120) return sum + 5500;
    if (t.amount === 220) return sum + 9500;
    return sum + (t.amount * 50);
  }, 0);

  const filteredTutors = tutors.filter(t => {
    const q = tutorSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (t.name || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q) ||
      (Array.isArray(t.subjects) && t.subjects.some((s: string) => s.toLowerCase().includes(q)));
    const normalizedStatus = (t.status || 'pending').toLowerCase();
    const matchesStatus = tutorStatusFilter === 'all' || normalizedStatus === tutorStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredSessions = sessions.filter(s => {
    if (sessionFilter === 'all') return true;
    return s.status === sessionFilter;
  });

  const navTabs = [
    { id: 'overview', label: t('Overview', 'الرئيسية'), icon: Sparkles },
    { id: 'tutors', label: t('Tutors', 'المعلمون'), icon: Users, badge: pendingTutors > 0 ? pendingTutors : undefined },
    { id: 'sessions', label: t('Sessions', 'الحصص'), icon: Calendar },
    { id: 'finance', label: t('Sales', 'المبيعات'), icon: DollarSign }
  ];

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col w-full max-w-6xl mx-auto shadow-2xl border-x border-slate-100 font-sans text-slate-900 select-none antialiased relative overflow-x-hidden ${language === 'ar' ? 'font-cairo' : ''}`}>
      <header className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 text-white px-3.5 sm:px-5 pt-5 sm:pt-8 pb-4 sm:pb-6 sticky top-0 z-30 shadow-lg shadow-blue-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2 mb-0 sm:mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center text-white shadow-inner flex-shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-black text-base md:text-lg leading-tight flex items-center gap-1.5 truncate">
                {t('Admin Console', 'لوحة التحكم والمشرف')}
              </h1>
              <p className="text-xs text-blue-100 font-medium truncate max-w-full sm:max-w-[170px]">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-1.5 w-full sm:w-auto">
            <div className="flex bg-white/10 backdrop-blur p-1 sm:p-0.5 rounded-xl border border-white/20">
              {(['en', 'ar', 'fr'] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => onChangeLanguage(lang)}
                  className={`min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 px-2.5 sm:px-2 py-1.5 sm:py-1 text-xs sm:text-[10px] font-bold rounded-lg transition-all ${
                    language === lang ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-100 hover:text-white'
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 sm:gap-1.5">
              <button
                onClick={fetchData}
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2.5 sm:p-2 bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 rounded-xl transition-all text-white flex items-center justify-center"
                title={t('Refresh Data', 'تحديث البيانات')}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1.5 bg-red-500/20 hover:bg-red-500/30 active:scale-95 border border-red-200/40 text-white rounded-xl transition-all shadow-sm flex items-center gap-1.5 sm:gap-1 font-bold text-xs"
                title={t('Sign Out', 'تسجيل الخروج')}
              >
                <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span>{t('Logout', 'خروج')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Navigation Tabs (unchanged on >= sm) */}
        <div className="hidden sm:flex bg-white/10 backdrop-blur p-1 rounded-2xl border border-white/20 gap-1 overflow-x-auto">
          {navTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-600 shadow-md'
                    : 'text-blue-100 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="bg-amber-400 text-slate-900 text-[9px] font-black px-1.5 py-0.2 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex-1 p-3 sm:p-4 space-y-4 overflow-y-auto pb-28 sm:pb-24">
        {fetchError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-3.5 text-xs font-medium flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold">{t('Error loading admin data', 'خطأ في تحميل بيانات المشرف')}</p>
              <p className="mt-0.5 break-words">{fetchError}</p>
            </div>
          </div>
        )}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-slide-up">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-sm border border-slate-100 min-w-0">
                <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-2">
                  <Users className="w-5 h-5" />
                </div>
                <p className="text-xl font-bold text-slate-900 leading-none">{totalTutors}</p>
                <p className="text-xs sm:text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider truncate">{t('Total Tutors', 'إجمالي المعلمين')}</p>
                <p className="text-xs sm:text-[10px] text-blue-600 font-bold mt-2 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 sm:w-3 sm:h-3 flex-shrink-0" /> {verifiedTutors} {t('Verified', 'موثق')}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-sm border border-slate-100 min-w-0">
                <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-2">
                  <Calendar className="w-5 h-5" />
                </div>
                <p className="text-xl font-bold text-slate-900 leading-none">{totalSessions}</p>
                <p className="text-xs sm:text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider truncate">{t('Total Sessions', 'إجمالي الحصص')}</p>
                <p className="text-xs sm:text-[10px] text-indigo-600 font-bold mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-3 sm:h-3 flex-shrink-0" /> Live & Done
                </p>
              </div>

              <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-sm border border-slate-100 min-w-0">
                <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-2">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <p className="text-base sm:text-lg font-bold text-emerald-600 leading-tight break-words">{totalEarnings.toLocaleString()} DZD</p>
                <p className="text-xs sm:text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider truncate">{t('Platform Sales', 'مبيعات الأرصدة')}</p>
                <p className="text-xs sm:text-[10px] text-slate-400 mt-2 font-medium truncate">{t('Online Payment', 'الدفع الإلكتروني')}</p>

              </div>

              <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-sm border border-slate-100 min-w-0">
                <div className="w-9 h-9 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center mb-2">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <p className="text-xl font-bold text-teal-600 leading-none">100% OK</p>
                <p className="text-xs sm:text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider truncate">{t('System Health', 'حالة النظام')}</p>
                <p className="text-xs sm:text-[10px] text-emerald-600 font-bold mt-2 truncate">Database Active</p>
              </div>
            </div>

            {/* Recent Tutors Quick Review Card */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-slate-900 text-sm">{t('Recent Tutor Applications', 'طلبات المعلمين الجديدة')}</h3>
                <button
                  onClick={() => setActiveTab('tutors')}
                  className="min-h-[44px] sm:min-h-0 px-2 sm:px-0 text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-0.5 flex-shrink-0"
                >
                  {t('View All', 'عرض الكل')} <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {tutors.slice(0, 4).map(tutor => (
                  <div
                    key={tutor.id}
                    onClick={() => setSelectedTutor(tutor)}
                    className="flex items-center justify-between gap-3 p-3.5 sm:p-3 min-h-[56px] bg-slate-50 hover:bg-blue-50/50 active:scale-[0.99] cursor-pointer rounded-2xl border border-slate-100 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <img
                        src={tutor.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face'}
                        alt={tutor.name}
                        className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl object-cover border border-slate-100 flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 text-sm sm:text-xs truncate">{tutor.name}</p>
                        <p className="text-xs sm:text-[10px] text-slate-400 truncate mt-0.5">{Array.isArray(tutor.subjects) && tutor.subjects.length > 0 ? tutor.subjects.join(', ') : (tutor.category || tutor.email || '')}</p>
                        <span className={`inline-block text-[10px] sm:text-[8px] font-extrabold uppercase px-2 sm:px-1.5 py-0.5 rounded mt-1 ${
                          tutor.status === 'approved' ? 'bg-green-100 text-green-700' :
                          tutor.status === 'pending' || !tutor.status ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {tutor.status || 'pending'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 text-slate-400 flex-shrink-0" />
                  </div>
                ))}
                {tutors.length === 0 && !loading && (
                  <p className="text-center text-xs text-slate-400 py-4">{t('No tutor applications yet', 'لا توجد طلبات معلمين بعد')}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Tutors Management */}
        {activeTab === 'tutors' && (
          <div className="bg-white rounded-3xl p-3.5 sm:p-4 shadow-sm border border-slate-100 space-y-4 animate-slide-up">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900 text-base sm:text-sm">{t('Tutors Management', 'إدارة وتوثيق المعلمين')}</h3>
              <span className="text-xs sm:text-[10px] font-semibold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
                {pendingTutors} {t('pending verification', 'في الانتظار')}
              </span>
            </div>

            {/* Status Filter */}
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 overflow-x-auto">
              {['all', 'pending', 'approved', 'rejected', 'suspended', 'banned'].map(st => (
                <button
                  key={st}
                  onClick={() => setTutorStatusFilter(st)}
                  className={`min-h-[44px] sm:min-h-0 flex-shrink-0 sm:flex-1 py-2 sm:py-1.5 px-3 sm:px-2 rounded-lg text-xs sm:text-[10px] font-bold uppercase transition-all whitespace-nowrap ${
                    tutorStatusFilter === st
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={t('Search tutors by name or subject...', 'بحث باسم المعلم أو المادة...')}
                value={tutorSearch}
                onChange={e => setTutorSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-3 sm:py-2.5 rounded-xl bg-slate-50 text-sm sm:text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all border border-slate-100"
              />
            </div>

            {/* Tutor List (Stacked cards on mobile, compact rows on desktop) */}
            <div className="space-y-2.5 sm:space-y-2 sm:max-h-96 sm:overflow-y-auto sm:pr-1">
              {filteredTutors.map(tutor => (
                <div
                  key={tutor.id}
                  onClick={() => setSelectedTutor(tutor)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-3 bg-slate-50 hover:bg-blue-50/50 active:scale-[0.99] cursor-pointer rounded-2xl border border-slate-100 transition-all"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <img
                      src={tutor.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face'}
                      alt={tutor.name}
                      className="w-12 h-12 sm:w-11 sm:h-11 rounded-xl object-cover border border-slate-100 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-slate-800 text-sm sm:text-xs truncate max-w-full">{tutor.name}</p>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tutor.is_online ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className={`text-[10px] sm:text-[8px] font-extrabold uppercase px-2 sm:px-1.5 py-0.5 rounded flex-shrink-0 ${
                          tutor.status === 'approved' ? 'bg-green-100 text-green-700' :
                          tutor.status === 'pending' || !tutor.status ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {tutor.status || 'pending'}
                        </span>
                      </div>
                      {tutor.email && (
                        <p className="text-xs sm:text-[10px] text-slate-500 truncate mt-0.5">{tutor.email}</p>
                      )}
                      <p className="text-xs sm:text-[10px] text-slate-400 truncate mt-0.5">
                        {Array.isArray(tutor.subjects) && tutor.subjects.length > 0 ? tutor.subjects.join(', ') : (tutor.category || '—')}
                      </p>
                      <p className="text-xs sm:text-[9px] text-blue-600 font-bold mt-1">
                        {tutor.hourly_rate} {CURRENCY_CODE}/hr · {tutor.experience_years || 3} yrs exp
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/70">
                    {(tutor.status || 'pending') !== 'approved' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateTutorStatus(tutor.id, 'approved');
                        }}
                        disabled={updatingTutorId === tutor.id}
                        className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1 rounded-xl sm:rounded-lg text-xs sm:text-[10px] font-bold bg-green-500 hover:bg-green-600 text-white transition-all disabled:opacity-50"
                      >
                        ✓ {t('Approve', 'موافقة')}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVerification(tutor.id, tutor.is_verified);
                      }}
                      disabled={updatingTutorId === tutor.id}
                      className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1 rounded-xl sm:rounded-lg text-xs sm:text-[10px] font-bold transition-all disabled:opacity-50 ${
                        tutor.is_verified
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      {tutor.is_verified ? t('Verified', 'موثق') : t('Verify', 'توثيق')}
                    </button>
                    <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 text-slate-400 flex-shrink-0" />
                  </div>
                </div>
              ))}
              {filteredTutors.length === 0 && (
                <p className="text-center text-sm sm:text-xs text-slate-400 py-6">{t('No tutors found', 'لم يتم العثور على معلمين')}</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Sessions */}
        {activeTab === 'sessions' && (
          <div className="bg-white rounded-3xl p-3.5 sm:p-4 shadow-sm border border-slate-100 space-y-4 animate-slide-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <h3 className="font-bold text-slate-900 text-base sm:text-sm">{t('Sessions Audit', 'تدقيق الحصص والدروس')}</h3>
              <div className="flex bg-slate-100 p-1 sm:p-0.5 rounded-xl sm:rounded-lg gap-1 overflow-x-auto w-full sm:w-auto">
                {['all', 'confirmed', 'live', 'completed', 'cancelled'].map(f => (
                  <button
                    key={f}
                    onClick={() => setSessionFilter(f)}
                    className={`min-h-[44px] sm:min-h-0 flex-shrink-0 sm:flex-initial px-3 sm:px-2 py-2 sm:py-1 rounded-lg sm:rounded-md text-xs sm:text-[9px] font-bold uppercase transition-all whitespace-nowrap ${
                      sessionFilter === f ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 sm:space-y-2 sm:max-h-96 sm:overflow-y-auto sm:pr-1">
              {filteredSessions.map(session => (
                <div key={session.id} className="p-3.5 sm:p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm sm:text-xs truncate">{session.subject || 'Private Session'}</p>
                    <p className="text-xs sm:text-[10px] text-slate-400 mt-0.5">{session.date} · {session.start_time?.slice(0, 5)} – {session.end_time?.slice(0, 5)}</p>
                    <p className="text-xs sm:text-[9px] text-blue-600 font-semibold mt-1">Cost: {session.credit_cost || 1} credits</p>
                  </div>
                  <span className={`self-start sm:self-center text-xs sm:text-[9px] font-bold uppercase px-2.5 sm:px-2 py-1 sm:py-0.5 rounded-full flex-shrink-0 ${
                    session.status === 'live' ? 'bg-red-100 text-red-700' :
                    session.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                    session.status === 'completed' ? 'bg-green-100 text-green-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {session.status}
                  </span>
                </div>
              ))}
              {filteredSessions.length === 0 && (
                <p className="text-center text-sm sm:text-xs text-slate-400 py-6">{t('No sessions found', 'لا توجد حصص مسجلة')}</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Sales */}
        {activeTab === 'finance' && (
          <div className="bg-white rounded-3xl p-3.5 sm:p-4 shadow-sm border border-slate-100 space-y-4 animate-slide-up">
            <h3 className="font-bold text-slate-900 text-base sm:text-sm">{t('Online Payment Transactions', 'سجل مبيعات الشحن الإلكتروني')}</h3>

            <div className="space-y-2.5 sm:space-y-2 sm:max-h-96 sm:overflow-y-auto sm:pr-1">
              {transactions.map(tx => (
                <div key={tx.id} className="p-3.5 sm:p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 sm:w-8 sm:h-8 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm sm:text-xs truncate">{tx.label || 'Package Purchase'}</p>
                      <p className="text-xs sm:text-[10px] text-slate-400 mt-0.5">{new Date(tx.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <p className="font-bold text-emerald-600 text-sm sm:text-xs flex-shrink-0 whitespace-nowrap">+{tx.amount} credits</p>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="text-center text-sm sm:text-xs text-slate-400 py-6">{t('No transactions yet', 'لا توجد معاملات بعد')}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation Bar (< sm only; desktop keeps header tabs) */}
      <nav className="flex sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 pt-1.5 pb-safe shadow-[0_-6px_20px_rgba(15,23,42,0.08)]">
        {navTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 min-h-[52px] flex flex-col items-center justify-center gap-1 rounded-xl transition-all relative ${
                isActive ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {tab.badge && (
                  <span className="absolute -top-1.5 -right-2.5 bg-amber-400 text-slate-900 text-[10px] font-black px-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center shadow-sm">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-semibold leading-none">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Tutor Moderation Modal */}
      {selectedTutor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setSelectedTutor(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-t-[28px] sm:rounded-[32px] p-4 sm:p-5 pb-8 sm:pb-5 animate-slide-up shadow-2xl max-h-[90dvh] sm:max-h-[85vh] overflow-y-auto text-slate-900">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10" />
              <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
              <button
                onClick={() => setSelectedTutor(null)}
                aria-label={t('Close', 'إغلاق')}
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex items-start gap-3.5 mb-4 border-b border-slate-100 pb-4">
              <img
                src={selectedTutor.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face'}
                alt={selectedTutor.name}
                className="w-14 h-14 rounded-2xl object-cover border border-slate-100 flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 text-base break-words">{selectedTutor.name}</h3>
                {selectedTutor.email && (
                  <p className="text-xs text-slate-500 mt-0.5 break-all">{selectedTutor.email}</p>
                )}
                {selectedTutor.phone && (
                  <p className="text-xs text-slate-500 mt-0.5">{selectedTutor.phone}</p>
                )}
                <p className="text-xs text-blue-600 font-semibold mt-0.5">{selectedTutor.category || '—'}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`text-[10px] sm:text-[8px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                    selectedTutor.status === 'approved' ? 'bg-green-100 text-green-700' :
                    selectedTutor.status === 'pending' || !selectedTutor.status ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {selectedTutor.status || 'pending'}
                  </span>
                  {selectedTutor.is_verified && (
                    <span className="text-[10px] sm:text-[8px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Account Verified</span>
                  )}
                  {selectedTutor.identity_verified && (
                    <span className="text-[10px] sm:text-[8px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">ID Verified</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm sm:text-xs text-slate-600 mb-5">
              <div>
                <h4 className="font-bold text-slate-800 mb-1">{t('Biography', 'السيرة الذاتية')}</h4>
                <p className="leading-relaxed bg-slate-50 rounded-xl p-3 border border-slate-100 break-words">{selectedTutor.bio || 'No bio provided'}</p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">{t('Subjects', 'المواد')}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTutor.subjects && selectedTutor.subjects.length > 0 ? selectedTutor.subjects.map((s: string) => (
                    <span key={s} className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-xs sm:text-[11px] font-medium">{s}</span>
                  )) : (
                    <span className="text-slate-400 italic text-xs">No subjects listed</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">{t('Certificates & Documents', 'الشهادات والوثائق')}</h4>
                {selectedTutor.certificates && selectedTutor.certificates.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedTutor.certificates.map((c: string, idx: number) => {
                      const parts = c.split('|');
                      const title = parts[0];
                      const url = parts[1];
                      return url ? (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[44px] sm:min-h-0 inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 sm:px-2.5 py-2 sm:py-1 rounded-xl sm:rounded-lg text-xs sm:text-[11px] font-semibold border border-blue-100 transition-colors break-all"
                        >
                          🎓 {title} <span className="text-[10px] underline">({t('View', 'عرض')})</span>
                        </a>
                      ) : (
                        <span key={idx} className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-xs sm:text-[11px] font-semibold border border-blue-100">{title}</span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-xs sm:text-[11px]">No certificates attached</p>
                )}
              </div>

              {(selectedTutor.id_document_url || selectedTutor.identity_document_url) && (
                <div className="bg-emerald-50/70 rounded-2xl p-3 border border-emerald-100">
                  <h4 className="font-bold text-emerald-800 mb-2 flex items-center gap-1.5 text-xs">
                    🛡️ {t('Government ID Document', 'وثيقة الهوية الرسمية')}
                  </h4>
                  <a
                    href={selectedTutor.id_document_url || selectedTutor.identity_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] sm:min-h-0 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2.5 sm:py-1.5 rounded-xl font-bold text-xs shadow-sm transition-all"
                  >
                    📄 {t('View Uploaded Identity Document', 'فتح معينة وثيقة الهوية')}
                  </a>
                </div>
              )}
            </div>

            <div className="space-y-2.5 border-t border-slate-100 pt-4">
              <h4 className="font-bold text-slate-800 text-xs mb-2">{t('Verification Badges', 'توثيق الرتب')}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => toggleVerification(selectedTutor.id, selectedTutor.is_verified)}
                  disabled={updatingTutorId === selectedTutor.id}
                  className={`min-h-[44px] sm:min-h-0 py-2.5 sm:py-2 px-3 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${
                    selectedTutor.is_verified ? 'bg-slate-100 text-slate-600' : 'bg-blue-600 text-white shadow-md'
                  }`}
                >
                  {selectedTutor.is_verified ? 'Revoke Account Badge' : 'Verify Account Badge'}
                </button>
                <button
                  onClick={() => toggleIdentityVerification(selectedTutor.id, selectedTutor.identity_verified)}
                  disabled={updatingTutorId === selectedTutor.id}
                  className={`min-h-[44px] sm:min-h-0 py-2.5 sm:py-2 px-3 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${
                    selectedTutor.identity_verified ? 'bg-slate-100 text-slate-600' : 'bg-emerald-600 text-white shadow-md'
                  }`}
                >
                  {selectedTutor.identity_verified ? 'Revoke ID' : 'Verify Government ID'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => updateTutorStatus(selectedTutor.id, 'approved')}
                  disabled={selectedTutor.status === 'approved' || updatingTutorId === selectedTutor.id}
                  className="min-h-[44px] py-2.5 px-2 bg-green-500 hover:bg-green-600 active:scale-95 text-white disabled:opacity-50 text-xs font-bold rounded-xl transition-all shadow-md"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => updateTutorStatus(selectedTutor.id, 'rejected')}
                  disabled={selectedTutor.status === 'rejected' || updatingTutorId === selectedTutor.id}
                  className="min-h-[44px] py-2.5 px-2 bg-red-500 hover:bg-red-600 active:scale-95 text-white disabled:opacity-50 text-xs font-bold rounded-xl transition-all shadow-md"
                >
                  ✕ Reject
                </button>
                <button
                  onClick={() => updateTutorStatus(selectedTutor.id, 'info_requested')}
                  disabled={selectedTutor.status === 'info_requested' || updatingTutorId === selectedTutor.id}
                  className="min-h-[44px] py-2.5 px-2 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white disabled:opacity-50 text-xs font-bold rounded-xl transition-all shadow-md"
                >
                  Request Info
                </button>
                <button
                  onClick={() => updateTutorStatus(selectedTutor.id, 'suspended')}
                  disabled={selectedTutor.status === 'suspended' || updatingTutorId === selectedTutor.id}
                  className="min-h-[44px] py-2.5 px-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white disabled:opacity-50 text-xs font-bold rounded-xl transition-all shadow-md"
                >
                  Suspend
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-[calc(100vw-2rem)] sm:max-w-xs text-center shadow-2xl animate-bounce-in text-slate-900">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">{t('Sign Out of Admin?', 'تأكيد تسجيل الخروج؟')}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {t('Are you sure you want to end your session?', 'هل أنت تأكد من إغلاق الجلسة والعودة للرئيسية؟')}
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 min-h-[44px] sm:min-h-0 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                {t('Cancel', 'إلغاء')}
              </button>
              <button
                onClick={handlePerformLogout}
                className="flex-1 min-h-[44px] sm:min-h-0 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-red-200"
              >
                {t('Sign Out', 'خروج')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
