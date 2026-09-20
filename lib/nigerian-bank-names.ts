// Client-safe Nigerian bank list used by the host verification payout step.
// Keep these names in step with NIGERIAN_BANK_CODES in lib/paystack-server.ts
// (the keys there are the values the form stores in host_verifications.bank_name
// and the codes Paystack validates when a recipient is created).
export const NIGERIAN_BANK_NAMES: readonly string[] = [
  'ABB',
  'Access Bank',
  'Citibank Nigeria',
  'Ecobank Nigeria',
  'FCMB',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'Globus Bank',
  'Guaranty Trust Bank',
  'Heritage Bank',
  'Jaiz Bank',
  'Keystone Bank',
  'Kuda Microfinance Bank',
  'Moniepoint MFB',
  'OPay',
  'Palmpay',
  'Polaris Bank',
  'Providus Bank',
  'Stanbic IBTC Bank',
  'Standard Chartered Bank',
  'Sterling Bank',
  'SunTrust Bank Nigeria',
  'Union Bank of Nigeria',
  'United Bank for Africa',
  'Unity Bank',
  'Wema Bank',
  'Zenith Bank',
] as const;