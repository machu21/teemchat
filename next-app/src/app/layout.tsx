import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { NativeAuthListener } from "@/components/auth/NativeAuthListener";
import { NativeThemeBars } from "@/components/native/NativeThemeBars";
import { AccessibilityBoot } from "@/components/settings/AccessibilitySettings";
import {
  SITE_NAME,
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  getSiteUrl,
} from "@/lib/constants/site";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  authors: [{ name: "Elevate Remote Solutions" }],
  creator: "Elevate Remote Solutions",
  publisher: "Elevate Remote Solutions",
  category: "technology",
  applicationName: SITE_NAME,
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "TeemChat - 16-Bit Proximity Virtual Space",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
    creator: "@teemchat",
  },
  icons: {
    // One file per size, all multiples of 48px (Google's favicon rule), no duplicates.
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/icons/Icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.json",
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION && {
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
  }),
};

/** User-agent marker the Capacitor apps append (keep in sync with lib/platform/nativeApp.ts). */
const NATIVE_APP_UA_TOKEN = 'TeemChatApp';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="en" className={plusJakartaSans.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('teemchat-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <NativeAuthListener />
        <NativeThemeBars />
        <AccessibilityBoot />
        {children}
        {(gtmId || gaId) && (
          <script
            id="analytics-loader"
            // Web only: the Android/iOS apps (user agent contains NATIVE_APP_UA_TOKEN)
            // load no analytics, which keeps the store privacy declarations simple.
            dangerouslySetInnerHTML={{
              __html: `(function(){
                if (navigator.userAgent.indexOf(${JSON.stringify(NATIVE_APP_UA_TOKEN)}) !== -1) return;
                function load(src){var s=document.createElement('script');s.async=true;s.src=src;document.head.appendChild(s);}
                var gtm=${JSON.stringify(gtmId ?? '')}, ga=${JSON.stringify(gaId ?? '')};
                if (gtm) load('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(gtm));
                if (ga) {
                  window.dataLayer = window.dataLayer || [];
                  window.gtag = function(){ window.dataLayer.push(arguments); };
                  window.gtag('js', new Date());
                  window.gtag('config', ga, { page_path: window.location.pathname });
                  load('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga));
                }
              })();`,
            }}
          />
        )}
      </body>
    </html>
  );
}
