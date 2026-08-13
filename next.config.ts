import type { NextConfig } from "next";

// This app handles confidential resident PII (photos, ID proofs, mobile
// numbers, addresses) and business financial data - these headers are the
// production-readiness security baseline for that. CSP script-src/style-src
// keep 'unsafe-inline' because Next.js's hydration/inline runtime scripts
// need it without a nonce-based setup (which would require wiring a nonce
// through proxy.ts); everything else here is intentionally strict.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // HSTS: Vercel already forces HTTPS at the edge; this additionally tells
  // browsers to never even attempt plain HTTP for this origin again.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every route except the Meta webhook, which Meta calls directly and
        // must not be constrained by a browser-oriented CSP/frame policy -
        // those headers are meaningless to a server-to-server POST anyway.
        source: "/((?!api/webhooks).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
