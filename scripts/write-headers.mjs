// Writes hosting configs from security-headers.mjs. Run: npm run headers
// Reads VITE_SUPABASE_URL from the environment, or from .env / .env.local / .env.production(.local).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { buildSecurityHeaders } from '../security-headers.mjs'

for (const f of ['.env.production.local', '.env.local', '.env.production', '.env']) {
  const path = new URL(`../${f}`, import.meta.url)
  if (existsSync(path)) process.loadEnvFile(path) // never overrides variables already set
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || undefined
const headers = buildSecurityHeaders(supabaseUrl)

const lines = ['/*', ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`), '', '/sw.js', '  Cache-Control: no-cache', '']
writeFileSync(new URL('../public/_headers', import.meta.url), lines.join('\n'))

const vercel = {
  headers: [
    { source: '/(.*)', headers: Object.entries(headers).map(([key, value]) => ({ key, value })) },
    { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
  ],
}
const vercelPath = new URL('../vercel.json', import.meta.url)
const next = JSON.stringify(vercel, null, 2) + '\n'
const current = existsSync(vercelPath) ? readFileSync(vercelPath, 'utf8').replace(/\r\n/g, '\n') : ''

// Vercel reads vercel.json *before* the build runs, so a header change made during a Vercel build would
// silently not apply (and a CSP missing the Supabase origin breaks sync). Fail loudly instead.
if (process.env.VERCEL && current !== next) {
  // Say what this build sees vs. what is committed. Only origins and variable *names* are printed, never values of keys.
  const committed = /connect-src ([^;"]*)/.exec(current)?.[1] ?? '(none)'
  const related = Object.keys(process.env).filter((k) => /SUPABASE|VAPID/i.test(k))
  console.error(
    [
      'vercel.json is out of date for this environment (CSP must include the Supabase URL).',
      `  Vercel environment:            ${process.env.VERCEL_ENV ?? 'unknown'}`,
      `  VITE_SUPABASE_URL this build:  ${supabaseUrl ? new URL(supabaseUrl).origin : 'NOT SET'}`,
      `  connect-src in vercel.json:    ${committed}`,
      `  Supabase/VAPID variables seen: ${related.length ? related.join(', ') : 'none'}`,
      'Fix: make VITE_SUPABASE_URL in Vercel (for this environment) match .env.local, or run `npm run headers`',
      'locally with the same VITE_SUPABASE_URL and commit vercel.json + public/_headers. Then redeploy.',
    ].join('\n'),
  )
  process.exit(1)
}
writeFileSync(vercelPath, next)
console.log(`wrote public/_headers and vercel.json${supabaseUrl ? ` (cloud sync: ${new URL(supabaseUrl).origin})` : ' (local-only: no Supabase URL set)'}`)
