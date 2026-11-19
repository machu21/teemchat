import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { AI_ADDON_PRICE_TEXT, LEGAL, PLAN_PRICE_TEXT } from '@/lib/constants/legal';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using TeemChat, paid membership plans, and the AI Companion add-on.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  const { companyName, supportEmail, governingState } = LEGAL;
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms are an agreement between you and ${companyName} (operating TeemChat by ${companyName}, "we", "us") about your use of the TeemChat website, web app and mobile apps. By using TeemChat you agree to them.`}
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

      <h2>3. Beta service &amp; Founding Member offer</h2>
      <p>
        TeemChat is in beta. Features may change, break or be removed, and during the beta Plus features are free
        for every registered account. We will give advance notice before Free accounts drop to Free limits. Beta
        accounts created before launch are eligible for the Founding Member discount (50% off Plus for life), which
        remains active only as long as the Plus subscription stays active and is forfeited if cancelled.
      </p>

      <h2>4. Membership plans &amp; AI Companion add-on</h2>
      <ul>
        <li>
          <strong>Plus plan:</strong> {PLAN_PRICE_TEXT.plus.month} or {PLAN_PRICE_TEXT.plus.year} (up to 10 permanent
          maps, rooms of up to 50 players, and call video &amp; screen share).
        </li>
        <li>
          <strong>Host plan:</strong> {PLAN_PRICE_TEXT.host.month} or {PLAN_PRICE_TEXT.host.year} (up to 25 permanent
          maps, rooms of up to 150 players, and moderation controls).
        </li>
        <li>
          <strong>AI Companion add-on:</strong> {AI_ADDON_PRICE_TEXT.month} or {AI_ADDON_PRICE_TEXT.year}. AI
          features are only available to accounts with an active add-on and include up to 60 AI messages in each
          5-hour window.
        </li>
        <li>
          All paid prices are in US dollars plus any applicable tax. <strong>Your subscription renews
          automatically</strong> at the end of each month or year and is charged to your payment method until you
          cancel.
        </li>
        <li>
          You can cancel or switch plans at any time from <strong>Manage billing</strong> in your account panel.
          Access continues until the end of the period you paid for. All payments are final, as set out in our{' '}
          <Link href="/refunds">Cancellation Policy</Link>.
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
