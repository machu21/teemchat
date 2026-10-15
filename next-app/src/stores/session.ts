import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { UserSession, createGuestSession } from '@/lib/models/user';
import {
  AvatarConfig,
  Gender,
  normalizeAvatarConfig,
  defaultMaleAvatarConfig,
  defaultFemaleAvatarConfig,
} from '@/lib/models/avatar';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

interface SessionState {
  session: UserSession | null;
  isLoading: boolean;
  isGuest: boolean;
  initSession: () => Promise<void>;
  signInGuest: (displayName?: string, gender?: Gender) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithPassword: (
    email: string,
    password: string,
    username: string,
    displayName: string,
    gender?: Gender
  ) => Promise<{ error?: string }>;
  updateProfile: (
    displayName: string,
    status: string,
    avatarConfig: AvatarConfig,
    gender?: Gender
  ) => Promise<void>;
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
        const isPaid = profile?.is_paid ?? !isGuest;

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
                  guestSession = parsed;
                }
              }
            }
          } catch {}
        }

        if (guestSession && guestSession.isGuest) {
          set({ session: guestSession, isGuest: true, isLoading: false });
        } else {
          set({ session: null, isGuest: false, isLoading: false });
        }
      }

      // Listen for auth state changes
      supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, newSession: Session | null) => {
        if (!newSession?.user) {
          const cur = get().session;
          if (cur && !cur.isGuest) {
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
        const isPaid = profile?.is_paid ?? !isGuest;

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

  signInGuest: async (displayName?: string, gender: Gender = 'male') => {
    // Attempt provision via Supabase RPC
    try {
      const randomId = Math.floor(Math.random() * 9000) + 1000;
      const guestName = displayName && displayName.trim() ? displayName.trim() : `Guest #${randomId}`;
      const guestPw = `Guest_${Date.now()}_${randomId}!`;

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
      });

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
            username: (res as { username?: string }).username || `guest_${randomId}`,
            email,
            status: 'available',
            gender,
            avatarConfig,
            isGuest: true,
            tier: 'free',
            isPaid: false,
            hasAiCompanion: false,
          };
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem('teem_guest_session', JSON.stringify(guestSession));
            }
          } catch {}
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
    const localGuest = createGuestSession(displayName, gender);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('teem_guest_session', JSON.stringify(localGuest));
      }
    } catch {}
    set({ session: localGuest, isGuest: true });
  },

  signInWithPassword: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

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
      const isPaid = profile?.is_paid ?? true;

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
          isPaid,
          hasAiCompanion: profile?.has_ai_companion ?? isPaid,
        },
        isGuest: false,
      });
    }
    return {};
  },

  signUpWithPassword: async (email, password, username, displayName, gender: Gender = 'male') => {
    const defaultCfg = gender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig;
    const avatarConfig: AvatarConfig = {
      ...defaultCfg,
      gender,
    };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: displayName,
          gender,
        },
      },
    });

    if (error) return { error: error.message };

    if (data.user) {
      // Upsert profile
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          username,
          display_name: displayName,
          gender,
          status: 'available',
          tier: 'paid',
          is_paid: true,
          has_ai_companion: true,
          avatar_config: avatarConfig as unknown as Record<string, unknown>,
        });
      } catch (e) {
        console.warn('Profile upsert warning:', e);
      }

      set({
        session: {
          id: data.user.id,
          displayName,
          username,
          email,
          status: 'available',
          gender,
          avatarConfig,
          isGuest: false,
          tier: 'paid',
          isPaid: true,
          hasAiCompanion: true,
        },
        isGuest: false,
      });
    }
    return {};
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

  signOut: async () => {
    const current = get().session;
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('teem_guest_session');
      }
    } catch {}
    if (current?.isGuest) {
      try {
        await supabase.rpc('delete_guest_account');
      } catch {}
    }
    try {
      await supabase.auth.signOut();
    } catch {}
    set({ session: null, isGuest: false });
  },
}));
