import type { SupabaseClient } from '@supabase/supabase-js'
import { VAPID_PUBLIC_KEY } from './supabase'

export type PushState = 'on' | 'off' | 'denied' | 'needs-install' | 'unsupported'

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  return navigator.serviceWorker.getRegistration()
}

export async function pushState(): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY || !('Notification' in window) || !('PushManager' in window)) {
    // iOS only exposes Web Push to apps added to the Home Screen (iOS 16.4+).
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  const reg = await registration()
  if (!reg) return 'unsupported' // no service worker: dev server or insecure origin
  if (Notification.permission === 'denied') return 'denied'
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

/** Must be called from a tap (iOS requires a user gesture for the permission prompt). */
export async function enablePush(client: SupabaseClient): Promise<PushState> {
  const state = await pushState()
  if (state === 'unsupported' || state === 'needs-install' || state === 'denied') return state
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = (await registration())!
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON()
  const { error } = await client.rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: json.keys?.p256dh ?? '', p_auth: json.keys?.auth ?? '' })
  if (error) throw new Error(error.message)
  return 'on'
}

/** Unsubscribe this device and forget its endpoint on the server (used on sign-out too). */
export async function disablePush(client: SupabaseClient): Promise<void> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await client.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe().catch(() => undefined)
}
