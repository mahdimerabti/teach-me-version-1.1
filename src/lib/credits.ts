import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { FREE_TRIAL_INITIAL_CREDITS, PAID_PLANS_ENABLED } from './config';

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
let hasAttemptedAutoGrant = false;

export async function fetchBalanceAndHistory() {
  if (isFetching) return;
  const sessionResult = await supabase.auth.getSession();
  if (!sessionResult.data.session) {
    globalBalance = 0;
    globalHistory = [];
    hasAttemptedAutoGrant = false;
    notify();
    return;
  }
  isFetching = true;
  try {
    const { data: balanceData } = await supabase.rpc('credit_balance');
    let resolvedBalance = typeof balanceData === 'number' ? balanceData : 0;

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

    // Auto-grant starter free trial credits if this student has zero credit history during free trial
    if (!PAID_PLANS_ENABLED && !hasAttemptedAutoGrant && resolvedBalance === 0 && (!historyData || historyData.length === 0)) {
      hasAttemptedAutoGrant = true;
      const { data: claimRes } = await supabase.rpc('claim_free_trial_credits', {
        p_amount: FREE_TRIAL_INITIAL_CREDITS
      });
      if (claimRes && typeof (claimRes as any).balance === 'number') {
        resolvedBalance = (claimRes as any).balance;
        isFetching = false;
        await fetchBalanceAndHistory();
        return;
      }
    }

    globalBalance = resolvedBalance;

    globalHistory = (historyData || []).map((row: any) => {
      let label = 'Credit transaction';
      let labelAr = 'معاملة رصيد';

      if (row.type === 'purchase' && row.packages) {
        label = `${row.packages.name} Package`;
        labelAr = `باقة ${row.packages.name_ar}`;
      } else if (row.type === 'bonus') {
        label = 'Free Trial Credits';
        labelAr = 'أرصدة تجريبية مجانية';
      } else if (row.type === 'spend' && row.sessions?.tutors) {
        label = `Live session with ${row.sessions.tutors.name}`;
        labelAr = `حصة مباشرة مع ${row.sessions.tutors.name_ar}`;
      } else if (row.type === 'spend') {
        label = 'Live Zoom Session';
        labelAr = 'انضمام لحصة زوم مباشرة';
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

supabase.auth.onAuthStateChange((_event, session) => {
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }

  if (session?.user) {
    // Defer DB/RPC calls outside onAuthStateChange so GoTrue releases its auth lock first
    setTimeout(() => {
      void fetchBalanceAndHistory();
      activeChannel = supabase
        .channel('credit-tx-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'credit_transactions' },
          () => {
            void fetchBalanceAndHistory();
          }
        )
        .subscribe();
    }, 0);
  } else {
    globalBalance = 0;
    globalHistory = [];
    hasAttemptedAutoGrant = false;
    notify();
  }
});

// Trigger initial load if session is already hydrated
fetchBalanceAndHistory();

export function getBalance(): number {
  return globalBalance;
}

export function getHistory(): CreditEntry[] {
  return globalHistory;
}

/**
 * Claims Free Trial Credits via Supabase RPC (safe during Free Trial mode).
 */
export async function claimFreeTrialCredits(amount = FREE_TRIAL_INITIAL_CREDITS): Promise<{
  ok: boolean;
  granted: number;
  balance: number;
  alreadySufficient?: boolean;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('claim_free_trial_credits', { p_amount: amount });
    if (error) {
      return { ok: false, granted: 0, balance: globalBalance, error: error.message };
    }
    const res = data as any;
    if (res?.error) {
      return { ok: false, granted: 0, balance: globalBalance, error: res.error };
    }
    if (typeof res?.balance === 'number') {
      globalBalance = res.balance;
      notify();
    }
    await fetchBalanceAndHistory();
    return {
      ok: true,
      granted: Number(res?.granted || 0),
      balance: typeof res?.balance === 'number' ? res.balance : globalBalance,
      alreadySufficient: Boolean(res?.already_sufficient)
    };
  } catch (err: any) {
    return { ok: false, granted: 0, balance: globalBalance, error: err?.message || 'Unknown error' };
  }
}

/**
 * Deducts 1 Free Trial Credit when joining an approved tutor's active live Zoom session.
 */
export async function spendTrialCreditForLiveJoin(tutorId?: string, cost = 1): Promise<{
  ok: boolean;
  balance: number;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('spend_trial_credit_for_live_join', {
      p_tutor_id: tutorId || null,
      p_cost: cost
    });
    if (error) {
      return { ok: false, balance: globalBalance, error: error.message };
    }
    const res = data as any;
    if (res?.error === 'insufficient_credits') {
      return { ok: false, balance: Number(res?.balance ?? globalBalance), error: 'insufficient_credits' };
    }
    if (res?.error) {
      return { ok: false, balance: globalBalance, error: res.error };
    }
    if (typeof res?.balance === 'number') {
      globalBalance = res.balance;
      notify();
    }
    fetchBalanceAndHistory();
    return { ok: true, balance: typeof res?.balance === 'number' ? res.balance : globalBalance };
  } catch (err: any) {
    return { ok: false, balance: globalBalance, error: err?.message || 'Failed to deduct credit' };
  }
}

export async function purchasePackage(pkg: CreditPackage, _paymentMethod?: string): Promise<void> {
  if (!PAID_PLANS_ENABLED) {
    throw new Error('Paid packages are temporarily disabled during Free Trial.');
  }
  const { error } = await supabase.rpc('purchase_package', {
    p_package_code: pkg.id
  });
  if (error) {
    throw new Error(error.message || 'Payment verification failed');
  }
  await fetchBalanceAndHistory();
}

export type SpendResult = 'ok' | 'already_paid' | 'insufficient';

export function spendForSession(_sessionId: string, _cost: number, _label: string, _labelAr: string): SpendResult {
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
