import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invoke = vi.fn();

vi.mock('../src/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { AI_ADDON_PRICES, openBillingPortal, startAiAddonCheckout } from '../src/lib/services/billing';

describe('billing service', () => {
  const assign = vi.fn();

  beforeEach(() => {
    invoke.mockReset();
    assign.mockReset();
    vi.stubGlobal('window', { location: { assign } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prices the AI add-on at $5/month and $45/year', () => {
    expect(AI_ADDON_PRICES).toEqual({ month: 5, year: 45 });
  });

  it('starts checkout for the chosen interval and redirects to Stripe', async () => {
    invoke.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/c/pay/cs_test_1' }, error: null });

    await startAiAddonCheckout('year');

    expect(invoke).toHaveBeenCalledWith('create-checkout-session', {
      body: {
        interval: 'year',
        successUrl: '/dashboard?billing=success',
        cancelUrl: '/dashboard?billing=cancel',
      },
    });
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
  });

  it('surfaces the server error message and does not redirect', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'You already have the AI add-on.' })) },
    });

    await expect(startAiAddonCheckout('month')).rejects.toThrow('You already have the AI add-on.');
    expect(assign).not.toHaveBeenCalled();
  });

  it('refuses a non-https URL from the server', async () => {
    invoke.mockResolvedValue({ data: { url: 'javascript:alert(1)' }, error: null });

    await expect(openBillingPortal()).rejects.toThrow('Payments are unavailable');
    expect(assign).not.toHaveBeenCalled();
  });

  it('opens the Stripe customer portal', async () => {
    invoke.mockResolvedValue({ data: { url: 'https://billing.stripe.com/p/session/test_1' }, error: null });

    await openBillingPortal();

    expect(invoke).toHaveBeenCalledWith('create-portal-session', { body: {} });
    expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session/test_1');
  });
});
