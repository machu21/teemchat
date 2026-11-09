import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  const insertSingle = vi.fn();
  const spaceMaybe = vi.fn();
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'spaces') {
        return { select: () => ({ eq: () => ({ maybeSingle: spaceMaybe }) }) };
      }
      return { insert: vi.fn(() => ({ select: () => ({ single: insertSingle }) })) };
    }),
  };
  return {
    supabase,
    insertSingle,
    spaceMaybe,
    authenticate: vi.fn(),
    quota: vi.fn(),
    generate: vi.fn(),
  };
});

vi.mock('@/lib/companionAuth', () => ({
  authenticateCompanionRequest: mocks.authenticate,
  checkCompanionQuota: mocks.quota,
  formatWindowReset: () => 'soon',
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generate };
  },
}));

vi.mock('@/lib/rateLimit', () => import('../../src/lib/rateLimit'));
vi.mock('@/lib/meetings/notesPrompt', () => import('../../src/lib/meetings/notesPrompt'));
vi.mock('@/lib/safety/profanity', () => import('../../src/lib/safety/profanity'));

import { POST } from '../../src/app/api/meetings/notes/route';

const SPACE = '33333333-3333-4333-8333-333333333333';
const USER = { id: '11111111-1111-4111-8111-111111111111' };

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/meetings/notes', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const validBody = {
  spaceId: SPACE,
  roomId: 'office-boardroom',
  title: 'Sprint review',
  attendees: ['Kim', 'Lee'],
  chat: [{ name: 'Kim', text: 'Ship it Friday', at: '2026-11-12T10:00:00Z' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({ ok: true, user: USER, supabase: mocks.supabase });
  mocks.quota.mockResolvedValue({ allowed: true });
  mocks.spaceMaybe.mockResolvedValue({ data: { id: SPACE }, error: null });
  mocks.generate.mockResolvedValue({
    text: JSON.stringify({ summary: 'Agreed to ship.', decisions: ['Ship Friday'], actionItems: [{ text: 'Release notes', owner: 'Kim' }] }),
  });
  mocks.insertSingle.mockResolvedValue({ data: { id: 'n1', summary: 'Agreed to ship.' }, error: null });
});

describe('POST /api/meetings/notes', () => {
  it('passes through auth failures', async () => {
    mocks.authenticate.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('rejects oversized and invalid payloads before calling the AI', async () => {
    const big = { ...validBody, agenda: 'x'.repeat(130_000) };
    expect((await POST(req(big))).status).toBe(413);
    expect((await POST(req('{nope'))).status).toBe(400);
    expect((await POST(req({ ...validBody, spaceId: 'bad' }))).status).toBe(400);
    expect((await POST(req({ ...validBody, chat: [] }))).status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('refuses spaces the caller cannot see', async () => {
    mocks.spaceMaybe.mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(req(validBody))).status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('returns 402 when the AI quota is used up', async () => {
    mocks.quota.mockResolvedValueOnce({ allowed: false, isTrial: true, limitType: 'trial' });
    const res = await POST(req(validBody));
    expect(res.status).toBe(402);
    expect((await res.json()).upgradeRequired).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('summarizes, filters and saves the notes under the caller', async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect((await res.json()).note.id).toBe('n1');
    const prompt = mocks.generate.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).toContain('Kim: Ship it Friday');
    const insertCall = mocks.supabase.from.mock.results.find((r) => 'insert' in (r.value as object));
    const inserted = (insertCall!.value as { insert: ReturnType<typeof vi.fn> }).insert.mock.calls[0][0];
    expect(inserted).toMatchObject({
      space_id: SPACE,
      room_id: 'office-boardroom',
      created_by: USER.id,
      decisions: ['Ship Friday'],
      action_items: [{ text: 'Release notes', owner: 'Kim' }],
    });
  });

  it('returns 502 when the model output is unusable', async () => {
    mocks.generate.mockResolvedValueOnce({ text: 'sorry' });
    expect((await POST(req(validBody))).status).toBe(502);
    expect(mocks.insertSingle).not.toHaveBeenCalled();
  });
});
