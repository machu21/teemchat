import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { LEGAL } from '@/lib/constants/legal';

export const metadata: Metadata = {
  title: 'Contact & Support',
  description: 'Get help with your TeemChat account, billing or the AI Companion.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  const { companyName, supportEmail } = LEGAL;
  return (
    <LegalPage
      title="Contact & Support"
      intro="Need help with your account, a payment or the AI Companion? Email us and a person will reply."
    >
      <h2>Email</h2>
      <p>
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
      </p>
      <p>We reply within 2 business days, usually sooner.</p>

      <h2>To help us answer quickly</h2>
      <ul>
        <li>Send from the email address on your TeemChat account.</li>
        <li>Include your username.</li>
        <li>For billing, include the date and amount of the charge.</li>
        <li>For a bug, tell us your device and browser, and add a screenshot if you can.</li>
      </ul>

      <h2>Common requests</h2>
      <ul>
        <li>
          <strong>Cancel the AI add-on:</strong> use Manage billing in your account panel, or see the{' '}
          <Link href="/refunds">Refund &amp; Cancellation Policy</Link>.
        </li>
        <li>
          <strong>Refunds:</strong> see the <Link href="/refunds">Refund Policy</Link>, then email us.
        </li>
        <li>
          <strong>Delete your account or get a copy of your data:</strong> email us from your account&apos;s address.
          See the <Link href="/privacy">Privacy Policy</Link>.
        </li>
        <li>
          <strong>Report abuse:</strong> email us with the username and what happened.
        </li>
      </ul>

      <p>TeemChat is operated by {companyName}.</p>
    </LegalPage>
  );
}
