import { useEffect, useState } from 'react';
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
  CreditCard
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: tutorsData } = await supabase
        .from('tutors')
        .select('*')
        .order('created_at', { ascending: false });
      if (tutorsData) setTutors(tutorsData);

      const { data: sessionsData } = await supabase
        .from('sessions')
        .select('*')
        .order('date', { ascending: false });
      if (sessionsData) setSessions(sessionsData);

      const { data: txData } = await supabase
        .from('credit_transactions')
        .select('*')
        .order('created_at', { ascending: false });
      if (txData) setTransactions(txData);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('admin-tutors-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tutors' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    try {
      const { error } = await supabase
        .from('tutors')
        .update({ is_verified: !currentStatus })
        .eq('id', tutorId);

      if (error) throw error;

      setTutors((prev: any[]) =>
        prev.map(t => (t.id === tutorId ? { ...t, is_verified: !currentStatus } : t))
      );
      if (selectedTutor && selectedTutor.id === tutorId) {
        setSelectedTutor((prev: any) => (prev ? { ...prev, is_verified: !currentStatus } : null));
      }
    } catch (err: any) {
      alert('Failed to update tutor verification: ' + err.message);
    }
  };

  const updateTutorStatus = async (tutorId: string, newStatus: string) => {
    try {
      const updatePayload: any = { status: newStatus };
      if (newStatus === 'approved') {
        updatePayload.is_verified = true;
      }
      const { data: tutorData, error } = await supabase
        .from('tutors')
        .update(updatePayload)
        .eq('id', tutorId)
        .select('user_id, name')
        .maybeSingle();

      if (error) throw error;

      if (tutorData?.user_id) {
        try {
          await supabase.from('notifications').insert({
            user_id: tutorData.user_id,
            title: newStatus === 'approved' ? 'Application Approved!' : 'Application Status Update',
            title_ar: newStatus === 'approved' ? 'تمت الموافقة على طلبك!' : 'تحديث حالة الطلب',
            body: newStatus === 'approved' 
              ? 'Congratulations! Your tutor application has been approved. You are now live on Teach Me.' 
              : 'Your tutor application status has been updated by administration.',
            body_ar: newStatus === 'approved'
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
    } catch (err: any) {
      alert('Failed to update tutor status: ' + err.message);
    }
  };

  const toggleIdentityVerification = async (tutorId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('tutors')
        .update({ identity_verified: !currentStatus })
        .eq('id', tutorId);

      if (error) throw error;

      setTutors((prev: any[]) =>
        prev.map(t => (t.id === tutorId ? { ...t, identity_verified: !currentStatus } : t))
      );
      if (selectedTutor && selectedTutor.id === tutorId) {
        setSelectedTutor((prev: any) => (prev ? { ...prev, identity_verified: !currentStatus } : null));
      }
    } catch (err: any) {
      alert('Failed to update identity verification: ' + err.message);
    }
  };

  const totalTutors = tutors.length;
  const verifiedTutors = tutors.filter(t => t.is_verified).length;
  const pendingTutors = tutors.filter(t => t.status === 'pending' || !t.status).length;
  const totalSessions = sessions.length;
  
  const totalEarnings = transactions.filter(t => t.type === 'purchase').reduce((sum, t) => {
    if (t.amount === 60) return sum + 3000;
    if (t.amount === 120) return sum + 5500;
    if (t.amount === 220) return sum + 9500;
    return sum + (t.amount * 50);
  }, 0);

  const filteredTutors = tutors.filter(t => {
    const matchesSearch =
      t.name.toLowerCase().includes(tutorSearch.toLowerCase()) ||
      (t.subjects && t.subjects.some((s: string) => s.toLowerCase().includes(tutorSearch.toLowerCase())));
    const matchesStatus = tutorStatusFilter === 'all' || (t.status || 'pending') === tutorStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredSessions = sessions.filter(s => {
    if (sessionFilter === 'all') return true;
    return s.status === sessionFilter;
  });

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col w-full max-w-6xl mx-auto shadow-2xl border-x border-slate-100 font-sans text-slate-900 select-none antialiased relative ${language === 'ar' ? 'font-cairo' : ''}`}>
      <header className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 text-white px-5 pt-8 pb-6 sticky top-0 z-30 shadow-lg shadow-blue-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center text-white shadow-inner">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-black text-base md:text-lg leading-tight flex items-center gap-1.5">
                {t('Admin Console', 'لوحة التحكم والمشرف')}
              </h1>
              <p className="text-xs text-blue-100 font-medium truncate max-w-[170px]">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex bg-white/10 backdrop-blur p-0.5 rounded-xl border border-white/20">
              {(['en', 'ar', 'fr'] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => onChangeLanguage(lang)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                    language === lang ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-100 hover:text-white'
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={fetchData}
              className="p-2 bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 rounded-xl transition-all text-white"
              title={t('Refresh Data', 'تحديث البيانات')}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handlePerformLogout}
              className="px-2.5 py-1.5 bg-red-500/20 hover:bg-red-500/30 active:scale-95 border border-red-200/40 text-white rounded-xl transition-all shadow-sm flex items-center gap-1 font-bold text-xs"
              title={t('Sign Out', 'تسجيل الخروج')}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('Logout', 'خروج')}</span>
            </button>
          </div>
        </div>

        <div className="flex bg-white/10 backdrop-blur p-1 rounded-2xl border border-white/20 gap-1 overflow-x-auto">
          {[
            { id: 'overview', label: t('Overview', 'الرئيسية'), icon: Sparkles },
            { id: 'tutors', label: t('Tutors', 'المعلمون'), icon: Users, badge: pendingTutors > 0 ? pendingTutors : undefined },
            { id: 'sessions', label: t('Sessions', 'الحصص'), icon: Calendar },
            { id: 'finance', label: t('Sales', 'المبيعات'), icon: DollarSign }
          ].map(tab => {
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

      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-24">
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-slide-up">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-2">
                  <Users className="w-5 h-5" />
                </div>
                <p className="text-xl font-bold text-slate-900 leading-none">{totalTutors}</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">{t('Total Tutors', 'إجمالي المعلمين')}</p>
                <p className="text-[10px] text-blue-600 font-bold mt-2 flex items-center gap-1">
                  <UserCheck className="w-3 h-3" /> {verifiedTutors} {t('Verified', 'موثق')}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-2">
                  <Calendar className="w-5 h-5" />
                </div>
                <p className="text-xl font-bold text-slate-900 leading-none">{totalSessions}</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">{t('Total Sessions', 'إجمالي الحصص')}</p>
                <p className="text-[10px] text-indigo-600 font-bold mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Live & Done
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-2">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <p className="text-lg font-bold text-emerald-600 leading-none">{totalEarnings.toLocaleString()} DZD</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">{t('Platform Sales', 'مبيعات الأرصدة')}</p>
                <p className="text-[10px] text-slate-400 mt-2 font-medium">{t('Online Payment', 'الدفع الإلكتروني')}</p>

              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="w-9 h-9 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center mb-2">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <p className="text-xl font-bold text-teal-600 leading-none">100% OK</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">{t('System Health', 'حالة النظام')}</p>
                <p className="text-[10px] text-emerald-600 font-bold mt-2">Database Active</p>
              </div>
            </div>

            {/* Recent Tutors Quick Review Card */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">{t('Recent Tutor Applications', 'طلبات المعلمين الجديدة')}</h3>
                <button
                  onClick={() => setActiveTab('tutors')}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-0.5"
                >
                  {t('View All', 'عرض الكل')} <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {tutors.slice(0, 4).map(tutor => (
                  <div
                    key={tutor.id}
                    onClick={() => setSelectedTutor(tutor)}
                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50/50 active:scale-[0.99] cursor-pointer rounded-2xl border border-slate-100 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={tutor.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face'}
                        alt={tutor.name}
                        className="w-10 h-10 rounded-xl object-cover border border-slate-100 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-xs truncate">{tutor.name}</p>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{tutor.subjects ? tutor.subjects.join(', ') : tutor.category}</p>
                        <span className={`inline-block text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded mt-1 ${
                          tutor.status === 'approved' ? 'bg-green-100 text-green-700' :
                          tutor.status === 'pending' || !tutor.status ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {tutor.status || 'pending'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Tutors Management */}
        {activeTab === 'tutors' && (
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">{t('Tutors Management', 'إدارة وتوثيق المعلمين')}</h3>
              <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
                {totalTutors - verifiedTutors} {t('pending verification', 'في الانتظار')}
              </span>
            </div>

            {/* Status Filter */}
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 overflow-x-auto">
              {['all', 'pending', 'approved', 'suspended', 'banned'].map(st => (
                <button
                  key={st}
                  onClick={() => setTutorStatusFilter(st)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap ${
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
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all border border-slate-100"
              />
            </div>

            {/* Tutor List */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {filteredTutors.map(tutor => (
                <div
                  key={tutor.id}
                  onClick={() => setSelectedTutor(tutor)}
                  className="flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50/50 active:scale-[0.99] cursor-pointer rounded-2xl border border-slate-100 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={tutor.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face'}
                      alt={tutor.name}
                      className="w-11 h-11 rounded-xl object-cover border border-slate-100 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-slate-800 text-xs truncate">{tutor.name}</p>
                        <span className={`w-2 h-2 rounded-full ${tutor.is_online ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                          tutor.status === 'approved' ? 'bg-green-100 text-green-700' :
                          tutor.status === 'pending' || !tutor.status ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {tutor.status || 'pending'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{tutor.subjects ? tutor.subjects.join(', ') : tutor.category}</p>
                      <p className="text-[9px] text-blue-600 font-bold mt-1">
                        {tutor.hourly_rate} {CURRENCY_CODE}/hr · {tutor.experience_years || 3} yrs exp
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVerification(tutor.id, tutor.is_verified);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        tutor.is_verified
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      {tutor.is_verified ? t('Verified', 'موثق') : t('Verify', 'توثيق')}
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
              {filteredTutors.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-6">{t('No tutors found', 'لم يتم العثور على معلمين')}</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Sessions */}
        {activeTab === 'sessions' && (
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">{t('Sessions Audit', 'تدقيق الحصص والدروس')}</h3>
              <div className="flex bg-slate-100 p-0.5 rounded-lg">
                {['all', 'confirmed', 'completed', 'cancelled'].map(f => (
                  <button
                    key={f}
                    onClick={() => setSessionFilter(f)}
                    className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase transition-all ${
                      sessionFilter === f ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {filteredSessions.map(session => (
                <div key={session.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-800 text-xs">{session.subject || 'Private Session'}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{session.date} · {session.start_time?.slice(0, 5)} – {session.end_time?.slice(0, 5)}</p>
                    <p className="text-[9px] text-blue-600 font-semibold mt-1">Cost: {session.credit_cost || 1} credits</p>
                  </div>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    session.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                    session.status === 'completed' ? 'bg-green-100 text-green-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {session.status}
                  </span>
                </div>
              ))}
              {filteredSessions.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-6">{t('No sessions found', 'لا توجد حصص مسجلة')}</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Sales */}
        {activeTab === 'finance' && (
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-4 animate-slide-up">
            <h3 className="font-bold text-slate-900 text-sm">{t('Online Payment Transactions', 'سجل مبيعات الشحن الإلكتروني')}</h3>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {transactions.map(tx => (
                <div key={tx.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-xs">{tx.label || 'Package Purchase'}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{new Date(tx.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <p className="font-bold text-emerald-600 text-xs">+{tx.amount} credits</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tutor Moderation Modal */}
      {selectedTutor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setSelectedTutor(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-t-[32px] p-5 animate-slide-up shadow-2xl max-h-[85vh] overflow-y-auto text-slate-900">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />
            
            <div className="flex items-start gap-3.5 mb-4 border-b border-slate-100 pb-4">
              <img
                src={selectedTutor.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face'}
                alt={selectedTutor.name}
                className="w-14 h-14 rounded-2xl object-cover border border-slate-100 flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 text-base">{selectedTutor.name}</h3>
                <p className="text-xs text-blue-600 font-semibold mt-0.5">{selectedTutor.category}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`text-[8px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                    selectedTutor.status === 'approved' ? 'bg-green-100 text-green-700' :
                    selectedTutor.status === 'pending' || !selectedTutor.status ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {selectedTutor.status || 'pending'}
                  </span>
                  {selectedTutor.is_verified && (
                    <span className="text-[8px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Account Verified</span>
                  )}
                  {selectedTutor.identity_verified && (
                    <span className="text-[8px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">ID Verified</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 mb-5">
              <div>
                <h4 className="font-bold text-slate-800 mb-1">{t('Biography', 'السيرة الذاتية')}</h4>
                <p className="leading-relaxed bg-slate-50 rounded-xl p-3 border border-slate-100">{selectedTutor.bio || 'No bio provided'}</p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">{t('Subjects', 'المواد')}</h4>
                <div className="flex flex-wrap gap-1">
                  {selectedTutor.subjects && selectedTutor.subjects.map((s: string) => (
                    <span key={s} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-medium">{s}</span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">{t('Certificates & Documents', 'الشهادات والوثائق')}</h4>
                {selectedTutor.certificates && selectedTutor.certificates.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
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
                          className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 hover:bg-blue-100 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-blue-100 transition-colors"
                        >
                          🎓 {title} <span className="text-[9px] underline">({t('View', 'عرض')})</span>
                        </a>
                      ) : (
                        <span key={idx} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-blue-100">{title}</span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-[11px]">No certificates attached</p>
                )}
              </div>

              {(selectedTutor.id_document_url || selectedTutor.identity_document_url) && (
                <div className="bg-emerald-50/70 rounded-2xl p-3 border border-emerald-100">
                  <h4 className="font-bold text-emerald-800 mb-1 flex items-center gap-1.5 text-xs">
                    🛡️ {t('Government ID Document', 'وثيقة الهوية الرسمية')}
                  </h4>
                  <a
                    href={selectedTutor.id_document_url || selectedTutor.identity_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow-sm transition-all"
                  >
                    📄 {t('View Uploaded Identity Document', 'فتح معينة وثيقة الهوية')}
                  </a>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <h4 className="font-bold text-slate-800 text-xs mb-2">{t('Verification Badges', 'توثيق الرتب')}</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => toggleVerification(selectedTutor.id, selectedTutor.is_verified)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    selectedTutor.is_verified ? 'bg-slate-100 text-slate-600' : 'bg-blue-600 text-white shadow-md'
                  }`}
                >
                  {selectedTutor.is_verified ? 'Revoke Account Badge' : 'Verify Account Badge'}
                </button>
                <button
                  onClick={() => toggleIdentityVerification(selectedTutor.id, selectedTutor.identity_verified)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    selectedTutor.identity_verified ? 'bg-slate-100 text-slate-600' : 'bg-emerald-600 text-white shadow-md'
                  }`}
                >
                  {selectedTutor.identity_verified ? 'Revoke ID' : 'Verify Government ID'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => updateTutorStatus(selectedTutor.id, 'approved')}
                  disabled={selectedTutor.status === 'approved'}
                  className="py-2.5 bg-green-500 hover:bg-green-600 active:scale-95 text-white disabled:opacity-50 text-xs font-bold rounded-xl transition-all shadow-md"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => updateTutorStatus(selectedTutor.id, 'rejected')}
                  disabled={selectedTutor.status === 'rejected'}
                  className="py-2.5 bg-red-500 hover:bg-red-600 active:scale-95 text-white disabled:opacity-50 text-xs font-bold rounded-xl transition-all shadow-md"
                >
                  ✕ Reject
                </button>
                <button
                  onClick={() => updateTutorStatus(selectedTutor.id, 'info_requested')}
                  disabled={selectedTutor.status === 'info_requested'}
                  className="py-2.5 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white disabled:opacity-50 text-xs font-bold rounded-xl transition-all shadow-md"
                >
                  Request Info
                </button>
                <button
                  onClick={() => updateTutorStatus(selectedTutor.id, 'suspended')}
                  disabled={selectedTutor.status === 'suspended'}
                  className="py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white disabled:opacity-50 text-xs font-bold rounded-xl transition-all shadow-md"
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
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-xs text-center shadow-2xl animate-bounce-in text-slate-900">
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
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                {t('Cancel', 'إلغاء')}
              </button>
              <button
                onClick={handlePerformLogout}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-red-200"
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
