import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { UserSession, createGuestSession } from '@/lib/models/user';
import type { PlanId } from '@/lib/membership';
import { getOrFetchGuestIdentity } from '@/lib/security/guestIdentity';
import { normalizeEmail } from '@/lib/security/disposableEmails';
import { SpaceService } from '@/lib/services/spaces';
import { DashboardPresenceService } from '@/lib/services/dashboardPresence';
import { E2EEManager } from '@/lib/services/e2eeManager';
import { PlayerStatus } from '@/lib/world/emotes';
import {
  AvatarConfig,
  Gender,
  normalizeAvatarConfig,
  defaultMaleAvatarConfig,
  defaultFemaleAvatarConfig,
} from '@/lib/models/avatar';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function resolveProfilePlan(rawPlan: unknown, isGuest: boolean, isPaid: boolean): PlanId {
  if (isGuest) return 'free';
  if (rawPlan === 'free' || rawPlan === 'plus' || rawPlan === 'host' || rawPlan === 'team') {
    return rawPlan;
  }
  return isPaid ? 'plus' : 'free';
}

interface SessionState {
  session: UserSession | null;
  isLoading: boolean;
  isGuest: boolean;
  initSession: () => Promise<void>;
  signInGuest: (displayName?: string, gender?: Gender, preferredUsername?: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string; code?: string }>;
  /** Checks the 6-digit code Supabase emailed at sign-up and signs the user in. */
  verifyEmailCode: (email: string, code: string, password?: string) => Promise<{ error?: string }>;
  /** Emails a fresh sign-up code. */
  resendEmailCode: (email: string) => Promise<{ error?: string }>;
  signUpWithPassword: (
    email: string,
    password: string,
    username: string,
    displayName: string,
    gender?: Gender,
    antiBot?: {
      website_url?: string;
      phone_alt?: string;
      renderedAt?: number;
    },
    birthDate?: string
  ) => Promise<{ error?: string; code?: string }>;
  updateProfile: (
    displayName: string,
    status: string,
    avatarConfig: AvatarConfig,
    gender?: Gender
  ) => Promise<void>;
  /**
   * Sets my chat status (Available / Do not disturb / Focus / Away): updates the local
   * session, re-tracks dashboard presence so friends see it live, and saves it to the profile.
   */
  setStatus: (status: PlayerStatus) => void;
  signOut: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  isLoading: true,
  isGuest: false,

  initSession: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        const meta = session.user.user_metadata || {};
        const isGuest =
          Boolean(meta.is_guest) ||
          Boolean(session.user.app_metadata?.is_guest) ||
          Boolean(session.user.email?.endsWith('@guest.teemchat.local'));

        const profileRecord = profile as Record<string, unknown> | null;
        const rawGender = String(profileRecord?.gender || meta.gender || (profileRecord?.avatar_config as Record<string, unknown> | undefined)?.gender || 'male').toLowerCase();
        const gender: Gender = rawGender === 'female' ? 'female' : 'male';
        const isPaid = profile?.is_paid ?? false;
        const plan = resolveProfilePlan(profileRecord?.plan, isGuest, isPaid);

        const userSession: UserSession = {
          id: session.user.id,
          displayName: profile?.display_name || meta.display_name || 'Explorer',
          username: profile?.username || meta.username || `user_${session.user.id.slice(0, 5)}`,
          email: session.user.email || '',
          status: profile?.status || 'available',
          gender,
          avatarConfig: normalizeAvatarConfig(profile?.avatar_config, gender),
          isGuest,
          tier: ((profile?.tier as 'paid' | 'free') || (isPaid ? 'paid' : 'free')) as 'paid' | 'free',
          plan,
          isPaid,
          hasAiCompanion: profile?.has_ai_companion ?? isPaid,
        };

        if (isGuest) {
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem('teem_guest_session', JSON.stringify(userSession));
            }
          } catch {}
        } else {
          try {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('teem_guest_session');
            }
          } catch {}
        }

        E2EEManager.initUser(userSession.id).catch(() => {});
        set({
          session: userSession,
          isGuest,
          isLoading: false,
        });
      } else {
        // Check if an existing guest session is active or stored
        let guestSession = get().session;
        if (!guestSession || !guestSession.isGuest) {
          try {
            if (typeof window !== 'undefined') {
              const saved = localStorage.getItem('teem_guest_session');
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed?.id && parsed?.isGuest) {
                  if (UUID_REGEX.test(parsed.id)) {
                    // An auth-backed guest with no auth session has expired or been cleaned up.
                    localStorage.removeItem('teem_guest_session');
                  } else {
                    guestSession = parsed;
                  }
                }
              }
            }
          } catch {}
        }

        if (guestSession && guestSession.isGuest) {
          E2EEManager.initUser(guestSession.id).catch(() => {});
          set({ session: guestSession, isGuest: true, isLoading: false });
        } else {
          set({ session: null, isGuest: false, isLoading: false });
        }
      }

      // Listen for auth state changes
      supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, newSession: Session | null) => {
        if (!newSession?.user) {
          const cur = get().session;
          // Provisioned guests have a real auth account; a sign-out (also relayed from other tabs)
          // must end their session here too, or this tab keeps broadcasting a ghost avatar.
          // Purely local guests (non-UUID ids) never had an auth session, so they are kept.
          const isAuthBackedGuest = Boolean(cur?.isGuest && UUID_REGEX.test(cur.id));
          if (cur && (!cur.isGuest || (event === 'SIGNED_OUT' && isAuthBackedGuest))) {
            E2EEManager.resetSession();
            set({ session: null, isGuest: false });
          }
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', newSession.user.id)
          .maybeSingle();

        const meta = newSession.user.user_metadata || {};
        const isGuest =
          Boolean(meta.is_guest) ||
          Boolean(newSession.user.app_metadata?.is_guest) ||
          Boolean(newSession.user.email?.endsWith('@guest.teemchat.local'));

        const profileRecord = profile as Record<string, unknown> | null;
        const rawGender = String(profileRecord?.gender || meta.gender || (profileRecord?.avatar_config as Record<string, unknown> | undefined)?.gender || 'male').toLowerCase();
        const gender: Gender = rawGender === 'female' ? 'female' : 'male';
        const isPaid = profile?.is_paid ?? false;
        const plan = resolveProfilePlan(profileRecord?.plan, isGuest, isPaid);

        E2EEManager.initUser(newSession.user.id).catch(() => {});
        set({
          session: {
            id: newSession.user.id,
            displayName: profile?.display_name || meta.display_name || 'Explorer',
            username: profile?.username || meta.username || `user_${newSession.user.id.slice(0, 5)}`,
            email: newSession.user.email || '',
            status: profile?.status || 'available',
            gender,
            avatarConfig: normalizeAvatarConfig(profile?.avatar_config, gender),
            isGuest,
            tier: ((profile?.tier as 'paid' | 'free') || (isPaid ? 'paid' : 'free')) as 'paid' | 'free',
            plan,
            isPaid,
            hasAiCompanion: profile?.has_ai_companion ?? isPaid,
          },
          isGuest,
          isLoading: false,
        });
      });
    } catch {
      set({ session: null, isGuest: false, isLoading: false });
    }
  },

  signInGuest: async (displayName?: string, gender: Gender = 'male', preferredUsername?: string) => {
    // Prevent repeated guest provisioning in the same browser/device
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('teem_guest_session');
        if (stored) {
          const parsed = JSON.parse(stored) as UserSession;
          if (parsed && parsed.isGuest && parsed.id) {
            // Only reuse an auth-backed guest while its auth session is still live.
            const isAuthBacked = UUID_REGEX.test(parsed.id);
            const liveUserId = isAuthBacked
              ? (await supabase.auth.getSession()).data.session?.user.id
              : undefined;
            if (!isAuthBacked || liveUserId === parsed.id) {
              E2EEManager.initUser(parsed.id).catch(() => {});
              set({ session: parsed, isGuest: true });
              return;
            }
            localStorage.removeItem('teem_guest_session');
          }
        }
      }
    } catch {}

    // Resolve deterministic IP-derived identity
    let guestIdentity = null;
    try {
      guestIdentity = await getOrFetchGuestIdentity();
    } catch {}

    const randomId = Math.floor(Math.random() * 9000) + 1000;
    const targetUsername = (preferredUsername && preferredUsername.trim())
      ? preferredUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
      : (guestIdentity?.username || `guest_${randomId}`);

    const guestName = displayName && displayName.trim()
      ? displayName.trim()
      : (guestIdentity?.displayName || `Guest #${randomId}`);
    // Guest usernames are public, so the password must not be guessable from the creation time.
    const pwBytes = new Uint8Array(24);
    crypto.getRandomValues(pwBytes);
    const guestPw = `G_${Array.from(pwBytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;

    // Attempt provision via Supabase RPC
    try {
      const maleColors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4'];
      const femaleColors = ['#EC4899', '#8B5CF6', '#F43F5E', '#10B981', '#06B6D4', '#F59E0B'];
      const colors = gender === 'female' ? femaleColors : maleColors;
      const baseConfig = gender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig;

      const avatarConfig: AvatarConfig = {
        ...baseConfig,
        gender,
        shirtColor: colors[randomId % colors.length],
      };

      const { data: res, error: rpcErr } = await supabase.rpc('provision_guest_account', {
        p_display_name: guestName,
        p_password: guestPw,
        p_avatar_config: avatarConfig as unknown as Record<string, unknown>,
        p_gender: gender,
        p_username: targetUsername,
        p_country_code: guestIdentity?.country || null,
      });

      if (rpcErr) {
        if (rpcErr.code === 'P0429' || rpcErr.message?.includes('Too many guest sessions')) {
          console.warn('Guest creation rate limited by database throttle:', rpcErr.message);
        }
        // Without a DB account the guest can't persist friends or chat; make the cause visible
        console.error('Guest provisioning failed, using a local-only guest:', rpcErr.message);
      }

      if (!rpcErr && res && typeof res === 'object') {
        const email = (res as { email: string }).email;
        const { data: authRes, error: authErr } = await supabase.auth.signInWithPassword({
          email,
          password: guestPw,
        });

        if (!authErr && authRes.user) {
          const guestSession: UserSession = {
            id: authRes.user.id,
            displayName: guestName,
            username: (res as { username?: string }).username || targetUsername,
            email,
            status: 'available',
            gender,
            avatarConfig,
            isGuest: true,
            tier: 'free',
            plan: 'free',
            isPaid: false,
            hasAiCompanion: false,
            countryCode: (res as { country_code?: string })?.country_code || guestIdentity?.country || 'XX',
          };
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem('teem_guest_session', JSON.stringify(guestSession));
            }
          } catch {}
          E2EEManager.initUser(guestSession.id).catch(() => {});
          set({
            session: guestSession,
            isGuest: true,
          });
          return;
        }
      }
    } catch (e) {
      console.warn('RPC guest provisioning error, falling back to local guest session:', e);
    }

    // Fallback to local guest session
    const localGuest = createGuestSession(
      displayName,
      gender,
      targetUsername,
      guestIdentity?.country || 'XX'
    );
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('teem_guest_session', JSON.stringify(localGuest));
      }
    } catch {}
    E2EEManager.initUser(localGuest.id).catch(() => {});
    set({ session: localGuest, isGuest: true });
  },

  signInWithPassword: async (email, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok || !result.success) {
        return {
          error: result.error || result.message || 'Login failed',
          code: typeof result.code === 'string' ? result.code : undefined,
        };
      }

      // Synchronize client-side Supabase session if returned
      if (result.session) {
        await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
      }

      const user = result.user;
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        const meta = user.user_metadata || {};
        const profileRecord = profile as Record<string, unknown> | null;
        const rawGender = String(profileRecord?.gender || meta.gender || (profileRecord?.avatar_config as Record<string, unknown> | undefined)?.gender || 'male').toLowerCase();
        const gender: Gender = rawGender === 'female' ? 'female' : 'male';
        const isPaid = profile?.is_paid ?? false;
        const plan = resolveProfilePlan(profileRecord?.plan, false, isPaid);

        E2EEManager.syncPasswordBackup(user.id, password).catch(() => {});
        set({
          session: {
            id: user.id,
            displayName: profile?.display_name || meta.display_name || email.split('@')[0],
            username: profile?.username || meta.username || email.split('@')[0],
            status: profile?.status || 'available',
            email,
            gender,
            avatarConfig: normalizeAvatarConfig(profile?.avatar_config, gender),
            isGuest: false,
            tier: ((profile?.tier as 'paid' | 'free') || (isPaid ? 'paid' : 'free')) as 'paid' | 'free',
            plan,
            isPaid,
            hasAiCompanion: profile?.has_ai_companion ?? isPaid,
          },
          isGuest: false,
        });
      }
      return {};
    } catch (e) {
      console.warn('API login route error, attempting direct client fallback:', e);
      // Fallback: direct Supabase client call if network or API route is unavailable
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return error.code === 'email_not_confirmed'
          ? { error: 'Please verify your email to finish creating your account.', code: 'email_unconfirmed' }
          : { error: error.message };
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();

        const meta = data.user.user_metadata || {};
        const profileRecord = profile as Record<string, unknown> | null;
        const rawGender = String(profileRecord?.gender || meta.gender || (profileRecord?.avatar_config as Record<string, unknown> | undefined)?.gender || 'male').toLowerCase();
        const gender: Gender = rawGender === 'female' ? 'female' : 'male';
        const isPaid = profile?.is_paid ?? false;
        const plan = resolveProfilePlan(profileRecord?.plan, false, isPaid);

        E2EEManager.syncPasswordBackup(data.user.id, password).catch(() => {});
        set({
          session: {
            id: data.user.id,
            displayName: profile?.display_name || meta.display_name || email.split('@')[0],
            username: profile?.username || meta.username || email.split('@')[0],
            status: profile?.status || 'available',
            email,
            gender,
            avatarConfig: normalizeAvatarConfig(profile?.avatar_config, gender),
            isGuest: false,
            tier: ((profile?.tier as 'paid' | 'free') || (isPaid ? 'paid' : 'free')) as 'paid' | 'free',
            plan,
            isPaid,
            hasAiCompanion: profile?.has_ai_companion ?? isPaid,
          },
          isGuest: false,
        });
      }
      return {};
    }
  },

  signUpWithPassword: async (
    email,
    password,
    username,
    displayName,
    gender: Gender = 'male',
    antiBot?: {
      website_url?: string;
      phone_alt?: string;
      renderedAt?: number;
    },
    birthDate?: string
  ) => {
    const defaultCfg = gender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig;
    const avatarConfig: AvatarConfig = {
      ...defaultCfg,
      gender,
    };

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          username,
          displayName,
          gender,
          website_url: antiBot?.website_url,
          phone_alt: antiBot?.phone_alt,
          renderedAt: antiBot?.renderedAt,
          birthDate,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        return {
          error: result.error || result.message || 'Registration failed',
          code: typeof result.code === 'string' ? result.code : undefined,
        };
      }

      // No session yet: Supabase emailed a 6-digit code that must be verified first.
      if (!result.session) {
        return { code: 'verify_email' };
      }

      // Only treat the user as signed in once Supabase holds a real session for them.
      let authedUserId: string | undefined;
      const { data: setRes, error: setErr } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (!setErr) authedUserId = setRes.user?.id;

      if (!authedUserId || authedUserId !== result.user?.id) {
        return { error: 'Your account could not be signed in. Please try logging in.' };
      }

      // Upsert avatar config if necessary
      if (result.user?.id) {
        try {
          await supabase.from('profiles').upsert({
            id: result.user.id,
            username: username.trim(),
            display_name: displayName || username,
            gender,
            status: 'available',
            tier: 'free',
            is_paid: false,
            has_ai_companion: false,
            avatar_config: avatarConfig as unknown as Record<string, unknown>,
          });
        } catch (e) {
          console.warn('Profile avatar update warning:', e);
        }

        E2EEManager.syncPasswordBackup(result.user.id, password).catch(() => {});
        set({
          session: {
            id: result.user.id,
            displayName: displayName || username,
            username,
            email,
            status: 'available',
            gender,
            avatarConfig,
            isGuest: false,
            tier: 'free',
            plan: 'free',
            isPaid: false,
            hasAiCompanion: false,
          },
          isGuest: false,
        });
      }

      return {};
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Registration network error';
      return { error: message };
    }
  },

  verifyEmailCode: async (email, code, password) => {
    const token = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(token)) {
      return { error: 'Enter the 6-digit code from your email.' };
    }
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizeEmail(email),
        token,
        type: 'signup',
      });
      if (error || !data.session) {
        return {
          error: /expired|invalid/i.test(error?.message || '')
            ? 'That code is wrong or has expired. Check it, or send a new one.'
            : error?.message || 'Could not verify the code. Please try again.',
        };
      }
      // The profile row (username, gender) was already created by the auth trigger.
      if (password && data.user) {
        E2EEManager.syncPasswordBackup(data.user.id, password).catch(() => {});
      }
      await get().initSession();
      return {};
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Verification network error' };
    }
  },

  resendEmailCode: async (email) => {
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: normalizeEmail(email) });
      if (error) {
        return {
          error: /security purposes|rate limit/i.test(error.message)
            ? 'Please wait a minute before asking for another code.'
            : error.message,
        };
      }
      return {};
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Could not send a new code.' };
    }
  },

  updateProfile: async (displayName, status, avatarConfig, genderParam?: Gender) => {
    const current = get().session;
    if (!current) return;

    const gender: Gender = genderParam || avatarConfig.gender || current.gender || 'male';
    const updatedAvatarConfig: AvatarConfig = {
      ...avatarConfig,
      gender,
    };

    set({
      session: {
        ...current,
        displayName,
        status,
        gender,
        avatarConfig: updatedAvatarConfig,
      },
    });

    if (!current.isGuest) {
      try {
        await supabase.from('profiles').upsert({
          id: current.id,
          display_name: displayName,
          status,
          gender,
          avatar_config: updatedAvatarConfig as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to sync profile update:', err);
      }
    } else {
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(
            'teem_guest_session',
            JSON.stringify({
              ...current,
              displayName,
              status,
              gender,
              avatarConfig: updatedAvatarConfig,
            })
          );
        }
      } catch {}
    }
  },

  setStatus: (status) => {
    // Presence first: friends see the change even if the profile write fails or the
    // session is a local-only guest.
    DashboardPresenceService.updatePresence({ status });
    const current = get().session;
    if (!current || current.status === status) return;
    set({ session: { ...current, status } });
    if (UUID_REGEX.test(current.id)) {
      supabase
        .from('profiles')
        .update({ status })
        .eq('id', current.id)
        .then(({ error }) => {
          if (error) console.warn('Failed to save status:', error.message);
        });
    }
    if (current.isGuest && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('teem_guest_session');
        if (raw) localStorage.setItem('teem_guest_session', JSON.stringify({ ...JSON.parse(raw), status }));
      } catch {}
    }
  },

  signOut: async () => {
    const current = get().session;
    // Leave dashboard presence first, while the socket and JWT are still valid,
    // so friends see this user go offline immediately.
    await DashboardPresenceService.leave();
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('teem_guest_session');
      }
    } catch {}
    if (current?.isGuest) {
      SpaceService.clearGuestMaps();
      // Must run before auth.signOut(): the RPC deletes the caller identified by the JWT.
      if (UUID_REGEX.test(current.id)) {
        try {
          const { error } = await supabase.rpc('delete_guest_account');
          if (error) console.error('Failed to delete guest account on sign-out:', error.message);
        } catch (err) {
          console.error('Failed to delete guest account on sign-out:', err);
        }
      }
    }
    try {
      await supabase.auth.signOut();
    } catch {}
    E2EEManager.resetSession();
    set({ session: null, isGuest: false });
  },
}));
