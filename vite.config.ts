import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// @ts-expect-error plain .mjs module without type declarations
import { buildSecurityHeaders } from './security-headers.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss()],
    // Production preview serves the same security headers as the deployed site.
    preview: { headers: buildSecurityHeaders(env.VITE_SUPABASE_URL || undefined) as Record<string, string> },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  }
})
