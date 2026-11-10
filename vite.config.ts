import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// @ts-expect-error plain .mjs module without type declarations
import { SECURITY_HEADERS } from './security-headers.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Production preview serves the same security headers as the deployed site.
  preview: { headers: SECURITY_HEADERS as Record<string, string> },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
