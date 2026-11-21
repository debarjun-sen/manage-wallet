import type { SupabaseClient } from '@supabase/supabase-js'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

/** Without Supabase env vars the build is the original local-only app: no cloud UI, no network. */
export const CLOUD_ENABLED = Boolean(URL_ && KEY)

let client: Promise<SupabaseClient> | null = null

/** supabase-js is loaded lazily so local-only users never download it. */
export function getClient(): Promise<SupabaseClient> {
  if (!CLOUD_ENABLED) return Promise.reject(new Error('Cloud sync is not configured'))
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_!, KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'manage-wallet:auth' },
    }),
  )
  return client
}
