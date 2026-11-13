import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { LEGAL } from '@/lib/constants/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What TeemChat collects, why, who processes it, and the choices you have.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  const { companyName, supportEmail } = LEGAL;
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains what information ${companyName} ("TeemChat", "we") collects when you use TeemChat, how we use it, and the choices you have. We do not sell your personal information.`}
    >
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your email address, username, display name, avatar choices and gender
          setting. Guest sessions get a temporary username and no email.
        </li>
        <li>
          <strong>Spaces and social features:</strong> spaces you create, friends and friend requests, direct and
          group messages, and settings you save.
        </li>
        <li>
          <strong>Space chat:</strong> in-world chat messages are deleted automatically about 30 seconds after
          they are sent.
        </li>
        <li>
          <strong>AI Companion:</strong> the messages you send your companion, its replies, the memories and
          reminders it keeps, and how many AI messages you have used.
        </li>
        <li>
          <strong>Screen Help:</strong> screenshots you choose to share are sent to our AI provider to answer your
          question. We don&apos;t store them on our servers.
        </li>
        <li>
          <strong>Voice and video:</strong> calls are carried live between participants through our voice provider.
          We don&apos;t record them.
        </li>
        <li>
          <strong>Payments:</strong> if you buy the AI add-on, Stripe collects your payment details. We receive your
          subscription status and a Stripe customer ID, never your full card number.
        </li>
        <li>
          <strong>Device storage:</strong> your browser or app stores your login session, theme, pinned spaces and
          similar preferences locally.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>to run TeemChat: accounts, spaces, voice, chat and the AI Companion;</li>
        <li>to give your companion memory so it can remember you between conversations;</li>
        <li>to apply usage limits and process payments;</li>
        <li>to keep the service safe, prevent abuse and fix problems;</li>
        <li>to contact you about your account, billing or important changes.</li>
      </ul>

      <h2>Who processes it for us</h2>
      <ul>
        <li><strong>Cloud database & authentication infrastructure</strong>: encrypted database storage, authentication, and real-time multiplayer synchronization.</li>
        <li><strong>LiveKit</strong>: live voice and video.</li>
        <li><strong>Google (Gemini API)</strong>: generates AI Companion and Screen Help replies.</li>
        <li><strong>Stripe</strong>: payments and billing.</li>
      </ul>
      <p>
        These providers process data only to deliver their part of the service. We may also share information if
        the law requires it, or to protect people from harm.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep account data while your account is open. Space chat is removed after about 30 seconds. Guest
        sessions and their temporary maps are removed when the guest leaves or deletes the session. You can clear
        your companion history in the companion panel. When you delete your account, we delete its data, except
        billing records we must keep by law.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Edit your profile and avatar in the app.</li>
        <li>Clear your AI Companion history from the companion panel.</li>
        <li>Cancel the AI add-on at any time from Manage billing.</li>
        <li>
          Ask for a copy of your data, a correction, or deletion of your account by emailing{' '}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Depending on where you live, you may have extra
          rights under laws such as the CCPA; we honour those requests the same way.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        TeemChat is not meant for children under 13, and we don&apos;t knowingly collect their information. If you
        believe a child under 13 has an account, email us and we will delete it.
      </p>

      <h2>Security</h2>
      <p>
        Data is sent over encrypted connections, and access to it is restricted by account-level security rules. No
        service is perfectly secure, so please use a strong, unique password.
      </p>

      <h2>Changes</h2>
      <p>
        We will post any changes here and update the date above. If a change is significant, we will tell you in the
        app or by email.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions: <a href={`mailto:${supportEmail}`}>{supportEmail}</a> or our{' '}
        <Link href="/contact">Contact page</Link>.
      </p>
    </LegalPage>
  );
}
