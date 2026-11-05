/**
 * Business details used on the Terms, Privacy, Refund and Contact pages.
 * Stripe reviews these pages before paying out, so set the real values
 * (env vars or the fallbacks below) before going live.
 */
export const LEGAL = {
  /** Registered business name, e.g. "TeemChat LLC". */
  companyName: process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME?.trim() || 'TeemChat',
  /** Inbox that customers (and Stripe) can reach. */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'support@teemchat.chat',
  /** US state whose laws govern the Terms, e.g. "Delaware". */
  governingState: process.env.NEXT_PUBLIC_LEGAL_STATE?.trim() || '',
  /** Shown at the top of each legal page. Update when the text changes. */
  lastUpdated: 'November 5, 2026',
} as const;

/** AI Companion add-on prices in USD, shown on the pricing and legal pages. */
export const AI_ADDON_PRICE_TEXT = { month: '$5 per month', year: '$45 per year' } as const;
