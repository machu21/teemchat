import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
  };
  return {
    chain,
    rpc: vi.fn(),
    from: vi.fn(() => chain),
  };
});

vi.mock('../src/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

import { SafetyService } from '../src/lib/services/safety';
import { useSafetyStore, isHiddenUser } from '../src/stores/safety';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SPACE = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chain.select.mockReturnValue(mocks.chain);
  mocks.chain.delete.mockReturnValue(mocks.chain);
  mocks.chain.eq.mockReturnValue(mocks.chain);
  mocks.chain.insert.mockResolvedValue({ error: null });
  useSafetyStore.getState().reset();
});

describe('SafetyService', () => {
  it('claims the signup birth date when none is stored yet', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { age_band: 'unknown', has_birth_date: false }, error: null })
      .mockResolvedValueOnce({
        data: { age_band: 'child', has_birth_date: true, chat_filter: true, dm_privacy: 'friends' },
        error: null,
      });
    const safety = await SafetyService.getMySafety(ME);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'get_my_safety');
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'set_my_birth_date', { p_date: null });
    expect(safety).toEqual({
      ageBand: 'child',
      hasBirthDate: true,
      prefs: { chatFilter: true, dmPrivacy: 'friends' },
    });
  });

  it('maps a write-once violation to a friendly message', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Birth date already set' } });
    const res = await SafetyService.setBirthDate(ME, '2001-01-01');
    expect(res.error).toMatch(/already saved/);
  });

  it('blocks via user_blocks and treats a duplicate as success', async () => {
    mocks.chain.insert.mockResolvedValueOnce({ error: { code: '23505' } });
    expect(await SafetyService.block(ME, OTHER)).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith('user_blocks');
    expect(mocks.chain.insert).toHaveBeenCalledWith({ blocker_id: ME, blocked_user_id: OTHER });
    expect(await SafetyService.block(ME, ME)).toBe(false);
  });

  it('files reports with trimmed details and space context', async () => {
    const res = await SafetyService.report({
      reporterId: ME,
      reportedUserId: OTHER,
      reason: 'harassment',
      details: `  ${'x'.repeat(600)}  `,
      spaceId: SPACE,
      roomId: 'general',
    });
    expect(res.ok).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith('user_reports');
    const row = mocks.chain.insert.mock.calls[0][0];
    expect(row).toMatchObject({ reporter_id: ME, reported_user_id: OTHER, reason: 'harassment', space_id: SPACE });
    expect(row.details).toHaveLength(500);
  });

  it('refuses reports involving local-only guests', async () => {
    const res = await SafetyService.report({ reporterId: 'guest-local', reportedUserId: OTHER, reason: 'spam' });
    expect(res.ok).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('calls the moderation RPC with a 10 minute kick and parses restrictions', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect(
      (await SafetyService.moderate({ spaceId: SPACE, targetUserId: OTHER, action: 'kick', minutes: 10 })).ok
    ).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('moderate_space_member', {
      p_space: SPACE,
      p_user: OTHER,
      p_action: 'kick',
      p_minutes: 10,
      p_reason: null,
    });

    mocks.rpc.mockResolvedValueOnce({ data: { banned: false, voice_muted: true, chat_muted: false }, error: null });
    expect(await SafetyService.myRestrictions(SPACE)).toEqual({ banned: false, voiceMuted: true, chatMuted: false });
  });

  it('explains owner protection errors from the moderation RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Cannot moderate the space owner' } });
    const res = await SafetyService.moderate({ spaceId: SPACE, targetUserId: OTHER, action: 'ban' });
    expect(res.error).toMatch(/owner/);
  });
});

describe('safety store', () => {
  it('hides blocked and session-muted users', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { age_band: 'adult', has_birth_date: true, chat_filter: false, dm_privacy: 'everyone' },
      error: null,
    });
    mocks.chain.eq.mockResolvedValueOnce({ data: [{ blocked_user_id: OTHER }], error: null });
    await useSafetyStore.getState().load(ME);

    expect(useSafetyStore.getState().restrictions.filterOn).toBe(false);
    expect(isHiddenUser(OTHER)).toBe(true);

    const third = '44444444-4444-4444-8444-444444444444';
    expect(isHiddenUser(third)).toBe(false);
    useSafetyStore.getState().toggleMute(third);
    expect(isHiddenUser(third)).toBe(true);
    useSafetyStore.getState().toggleMute(third);
    expect(isHiddenUser(third)).toBe(false);
  });
});
