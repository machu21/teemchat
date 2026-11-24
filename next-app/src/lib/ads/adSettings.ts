import { supabase } from '@/lib/supabase';

let cached: Promise<boolean> | null = null;

/**
 * Reads public.billing_settings.ads_enabled once per page load.
 * Fails closed: any error (missing column, network, RLS) means no ads.
 */
export function fetchAdsEnabled(): Promise<boolean> {
  if (!cached) {
    cached = (async () => {
      try {
        const { data, error } = await supabase
          .from('billing_settings')
          .select('ads_enabled')
          .eq('id', true)
          .maybeSingle();
        if (error || !data) return false;
        return (data as { ads_enabled?: unknown }).ads_enabled === true;
      } catch {
        return false;
      }
    })();
  }
  return cached;
}

/** Test hook: forget the cached value. */
export function resetAdsEnabledCache(): void {
  cached = null;
}

/** Web publisher id (ca-pub-…). Ads stay off on the web until it is set. */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim() || '';

/** AdSense slot ids per placement (data-ad-slot). */
export const ADSENSE_SLOTS = {
  dashboard: process.env.NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD?.trim() || '',
  spaceExit: process.env.NEXT_PUBLIC_ADSENSE_SLOT_SPACE_EXIT?.trim() || '',
} as const;

export type AdPlacement = keyof typeof ADSENSE_SLOTS;
