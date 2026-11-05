import Link from 'next/link';
import type { ReactNode } from 'react';
import { LEGAL } from '@/lib/constants/legal';
import styles from './LegalPage.module.css';

const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/refunds', label: 'Refund Policy' },
  { href: '/contact', label: 'Contact & Support' },
] as const;

interface LegalPageProps {
  title: string;
  intro: string;
  children: ReactNode;
}

/** Shared layout for the Terms, Privacy, Refund and Contact pages. */
export function LegalPage({ title, intro, children }: LegalPageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link href="/" className={styles.brand}>
          TeemChat
        </Link>
        <Link href="/" className={styles.backLink}>
          ← Back to home
        </Link>
      </header>

      <main className={styles.main}>
        <article className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.updated}>Last updated: {LEGAL.lastUpdated}</p>
          <p className={styles.intro}>{intro}</p>
          <div className={styles.body}>{children}</div>
        </article>

        <nav className={styles.legalNav} aria-label="Legal pages">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={styles.legalNavLink}>
              {l.label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
