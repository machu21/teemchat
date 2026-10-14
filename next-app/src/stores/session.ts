import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { UserSession, createGuestSession } from '@/lib/models/user';
import { AvatarConfig, normalizeAvatarConfig } from '@/lib/models/avatar';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

interface SessionState {
  session: UserSession | null;
  isLoading: boolean;
  isGuest: boolean;
  initSession: () => Promise<void>;
  signInGuest: (displayName?: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithPassword: (
    email: string,
    password: string,
    username: string,
    displayName: string
  ) => Promise<{ error?: string }>;
  updateProfile: (displayName: string, status: string, avatarConfig: AvatarConfig) => Promise<void>;
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

        const isPaid = profile?.is_paid ?? !isGuest;

        set({
          session: {
            id: session.user.id,
            displayName: profile?.display_name || meta.display_name || 'Explorer',
            username: profile?.username || meta.username || `user_${session.user.id.slice(0, 5)}`,
            email: session.user.email || '',
            status: profile?.status || 'available',
            avatarConfig: normalizeAvatarConfig(profile?.avatar_config),
            isGuest,
            tier: profile?.tier || (isPaid ? 'paid' : 'free'),
            isPaid,
            hasAiCompanion: profile?.has_ai_companion ?? isPaid,
          },
          isGuest,
          isLoading: false,
        });
      } else {
        set({ session: null, isGuest: false, isLoading: false });
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

        const isPaid = profile?.is_paid ?? !isGuest;

        set({
          session: {
            id: newSession.user.id,
            displayName: profile?.display_name || meta.display_name || 'Explorer',
            username: profile?.username || meta.username || `user_${newSession.user.id.slice(0, 5)}`,
            email: newSession.user.email || '',
            status: profile?.status || 'available',
            avatarConfig: normalizeAvatarConfig(profile?.avatar_config),
            isGuest,
            tier: profile?.tier || (isPaid ? 'paid' : 'free'),
            isPaid,
            hasAiCompanion: profile?.has_ai_companion ?? isPaid,
          },
          isGuest,
          isLoading: false,
        });
      });
    } catch (err) {
      console.error('Failed to init session:', err);
      set({ session: null, isGuest: false, isLoading: false });
    }
  },

  signInGuest: async (displayName?: string) => {
    // Attempt provision via Supabase RPC
    try {
      const randomId = Math.floor(Math.random() * 9000) + 1000;
      const guestName = displayName && displayName.trim() ? displayName.trim() : `Guest #${randomId}`;
      const guestPw = `Guest_${Date.now()}_${randomId}!`;

      const guestColors = ['#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#8B5CF6', '#EC4899', '#3B82F6'];
      const avatarConfig: AvatarConfig = {
        skinColor: '#FCD5B5',
        shirtColor: guestColors[randomId % guestColors.length],
        hairColor: '#37271E',
        hairStyle: 'short',
        accessory: 'none',
      };

      const { data: res, error: rpcErr } = await supabase.rpc('provision_guest_account', {
        p_display_name: guestName,
        p_password: guestPw,
        p_avatar_config: avatarConfig,
      });

      if (!rpcErr && res && typeof res === 'object') {
        const email = (res as { email: string }).email;
        const { data: authRes, error: authErr } = await supabase.auth.signInWithPassword({
          email,
          password: guestPw,
        });

        if (!authErr && authRes.user) {
          set({
            session: {
              id: authRes.user.id,
              displayName: guestName,
              username: (res as { username?: string }).username || `guest_${randomId}`,
              email,
              status: 'available',
              avatarConfig,
              isGuest: true,
              tier: 'free',
              isPaid: false,
              hasAiCompanion: false,
            },
            isGuest: true,
          });
          return;
        }
      }
    } catch (e) {
      console.warn('RPC guest provisioning error, falling back to local guest session:', e);
    }

    // Fallback to local guest session
    const localGuest = createGuestSession(displayName);
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
      const isPaid = profile?.is_paid ?? true;

      set({
        session: {
          id: data.user.id,
          displayName: profile?.display_name || meta.display_name || email.split('@')[0],
          username: profile?.username || meta.username || email.split('@')[0],
          status: profile?.status || 'available',
          email,
          avatarConfig: normalizeAvatarConfig(profile?.avatar_config),
          isGuest: false,
          tier: profile?.tier || (isPaid ? 'paid' : 'free'),
          isPaid,
          hasAiCompanion: profile?.has_ai_companion ?? isPaid,
        },
        isGuest: false,
      });
    }
    return {};
  },

  signUpWithPassword: async (email, password, username, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: displayName,
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
          status: 'available',
          tier: 'paid',
          is_paid: true,
          has_ai_companion: true,
          avatar_config: normalizeAvatarConfig({}),
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
          avatarConfig: normalizeAvatarConfig({}),
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

  updateProfile: async (displayName, status, avatarConfig) => {
    const current = get().session;
    if (!current) return;

    set({
      session: {
        ...current,
        displayName,
        status,
        avatarConfig,
      },
    });

    if (!current.isGuest) {
      try {
        await supabase.from('profiles').upsert({
          id: current.id,
          display_name: displayName,
          status,
          avatar_config: avatarConfig,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to sync profile update:', err);
      }
    }
  },

  signOut: async () => {
    const current = get().session;
    if (current?.isGuest) {
      try {
        await supabase.rpc('delete_guest_account');
      } catch (_) {}
    }
    try {
      await supabase.auth.signOut();
    } catch (_) {}
    set({ session: null, isGuest: false });
  },
}));
