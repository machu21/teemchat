import { supabase } from '../supabase';

export type AiAddonInterval = 'month' | 'year';

/** AI Companion add-on prices in USD (must match create-checkout-session). */
export const AI_ADDON_PRICES: Record<AiAddonInterval, number> = { month: 5, year: 45 };

const FALLBACK_ERROR = 'Payments are unavailable right now. Please try again in a moment.';

/** Calls a billing edge function and returns the Stripe URL it hands back. */
async function requestBillingUrl(fn: string, body: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = FALLBACK_ERROR;
    try {
      const context = (error as { context?: Response }).context;
      const payload = context ? await context.json() : null;
      if (payload && typeof payload.error === 'string') message = payload.error;
    } catch {
      // Non-JSON error body: keep the fallback message.
    }
    throw new Error(message);
  }
  const url = (data as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error(FALLBACK_ERROR);
  return url;
}

/**
 * Sends the user to Stripe Checkout for the AI add-on. In the Android app the
 * WebView hands this external URL to the system browser.
 */
export async function startAiAddonCheckout(interval: AiAddonInterval): Promise<void> {
  const url = await requestBillingUrl('create-checkout-session', {
    interval,
    successUrl: '/dashboard?billing=success',
    cancelUrl: '/dashboard?billing=cancel',
  });
  window.location.assign(url);
}

/** Opens the Stripe Customer Portal (cancel, change card, invoices). */
export async function openBillingPortal(): Promise<void> {
  const url = await requestBillingUrl('create-portal-session', {});
  window.location.assign(url);
}
