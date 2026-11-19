import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { AI_ADDON_PRICE_TEXT, LEGAL, PLAN_PRICE_TEXT } from '@/lib/constants/legal';

export const metadata: Metadata = {
  title: 'Cancellation Policy',
  description: 'How to cancel TeemChat membership plans or the AI Companion add-on. All payments are final.',
  alternates: { canonical: '/refunds' },
};

export default function RefundsPage() {
  const { companyName, supportEmail } = LEGAL;
  return (
    <LegalPage
      title="Cancellation Policy"
      intro={`You can cancel any TeemChat by ${companyName} subscription (Plus, Host, or the AI Companion add-on) at any time. Paid features are available as soon as you pay, so all payments are final. Here is how cancelling works.`}
    >
      <h2>What you pay for</h2>
      <ul>
        <li>
          <strong>Plus plan:</strong> {PLAN_PRICE_TEXT.plus.month} or {PLAN_PRICE_TEXT.plus.year} (10 permanent maps,
          rooms up to 50 players, call video and screen share). Plus features are free during the beta, and eligible
          Founding Member accounts receive 50% off Plus for as long as their subscription stays active.
        </li>
        <li>
          <strong>Host plan:</strong> {PLAN_PRICE_TEXT.host.month} or {PLAN_PRICE_TEXT.host.year} (25 permanent maps,
          rooms up to 150 players, moderation tools).
        </li>
        <li>
          <strong>AI Companion add-on:</strong> {AI_ADDON_PRICE_TEXT.month} or {AI_ADDON_PRICE_TEXT.year} (60 AI
          messages per 5-hour window, memories, and Screen Help).
        </li>
      </ul>
      <p>
        All prices are in US dollars plus any applicable tax, and subscriptions renew automatically until you cancel.
      </p>

      <h2>How to cancel</h2>
      <ol>
        <li>Open the dashboard and click your profile to open the account panel.</li>
        <li>In your plan card or AI Companion add-on card, click <strong>Manage billing</strong>.</li>
        <li>Choose <strong>Cancel subscription</strong> on the Stripe billing page.</li>
      </ol>
      <p>
        Or email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> from your account&apos;s email address and we
        will cancel it for you. After cancelling, you keep paid features until the end of the period you already paid
        for, and you won&apos;t be charged again. If you cancel a Founding Member Plus subscription, the lifetime 50%
        discount ends when the subscription closes.
      </p>

      <h2>No refunds</h2>
      <p>
        All payments are final. Paid features unlock as soon as you pay and stay available for the whole period you
        paid for, so we don&apos;t refund monthly or yearly payments, including partly used periods. Cancel before
        your renewal date to stop the next charge.
      </p>
      <p>The only exceptions are charges that should not have happened, or the end of the service:</p>
      <ul>
        <li>
          <strong>Charged by mistake</strong> (for example a duplicate charge, or a renewal after you cancelled):
          we refund that charge. Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your account email
          and the date of the charge. Refunds go back to your original payment method, usually within 5–10 business
          days depending on your bank.
        </li>
        <li>
          <strong>Service shutdown:</strong> if we stop offering TeemChat, we refund the unused part of any paid
          period, as described in our <Link href="/terms">Terms of Service</Link>.
        </li>
      </ul>

      <h2>App store purchases</h2>
      <p>
        If you ever buy through the Apple App Store or Google Play, that store handles billing, cancellation and
        refunds under its own policies.
      </p>

      <h2>Questions</h2>
      <p>
        See our <Link href="/terms">Terms of Service</Link> or <Link href="/contact">contact us</Link>.
      </p>
    </LegalPage>
  );
}
