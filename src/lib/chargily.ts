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
  const secretKey = import.meta.env.VITE_CHARGILY_SECRET_KEY;
  const isLive = import.meta.env.VITE_CHARGILY_MODE === 'live';
  const apiUrl = isLive ? CHARGILY_LIVE_API_URL : CHARGILY_TEST_API_URL;

  if (!secretKey) {
    // Return simulated Sandbox Checkout Response when API key is not configured in .env
    const mockCheckoutId = `ch_test_${Math.random().toString(36).substring(2, 11)}`;
    return {
      checkoutId: mockCheckoutId,
      checkoutUrl: `#chargily-sandbox?checkout_id=${mockCheckoutId}&method=${params.paymentMethod}&amount=${params.amountDZD}`,
      status: 'pending',
      isSandboxMode: true
    };
  }

  try {
    const response = await fetch(`${apiUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: params.amountDZD,
        currency: 'dzd',
        payment_method: params.paymentMethod,
        success_url: `${window.location.origin}/?payment=success&pkg=${params.packageId}`,
        failure_url: `${window.location.origin}/?payment=failure`,
        customer: {
          name: params.customerName || 'Student',
          email: params.customerEmail || 'student@teachme.dz'
        },
        metadata: [
          { package_id: params.packageId, package_name: params.packageName }
        ]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `Chargily API Error (${response.status})`);
    }

    const data = await response.json();
    return {
      checkoutId: data.id,
      checkoutUrl: data.checkout_url,
      status: data.status || 'pending',
      isSandboxMode: !isLive
    };
  } catch (error: any) {
    console.warn('Chargily Pay API direct call notice:', error.message);
    // Fallback to simulated checkout on CORS / local dev sandbox
    const mockCheckoutId = `ch_dev_${Math.random().toString(36).substring(2, 11)}`;
    return {
      checkoutId: mockCheckoutId,
      checkoutUrl: `#chargily-sandbox?checkout_id=${mockCheckoutId}&method=${params.paymentMethod}&amount=${params.amountDZD}`,
      status: 'pending',
      isSandboxMode: true
    };
  }
}
