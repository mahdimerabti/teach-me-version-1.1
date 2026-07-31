import { ArrowLeft, Clock, Gift, RotateCcw, ShoppingBag, UserPlus, Video, Wallet } from 'lucide-react';
import { useCreditBalance, useCreditHistory, type CreditEntryType } from '../lib/credits';

type Props = {
  language: 'en' | 'ar' | 'fr';
  onBack: () => void;
};

const ICONS: Record<CreditEntryType, typeof Gift> = {
  purchase: ShoppingBag,
  bonus: Gift,
  spend: Video,
  refund: RotateCcw,
  referral: UserPlus,
  expiry: Clock,
};

const STYLES: Record<CreditEntryType, { text: string; bg: string }> = {
  purchase: { text: 'text-green-600', bg: 'bg-green-50' },
  bonus: { text: 'text-amber-500', bg: 'bg-amber-50' },
  spend: { text: 'text-red-500', bg: 'bg-red-50' },
  refund: { text: 'text-blue-500', bg: 'bg-blue-50' },
  referral: { text: 'text-purple-500', bg: 'bg-purple-50' },
  expiry: { text: 'text-gray-500', bg: 'bg-gray-50' },
};

export default function CreditHistoryScreen({ language, onBack }: Props) {
  const t = (en: string, ar: string, fr?: string) => (language === 'ar' ? ar : (language === 'fr' ? (fr || en) : en));
  const history = useCreditHistory();
  const balance = useCreditBalance();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="font-bold text-gray-900 flex-1">{t('Credit History', 'سجل الرصيد')}</h1>
        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold">
          <Wallet className="w-3.5 h-3.5" /> {balance}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 animate-slide-up pb-8">
        {history.length === 0 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <Wallet className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              {t('No credit activity yet. Buy a package to get started!', 'لا يوجد نشاط للرصيد بعد. اشترِ باقة للبدء!')}
            </p>
          </div>
        )}
        {history.map(entry => {
          const Icon = ICONS[entry.type];
          const style = STYLES[entry.type];
          return (
            <div key={entry.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className={`w-10 h-10 ${style.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${style.text}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {language === 'ar' ? entry.labelAr : entry.label}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(entry.createdAt).toLocaleDateString(language === 'ar' ? 'ar' : 'en-US', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                {entry.expiresAt && entry.amount > 0 && (
                  <p className="text-[10px] text-amber-500 font-medium mt-0.5">
                    {t('Valid until', 'صالح حتى')}{' '}
                    {new Date(entry.expiresAt).toLocaleDateString(language === 'ar' ? 'ar' : 'en-US', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
              <span className={`font-bold text-sm flex-shrink-0 ${entry.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {entry.amount > 0 ? '+' : ''}
                {entry.amount}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
