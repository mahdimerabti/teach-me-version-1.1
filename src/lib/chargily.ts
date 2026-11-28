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

const CHARGILY_TEST_API_URL = 'https://pay.chargily.net/test/api/v2';
const CHARGILY_LIVE_API_URL = 'https://pay.chargily.net/api/v2';

export async function createChargilyCheckout(
  params: ChargilyCheckoutParams
): Promise<ChargilyCheckoutResponse> {
  // Security: Chargily secret keys must NEVER be exposed in client-side VITE_* bundles.
  // Checkout creation must be performed by a server-side Edge Function using a server secret.
  const mockCheckoutId = `ch_sandbox_${Math.random().toString(36).substring(2, 11)}`;
  return {
    checkoutId: mockCheckoutId,
    checkoutUrl: `#chargily-sandbox?checkout_id=${mockCheckoutId}&method=${encodeURIComponent(params.paymentMethod)}&amount=${encodeURIComponent(String(params.amountDZD))}`,
    status: 'pending',
    isSandboxMode: true
  };
}
