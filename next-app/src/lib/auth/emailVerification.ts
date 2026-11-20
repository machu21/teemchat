import { create } from 'zustand';
import { supabase } from '../supabase';

/**
 * "Verify later" email verification.
 *
 * Email/password accounts can use the app straight away; to prove they own the
 * address they enter a 6-digit code emailed by Supabase (signInWithOtp with
 * shouldCreateUser:false, Magic Link template must contain {{ .Token }}).
 * The database records it in public.email_verifications via
 * check_email_verification(), which trusts only the signed JWT `amr` claim.
 * Until then friend requests and DMs are refused by RLS, and the account is
 * deleted 7 days after sign-up.
 */
export type EmailVerificationStatus = 'unknown' | 'verified' | 'unverified';

export const EMAIL_VERIFY_REQUIRED_MESSAGE =
  'Verify your email to send friend requests and messages. Use the banner on your dashboard.';

/** Days an unverified account is kept (matches cleanup_unverified_accounts p_days). */
export const UNVERIFIED_ACCOUNT_DAYS = 7;

interface EmailVerificationState {
  status: EmailVerificationStatus;
  setStatus: (status: EmailVerificationStatus) => void;
}

export const useEmailVerificationStore = create<EmailVerificationState>((set) => ({
  status: 'unknown',
  setStatus: (status) => set({ status }),
}));

/** True only when we know the signed-in account is unverified. Unknown never blocks. */
export function isKnownUnverified(): boolean {
  return useEmailVerificationStore.getState().status === 'unverified';
}

/**
 * Asks the database for the signed-in user's status (and records verification
 * if this session came from an email code or magic link). Fails open: if the
 * check itself errors (e.g. migration not applied yet) nothing is blocked in
 * the UI; RLS stays the real gate.
 */
export async function refreshEmailVerification(): Promise<EmailVerificationStatus> {
  const { setStatus } = useEmailVerificationStore.getState();
  try {
    const { data, error } = await supabase.rpc('check_email_verification');
    const status: EmailVerificationStatus = error ? 'unknown' : data === true ? 'verified' : 'unverified';
    setStatus(status);
    return status;
  } catch {
    setStatus('unknown');
    return 'unknown';
  }
}

/** The address Supabase holds for the signed-in user (already normalized at sign-up). */
async function currentAuthEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

function friendlyAuthError(message: string): string {
  if (/security purposes|rate limit|too many/i.test(message)) {
    return 'Please wait a minute before asking for another code.';
  }
  if (/expired|invalid/i.test(message)) {
    return 'That code is wrong or has expired. Check it, or send a new one.';
  }
  return message;
}

export async function sendVerificationCode(): Promise<{ error?: string; email?: string }> {
  try {
    const email = await currentAuthEmail();
    if (!email) return { error: 'Sign in again to verify your email.' };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) return { error: friendlyAuthError(error.message) };
    return { email };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Could not send the code.' };
  }
}

export async function confirmVerificationCode(code: string): Promise<{ error?: string }> {
  const token = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) {
    return { error: 'Enter the 6-digit code from your email.' };
  }
  try {
    const email = await currentAuthEmail();
    if (!email) return { error: 'Sign in again to verify your email.' };
    // Signs the same user in again with an OTP-minted session, which the database accepts as proof.
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) return { error: friendlyAuthError(error.message) };
    const status = await refreshEmailVerification();
    if (status !== 'verified') {
      return { error: 'Your code was accepted, but verification did not save. Please try again.' };
    }
    return {};
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Could not verify the code.' };
  }
}
