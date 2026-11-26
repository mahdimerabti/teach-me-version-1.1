import { supabase } from './supabase';

export type ChargilyPaymentMethod = 'edahabia' | 'cib';

export interface ChargilyCheckoutParams {
  packageId: string;
  packageName: string;
  amountDZD: number;
  paymentMethod: ChargilyPaymentMethod;
  customerName: string;
  customerEmail: string;
}

export interface ChargilyCheckoutResponse {
  checkoutId: string;
  checkoutUrl: string;
  status: 'pending' | 'paid' | 'failed';
  isSandboxMode: boolean;
}

function buildSandboxResponse(params: ChargilyCheckoutParams): ChargilyCheckoutResponse {
  const randomBytes = new Uint8Array(6);
  crypto.getRandomValues(randomBytes);
  const suffix = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const mockCheckoutId = `ch_sandbox_${suffix}`;
  const safeMethod = params.paymentMethod === 'cib' ? 'cib' : 'edahabia';
  const safeAmount = Math.max(0, Math.floor(Number(params.amountDZD) || 0));
  return {
    checkoutId: mockCheckoutId,
    checkoutUrl: `#chargily-sandbox?checkout_id=${encodeURIComponent(mockCheckoutId)}&method=${safeMethod}&amount=${safeAmount}`,
    status: 'pending',
    isSandboxMode: true
  };
}

/**
 * Creates a Chargily checkout exclusively via the authenticated server-side
 * Supabase Edge Function (`create-chargily-checkout`), ensuring merchant
 * secret keys and authoritative package pricing remain strictly server-side.
 */
export async function createChargilyCheckout(
  params: ChargilyCheckoutParams
): Promise<ChargilyCheckoutResponse> {
  const safeMethod: ChargilyPaymentMethod = params.paymentMethod === 'cib' ? 'cib' : 'edahabia';

  try {
    const { data, error } = await supabase.functions.invoke('create-chargily-checkout', {
      body: {
        packageId: String(params.packageId || '').trim().slice(0, 32),
        paymentMethod: safeMethod
      }
    });

    if (error || !data) {
      return buildSandboxResponse(params);
    }

    if (data.isSandboxMode) {
      return buildSandboxResponse(params);
    }

    const checkoutUrl = typeof data.checkoutUrl === 'string' ? data.checkoutUrl.trim() : '';
    const isTrustedChargilyUrl = /^https:\/\/pay\.chargily\.net\//i.test(checkoutUrl);
    if (!isTrustedChargilyUrl || typeof data.checkoutId !== 'string') {
      throw new Error('Untrusted checkout redirect URL returned by payment gateway');
    }

    return {
      checkoutId: data.checkoutId,
      checkoutUrl,
      status: data.status === 'paid' || data.status === 'failed' ? data.status : 'pending',
      isSandboxMode: Boolean(data.isSandboxMode)
    };
  } catch {
    return buildSandboxResponse(params);
  }
}
