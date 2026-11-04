import type { Metadata } from 'next';
import { LandingPageClient } from '@/components/home/LandingPageClient';

// Entry screen for the native iOS/Android app. The middleware rewrites `/` here
// when the request comes from the Capacitor WebView, so the APK shows only
// login / guest entry instead of the marketing landing page.
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default function AppEntryPage() {
  return <LandingPageClient variant="app" />;
}
