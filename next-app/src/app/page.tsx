import type { Metadata } from 'next';
import { LandingPageClient } from '@/components/home/LandingPageClient';
import { JsonLd, defaultFaqItems } from '@/components/seo/JsonLd';
import {
  SITE_NAME,
  SITE_TITLE,
  SITE_DESCRIPTION,
  getSiteUrl,
} from '@/lib/constants/site';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: `${SITE_NAME} - 16-Bit Proximity Virtual Space`,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    siteName: SITE_NAME,
    type: 'website',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'TeemChat 16-Bit Proximity Virtual Space',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
  },
};

export default function Page() {
  return (
    <>
      {/* Search Engine Structured Data (JSON-LD) */}
      <JsonLd />

      {/* Primary Interactive Client Application */}
      <LandingPageClient />

      {/* Crawlable Semantic Fallback for Non-JS Crawlers & Assistive Tech */}
      <noscript>
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
          <h1>TeemChat - 16-Bit Proximity Virtual Space</h1>
          <p>{SITE_DESCRIPTION}</p>
          <h2>Frequently Asked Questions</h2>
          <dl>
            {defaultFaqItems.map((item, idx) => (
              <div key={idx} style={{ marginBottom: '1rem' }}>
                <dt><strong>{item.question}</strong></dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </noscript>
    </>
  );
}
