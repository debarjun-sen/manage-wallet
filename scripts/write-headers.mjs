// Writes hosting configs from security-headers.mjs. Run: npm run headers
import { writeFileSync } from 'node:fs'
import { SECURITY_HEADERS } from '../security-headers.mjs'

const lines = ['/*', ...Object.entries(SECURITY_HEADERS).map(([k, v]) => `  ${k}: ${v}`), '', '/sw.js', '  Cache-Control: no-cache', '']
writeFileSync(new URL('../public/_headers', import.meta.url), lines.join('\n'))

const vercel = {
  headers: [
    { source: '/(.*)', headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })) },
    { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
  ],
}
writeFileSync(new URL('../vercel.json', import.meta.url), JSON.stringify(vercel, null, 2) + '\n')
console.log('wrote public/_headers and vercel.json')
