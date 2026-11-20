import { describe, it, expect, beforeEach, vi } from 'vitest';

const rpc = vi.fn();
const getUser = vi.fn();
const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: {
      getUser: () => getUser(),
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
    },
  },
}));

import {
  confirmVerificationCode,
  isKnownUnverified,
  refreshEmailVerification,
  sendVerificationCode,
  useEmailVerificationStore,
} from '../src/lib/auth/emailVerification';

describe('email verification (verify later)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEmailVerificationStore.getState().setStatus('unknown');
    getUser.mockResolvedValue({ data: { user: { email: 'player@example.org' } } });
  });

  it('marks the account unverified when the database says so', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(refreshEmailVerification()).resolves.toBe('unverified');
    expect(rpc).toHaveBeenCalledWith('check_email_verification');
    expect(isKnownUnverified()).toBe(true);
  });

  it('fails open (unknown, nothing blocked) when the check errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    await expect(refreshEmailVerification()).resolves.toBe('unknown');
    expect(isKnownUnverified()).toBe(false);
  });

  it('sends the code to the address Supabase holds, without creating users', async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    await expect(sendVerificationCode()).resolves.toEqual({ email: 'player@example.org' });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'player@example.org',
      options: { shouldCreateUser: false },
    });
  });

  it('turns the Supabase rate-limit error into a readable message', async () => {
    signInWithOtp.mockResolvedValue({
      error: { message: 'For security purposes, you can only request this after 52 seconds.' },
    });
    const res = await sendVerificationCode();
    expect(res.error).toBe('Please wait a minute before asking for another code.');
  });

  it('rejects anything that is not 6 digits without calling Supabase', async () => {
    const res = await confirmVerificationCode('12ab');
    expect(res.error).toMatch(/6-digit/);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('verifies the code, then confirms with the database', async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: null });
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(confirmVerificationCode('123 456')).resolves.toEqual({});
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'player@example.org', token: '123456', type: 'email' });
    expect(useEmailVerificationStore.getState().status).toBe('verified');
  });

  it('reports a wrong or expired code', async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token has expired or is invalid' } });
    const res = await confirmVerificationCode('000000');
    expect(res.error).toMatch(/wrong or has expired/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
