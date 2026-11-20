import { Gift, Wallet } from 'lucide-react';
import { useCreditBalance } from '../lib/credits';
import { PAID_PLANS_ENABLED } from '../lib/config';

type Props = {
  onClick?: () => void;
  language?: 'en' | 'ar' | 'fr';
};

export default function CreditBadge({ onClick, language = 'en' }: Props) {
  const balance = useCreditBalance();
  const label = !PAID_PLANS_ENABLED
    ? language === 'ar'
      ? 'مجاني'
      : language === 'fr'
      ? 'Essai'
      : 'Trial'
    : null;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors ${
        !PAID_PLANS_ENABLED
          ? 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/70'
          : 'bg-blue-50 hover:bg-blue-100'
      }`}
      aria-label="Credits"
    >
      {!PAID_PLANS_ENABLED ? (
        <Gift className="w-4 h-4 text-emerald-600" />
      ) : (
        <Wallet className="w-4 h-4 text-blue-600" />
      )}
      <span className={`text-xs font-bold ${!PAID_PLANS_ENABLED ? 'text-emerald-700' : 'text-blue-700'}`}>
        {balance}
      </span>
      {label && (
        <span className="text-[10px] font-semibold text-emerald-600 hidden sm:inline">
          {label}
        </span>
      )}
    </button>
  );
}
