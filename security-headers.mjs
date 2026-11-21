// Single source of truth for the HTTP security headers.
// Used by `vite preview` (vite.config.ts) and written to public/_headers (Netlify / Cloudflare Pages)
// and vercel.json by `npm run headers`, so local testing matches production.
//
// Cloud sync: when VITE_SUPABASE_URL is set, connect-src also allows exactly that Supabase project
// (HTTPS for the API, WSS for Realtime). Without it the app is local-only and the CSP stays 'self'.

/** @param {string | undefined} supabaseUrl */
export function supabaseOrigins(supabaseUrl) {
  if (!supabaseUrl) return []
  let origin
  try {
    origin = new URL(supabaseUrl).origin
  } catch {
    throw new Error(`VITE_SUPABASE_URL is not a valid URL: ${supabaseUrl}`)
  }
  if (!origin.startsWith('https://')) throw new Error('VITE_SUPABASE_URL must use https://')
  return [origin, origin.replace(/^https:/, 'wss:')]
}

/** @param {string | undefined} supabaseUrl */
export function buildCsp(supabaseUrl) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    ["connect-src 'self'", ...supabaseOrigins(supabaseUrl)].join(' '),
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** @param {string | undefined} supabaseUrl */
export function buildSecurityHeaders(supabaseUrl) {
  return {
    'Content-Security-Policy': buildCsp(supabaseUrl),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  }
}
