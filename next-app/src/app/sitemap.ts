import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/constants/site';
import { supabase } from '@/lib/supabase';

export const revalidate = 3600; // Revalidate sitemap at most once per hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const currentDate = new Date();

  // Core static routes
  const routes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/space/main-hq`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];

  // Dynamically fetch public, active, permanent spaces
  try {
    const { data: spaces, error } = await supabase
      .from('spaces')
      .select('slug, join_code, visibility, is_temporary, created_at')
      .eq('visibility', 'public')
      .eq('is_temporary', false)
      .limit(50);

    if (!error && spaces && Array.isArray(spaces)) {
      for (const space of spaces) {
        const code = space.slug || space.join_code;
        if (code && code !== 'main-hq') {
          routes.push({
            url: `${siteUrl}/space/${encodeURIComponent(code)}`,
            lastModified: space.created_at ? new Date(space.created_at) : currentDate,
            changeFrequency: 'weekly',
            priority: 0.7,
          });
        }
      }
    }
  } catch (err) {
    // Graceful fallback to static routes if database is unreachable during sitemap build
    console.warn('Sitemap dynamic spaces query fallback:', err);
  }

  return routes;
}

