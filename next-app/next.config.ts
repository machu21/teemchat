import type { NextConfig } from "next";

/**
 * Baseline security headers (OWASP A02 Security Misconfiguration).
 * - frame-ancestors / X-Frame-Options: nobody may embed the app (clickjacking).
 * - Permissions-Policy: mic, camera and screen capture only for our own origin
 *   (voice in spaces, DM video calls, screen help); location and other sensors off.
 * A full script CSP is not set here: it needs nonces for Next.js inline scripts
 * plus allow-lists for Supabase, LiveKit, Stripe and analytics.
 */
export const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
