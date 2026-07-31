import { Wallet } from 'lucide-react';
import { useCreditBalance } from '../lib/credits';

type Props = { onClick?: () => void };

export default function CreditBadge({ onClick }: Props) {
  const balance = useCreditBalance();
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
      aria-label="Credits"
    >
      <Wallet className="w-4 h-4 text-blue-600" />
      <span className="text-xs font-bold text-blue-700">{balance}</span>
    </button>
  );
}
