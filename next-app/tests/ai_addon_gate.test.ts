import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/rateLimit', () => import('../src/lib/rateLimit'));

import { checkCompanionQuota, isAiAddonActive } from '../src/lib/companionAuth';

const NOW = Date.parse('2026-11-12T00:00:00Z');

describe('isAiAddonActive', () => {
  it('grants access only for a paid add-on on a live subscription', () => {
    expect(isAiAddonActive({ status: 'active', has_ai_addon: true, current_period_end: null }, NOW)).toBe(true);
    expect(isAiAddonActive({ status: 'trialing', has_ai_addon: true, current_period_end: '2026-12-01T00:00:00Z' }, NOW)).toBe(true);
  });

  it('refuses everything else', () => {
    expect(isAiAddonActive(null, NOW)).toBe(false);
    expect(isAiAddonActive(undefined, NOW)).toBe(false);
    expect(isAiAddonActive({}, NOW)).toBe(false);
    expect(isAiAddonActive({ status: 'active', has_ai_addon: false }, NOW)).toBe(false);
    expect(isAiAddonActive({ status: 'active', has_ai_addon: null }, NOW)).toBe(false);
    expect(isAiAddonActive({ status: 'past_due', has_ai_addon: true }, NOW)).toBe(false);
    expect(isAiAddonActive({ status: 'canceled', has_ai_addon: true }, NOW)).toBe(false);
    expect(isAiAddonActive({ status: 'active', has_ai_addon: true, current_period_end: '2026-11-11T00:00:00Z' }, NOW)).toBe(false);
    expect(isAiAddonActive({ status: 'active', has_ai_addon: true, current_period_end: 'not-a-date' }, NOW)).toBe(false);
  });
});

describe('checkCompanionQuota', () => {
  const client = (result: unknown) =>
    ({ rpc: vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result))) }) as never;

  it('allows only an explicit allowed: true', async () => {
    expect(await checkCompanionQuota(client({ data: { allowed: true }, error: null }))).toEqual({ allowed: true });
  });

  it('asks for the add-on when the RPC reports none', async () => {
    const res = await checkCompanionQuota(
      client({ data: { allowed: false, is_trial: true, limit_type: 'addon_required' }, error: null })
    );
    expect(res).toMatchObject({ allowed: false, isTrial: true, limitType: 'addon_required' });
  });

  it('fails closed on errors, empty data and thrown exceptions', async () => {
    const closed = { allowed: false, isTrial: false, limitType: 'unavailable' };
    expect(await checkCompanionQuota(client({ data: null, error: { message: 'boom' } }))).toEqual(closed);
    expect(await checkCompanionQuota(client({ data: null, error: null }))).toEqual(closed);
    expect(await checkCompanionQuota(client(new Error('network')))).toEqual(closed);
    expect(await checkCompanionQuota(client({ data: {}, error: null }))).toMatchObject({ allowed: false });
  });
});
