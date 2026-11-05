import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { AI_ADDON_PRICE_TEXT, LEGAL } from '@/lib/constants/legal';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy',
  description: 'How to cancel the TeemChat AI Companion add-on and when you can get a refund.',
  alternates: { canonical: '/refunds' },
};

export default function RefundsPage() {
  const { supportEmail } = LEGAL;
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      intro="You can cancel the AI Companion add-on at any time. Here is how cancelling works and when we give refunds."
    >
      <h2>What you pay for</h2>
      <p>
        The AI Companion add-on is a subscription: {AI_ADDON_PRICE_TEXT.month} or {AI_ADDON_PRICE_TEXT.year}, in US
        dollars plus any applicable tax. It renews automatically until you cancel. Member features are free during
        the beta, so the AI add-on is currently the only paid product.
      </p>

      <h2>How to cancel</h2>
      <ol>
        <li>Open the dashboard and click your profile to open the account panel.</li>
        <li>In the AI Companion add-on card, click <strong>Manage billing</strong>.</li>
        <li>Choose <strong>Cancel subscription</strong> on the Stripe billing page.</li>
      </ol>
      <p>
        Or email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> from your account&apos;s email address and we
        will cancel it for you. After cancelling, you keep AI access until the end of the period you already paid
        for, and you won&apos;t be charged again.
      </p>

      <h2>Refunds</h2>
      <ul>
        <li>
          <strong>Yearly plan:</strong> a full refund if you ask within 14 days of the first payment.
        </li>
        <li>
          <strong>Monthly plan:</strong> payments are not refunded for partly used months; cancel to stop the next
          charge.
        </li>
        <li>
          <strong>Charged by mistake</strong> (for example a duplicate charge, or a renewal after you cancelled):
          a full refund of that charge.
        </li>
        <li>
          <strong>The AI Companion didn&apos;t work</strong> for a significant part of a billing period because of a
          problem on our side: a refund or credit for that period.
        </li>
      </ul>
      <p>
        To ask for a refund, email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your account email and
        the date of the charge. Approved refunds go back to your original payment method, usually within 5–10
        business days depending on your bank.
      </p>

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
