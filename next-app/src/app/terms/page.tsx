import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { AI_ADDON_PRICE_TEXT, LEGAL } from '@/lib/constants/legal';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using TeemChat and buying the AI Companion add-on.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  const { companyName, supportEmail, governingState } = LEGAL;
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms are an agreement between you and ${companyName} ("TeemChat", "we", "us") about your use of the TeemChat website, web app and mobile apps. By using TeemChat you agree to them.`}
    >
      <h2>1. Who can use TeemChat</h2>
      <p>
        You must be at least 13 years old. If you are under 18, you need permission from a parent or guardian, who
        also agrees to these terms. You can join as a guest without an account; guest sessions are temporary and
        may be removed.
      </p>

      <h2>2. Your account</h2>
      <p>
        Keep your login details private and tell us if you think someone else is using your account. You are
        responsible for what happens under your account. We may suspend or close accounts that break these terms.
      </p>

      <h2>3. Beta service</h2>
      <p>
        TeemChat is in beta. Features may change, break or be removed, and during the beta Member features are free
        for every registered account. We will tell you before Member features become paid.
      </p>

      <h2>4. AI Companion add-on</h2>
      <ul>
        <li>
          The AI Companion add-on costs {AI_ADDON_PRICE_TEXT.month} or {AI_ADDON_PRICE_TEXT.year} (US dollars, plus
          any applicable tax). AI features are only available to accounts with an active add-on.
        </li>
        <li>
          It includes up to 60 AI messages in each 5-hour window. The window starts with your first message and
          resets 5 hours later.
        </li>
        <li>
          <strong>Your subscription renews automatically</strong> at the end of each month or year and is charged
          to your payment method until you cancel.
        </li>
        <li>
          You can cancel at any time from <strong>Manage billing</strong> in your account panel. Access continues
          until the end of the period you paid for. Refunds are covered by our{' '}
          <Link href="/refunds">Refund Policy</Link>.
        </li>
        <li>
          We may change prices with at least 30 days&apos; notice. A new price applies from your next renewal after
          the notice, and you can cancel before then.
        </li>
        <li>Payments are processed by Stripe. We never see or store your full card number.</li>
      </ul>

      <h2>5. AI replies</h2>
      <p>
        AI Companion replies are generated automatically and can be wrong, incomplete or out of date. Don&apos;t
        rely on them for medical, legal, financial or safety decisions. Screen Help guidance is general advice; you
        decide whether to follow it.
      </p>

      <h2>6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>harass, threaten, impersonate or harm other people;</li>
        <li>share content that is illegal, sexually explicit involving minors, hateful or that infringes others&apos; rights;</li>
        <li>try to break, overload or get around the limits or security of TeemChat;</li>
        <li>use bots or scripts to create accounts or send messages;</li>
        <li>resell or share paid access.</li>
      </ul>

      <h2>7. Your content</h2>
      <p>
        You own what you create and share on TeemChat. You give us permission to host, show and process it only as
        needed to run the service. We may remove content that breaks these terms.
      </p>

      <h2>8. Ending your use</h2>
      <p>
        You can stop using TeemChat at any time. To delete a registered account, email{' '}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. We may suspend or end access if you break these terms
        or if we have to stop offering the service; if we end the service, we will refund the unused part of any paid
        period.
      </p>

      <h2>9. Disclaimers and liability</h2>
      <p>
        TeemChat is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, to the
        extent the law allows. To the extent the law allows, we are not liable for indirect or consequential losses,
        and our total liability to you is limited to the amount you paid us in the 12 months before the claim.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        We may update these terms. If a change is significant, we will tell you in the app or by email before it
        takes effect. Continuing to use TeemChat after that means you accept the new terms.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the laws of the United States
        {governingState ? ` and the State of ${governingState}` : ''}, without regard to conflict-of-law rules.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${supportEmail}`}>{supportEmail}</a> or our{' '}
        <Link href="/contact">Contact page</Link>.
      </p>
    </LegalPage>
  );
}
