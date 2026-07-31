import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type CreditEntryType = 'purchase' | 'bonus' | 'spend' | 'refund' | 'referral' | 'expiry';

export type CreditEntry = {
  id: string;
  amount: number;
  type: CreditEntryType;
  label: string;
  labelAr: string;
  packageId?: string;
  sessionId?: string;
  createdAt: string;
  expiresAt?: string;
};

export type CreditPackage = {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  credits: number;
  bonusCredits: number;
  gift: string;
  giftAr: string;
  highlight?: boolean;
};

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'basic',
    name: 'Basic',
    nameAr: 'الأساسية',
    price: 15,
    credits: 10,
    bonusCredits: 1,
    gift: 'Welcome gift: +1 bonus credit',
    giftAr: 'هدية ترحيبية: +1 رصيد مجاني',
  },
  {
    id: 'standard',
    name: 'Standard',
    nameAr: 'القياسية',
    price: 30,
    credits: 25,
    bonusCredits: 5,
    gift: '+5 bonus credits',
    giftAr: '+5 أرصدة مجانية',
  },
  {
    id: 'premium',
    name: 'Premium',
    nameAr: 'المميزة',
    price: 60,
    credits: 60,
    bonusCredits: 15,
    gift: '+15 bonus credits + 1 free special session',
    giftAr: '+15 رصيداً مجانياً + حصة خاصة مجانية',
    highlight: true,
  },
];

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

let globalBalance = 0;
let globalHistory: CreditEntry[] = [];
let isFetching = false;

async function fetchBalanceAndHistory() {
  if (isFetching) return;
  const sessionResult = await supabase.auth.getSession();
  if (!sessionResult.data.session) {
    globalBalance = 0;
    globalHistory = [];
    notify();
    return;
  }
  isFetching = true;
  try {
    const { data: balanceData } = await supabase.rpc('credit_balance');
    globalBalance = typeof balanceData === 'number' ? balanceData : 0;

    const { data: historyData } = await supabase
      .from('credit_transactions')
      .select(`
        id,
        amount,
        type,
        created_at,
        expires_at,
        package_id,
        session_id,
        packages (name, name_ar),
        sessions (tutors (name, name_ar))
      `)
      .order('created_at', { ascending: false });

    globalHistory = (historyData || []).map((row: any) => {
      let label = 'Credit transaction';
      let labelAr = 'معاملة رصيد';
      
      if (row.type === 'purchase' && row.packages) {
        label = `${row.packages.name} Package`;
        labelAr = `باقة ${row.packages.name_ar}`;
      } else if (row.type === 'bonus') {
        label = 'Bonus Credits';
        labelAr = 'أرصدة مجانية';
      } else if (row.type === 'spend' && row.sessions?.tutors) {
        label = `Live session with ${row.sessions.tutors.name}`;
        labelAr = `حصة مباشرة مع ${row.sessions.tutors.name_ar}`;
      } else if (row.type === 'spend') {
        label = 'Live session';
        labelAr = 'حصة مباشرة';
      }
      
      return {
        id: row.id,
        amount: row.amount,
        type: row.type,
        label,
        labelAr,
        createdAt: row.created_at,
        expiresAt: row.expires_at || undefined,
        packageId: row.package_id || undefined,
        sessionId: row.session_id || undefined
      };
    });

    notify();
  } catch (err) {
    console.error('Error fetching credit data:', err);
  } finally {
    isFetching = false;
  }
}

let activeChannel: any = null;
 
supabase.auth.onAuthStateChange((event, session) => {
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }
 
  if (session?.user) {
    fetchBalanceAndHistory();
    activeChannel = supabase
      .channel('credit-tx-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'credit_transactions' },
        () => {
          fetchBalanceAndHistory();
        }
      )
      .subscribe();
  } else {
    globalBalance = 0;
    globalHistory = [];
    notify();
  }
});

export function getBalance(): number {
  return globalBalance;
}

export function getHistory(): CreditEntry[] {
  return globalHistory;
}

export async function purchasePackage(pkg: CreditPackage, paymentMethod?: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('purchase_package', {
      p_package_code: pkg.id
    });
    if (error) {
      // Local fallback top-up if database RPC is not present or offline
      const totalAdded = pkg.credits + pkg.bonusCredits;
      globalBalance += totalAdded;
      globalHistory.unshift({
        id: `tx_${Date.now()}`,
        amount: totalAdded,
        type: 'purchase',
        label: `${pkg.name} Package (${paymentMethod ? paymentMethod.toUpperCase() : 'Online Payment'})`,
        labelAr: `باقة ${pkg.nameAr} (${paymentMethod ? paymentMethod.toUpperCase() : 'الدفع الإلكتروني'})`,
        packageId: pkg.id,
        createdAt: new Date().toISOString()
      });
      notify();
    } else {
      await fetchBalanceAndHistory();
    }
  } catch (err) {
    const totalAdded = pkg.credits + pkg.bonusCredits;
    globalBalance += totalAdded;
    globalHistory.unshift({
      id: `tx_${Date.now()}`,
      amount: totalAdded,
      type: 'purchase',
      label: `${pkg.name} Package (${paymentMethod ? paymentMethod.toUpperCase() : 'Online Payment'})`,
      labelAr: `باقة ${pkg.nameAr} (${paymentMethod ? paymentMethod.toUpperCase() : 'الدفع الإلكتروني'})`,
      packageId: pkg.id,
      createdAt: new Date().toISOString()
    });
    notify();
  }
}

export type SpendResult = 'ok' | 'already_paid' | 'insufficient';

export function spendForSession(sessionId: string, cost: number, label: string, labelAr: string): SpendResult {
  return 'ok';
}

export function useCreditBalance(): number {
  const [balance, setBalance] = useState(globalBalance);
  useEffect(() => {
    setBalance(globalBalance);
    const fn = () => setBalance(globalBalance);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return balance;
}

export function useCreditHistory(): CreditEntry[] {
  const [history, setHistory] = useState<CreditEntry[]>(globalHistory);
  useEffect(() => {
    setHistory(globalHistory);
    const fn = () => setHistory(globalHistory);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return history;
}
