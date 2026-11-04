import React from 'react';
import { SITE_NAME, SITE_DESCRIPTION, getSiteUrl } from '@/lib/constants/site';

interface JsonLdProps {
  faqItems?: Array<{ question: string; answer: string }>;
}

export const defaultFaqItems = [
  {
    question: 'What is TeemChat?',
    answer:
      'TeemChat is a collaborative 16-bit virtual space featuring spatial proximity voice chat, customizable retro pixel avatars, and an interactive AI Companion for teams, friends, and communities.',
  },
  {
    question: 'How does spatial proximity voice work in TeemChat?',
    answer:
      'Just like in real life, you can hear and speak with people nearby in the 2D canvas world. As you walk closer to another player, their voice gets louder, and as you walk away, it naturally fades out.',
  },
  {
    question: 'Is TeemChat free to use?',
    answer:
      'Yes! TeemChat is free to join as a guest or with a registered account. You can create or join public and private virtual spaces directly from your web browser.',
  },
  {
    question: 'Do I need to download an app to use TeemChat?',
    answer:
      'No installation is required. TeemChat runs directly in all modern desktop and mobile browsers, with dedicated mobile support powered by Capacitor.',
  },
  {
    question: 'How do I invite teammates to my virtual space?',
    answer:
      'Simply copy your space invite link (e.g. teemchat.vercel.app/space/YOUR_CODE) and share it via Discord, Slack, WhatsApp, or email. Your teammates can click and join instantly.',
  },
];

export function JsonLd({ faqItems = defaultFaqItems }: JsonLdProps) {
  const siteUrl = getSiteUrl();

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: siteUrl,
    description: SITE_DESCRIPTION,
    applicationCategory: 'CommunicationApplication',
    operatingSystem: 'Web, Android, iOS',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      '16-Bit Retro Virtual Canvas World',
      'Spatial Proximity Voice Chat (WebRTC/LiveKit)',
      'Customizable 2D Pixel Avatars',
      'Interactive AI Companion',
      'Instant Shareable Room Invite Links',
    ],
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: siteUrl,
    logo: `${siteUrl}/icon.png`,
    sameAs: ['https://x.com/teemchat'],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  );
}

