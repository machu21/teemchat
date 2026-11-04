import type { Metadata } from 'next';
import React from 'react';
import { supabase } from '@/lib/supabase';
import { SITE_NAME, getSiteUrl } from '@/lib/constants/site';

interface SpaceLayoutProps {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const siteUrl = getSiteUrl();
  const decodedCode = decodeURIComponent(code || '');

  let spaceName = decodedCode === 'main-hq' ? 'TeemChat HQ' : `Space ${decodedCode}`;
  let spaceDescription =
    'Step into a collaborative 16-bit virtual space with spatial proximity voice chat and customizable retro pixel avatars.';
  let isPublic = decodedCode === 'main-hq';
  let mapTheme = 'village';

  try {
    const { data: space, error } = await supabase
      .from('spaces')
      .select('name, description, visibility, map_theme')
      .or(`slug.eq.${decodedCode},join_code.eq.${decodedCode}`)
      .maybeSingle();

    if (!error && space) {
      if (space.name) spaceName = space.name;
      if (space.description) spaceDescription = space.description;
      isPublic = space.visibility === 'public';
      if (space.map_theme) mapTheme = space.map_theme;
    }
  } catch (err) {
    console.warn('Space generateMetadata lookup notice:', err);
  }

  const title = `Join ${spaceName} | ${SITE_NAME}`;
  const canonicalUrl = `${siteUrl}/space/${encodeURIComponent(decodedCode)}`;
  const ogImageUrl = `${canonicalUrl}/opengraph-image`;

  return {
    title,
    description: spaceDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: isPublic,
      follow: isPublic,
    },
    openGraph: {
      title,
      description: spaceDescription,
      url: canonicalUrl,
      siteName: SITE_NAME,
      type: 'website',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${spaceName} - TeemChat Virtual Space`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: spaceDescription,
      images: [ogImageUrl],
    },
    other: {
      'teemchat:theme': mapTheme,
    },
  };
}

export default function SpaceLayout({ children }: SpaceLayoutProps) {
  return <>{children}</>;
}

