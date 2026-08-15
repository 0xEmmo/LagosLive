// Client-side Paystack Inline loader. Only NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is
// referenced here; the secret key never reaches the browser.

export interface PaystackInlineOptions {
  email: string;
  amountKobo: number;
  reference: string;
  callback: (response: { reference: string }) => void;
  onClose: () => void;
}

interface PaystackPop {
  setup(opts: {
    key: string;
    email: string;
    amount: number;
    ref: string;
    currency: 'NGN';
    callback: (r: { reference: string }) => void;
    onClose: () => void;
  }): { openIframe(): void };
}

interface PaystackPopWindow extends Window {
  PaystackPop?: PaystackPop;
}

let loadPromise: Promise<unknown> | null = null;

function loadPaystackScript(): Promise<unknown> {
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('Paystack can only be loaded in the browser'));
        return;
      }
      const existing = document.getElementById('paystack-inline');
      if (existing) {
        resolve(existing);
        return;
      }
      const script = document.createElement('script');
      script.id = 'paystack-inline';
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onload = () => resolve(script);
      script.onerror = () => {
        loadPromise = null;
        reject(new Error('Could not load Paystack. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

export async function openPaystackInline(options: PaystackInlineOptions): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('Paystack is not configured yet.');
  }
  await loadPaystackScript();
  const pop = (window as unknown as PaystackPopWindow).PaystackPop;
  if (!pop) {
    throw new Error('Could not load Paystack. Check your connection and try again.');
  }
  pop.setup({
    key: publicKey,
    email: options.email,
    amount: options.amountKobo,
    ref: options.reference,
    currency: 'NGN',
    callback: options.callback,
    onClose: options.onClose,
  }).openIframe();
}
