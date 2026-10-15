import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY, using placeholder');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Safely unsubscribes and removes a Supabase Realtime channel from the client
 * to prevent duplicate callbacks or "cannot add callbacks after subscribe()" errors.
 */
export function removeRealtimeChannel(channel: RealtimeChannel | null | undefined): void {
  if (!channel) return;
  try {
    channel.unsubscribe().catch(() => {});
    channel.teardown();
    const realtimeClient = supabase.realtime as unknown as { _remove?: (ch: RealtimeChannel) => void };
    realtimeClient._remove?.(channel);
    supabase.removeChannel(channel).catch(() => {});
  } catch {
    // Ignore teardown errors during unmount
  }
}

/**
 * Checks for any existing channel registered under the topic and tears it down cleanly.
 */
export function cleanupExistingChannel(topic: string): void {
  try {
    const existing = supabase.getChannels().find(
      (c) => c.topic === `realtime:${topic}` || c.topic === topic
    );
    if (existing) {
      removeRealtimeChannel(existing);
    }
  } catch {
    // Ignore cleanup errors
  }
}

