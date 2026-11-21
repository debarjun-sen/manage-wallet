/**
 * Vercel Function: POST /api/notify — sends a Web Push to the other members of a shared group when
 * someone adds an expense or records a payment.
 *
 * The caller only says *which* row is new. The message is built from the row in the database, the
 * caller must be its creator and a member of the group, and each row notifies at most once
 * (the `notified` flag), so the endpoint can't be used to send arbitrary or repeated messages.
 *
 * Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 */
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100)

export async function POST(request: Request): Promise<Response> {
  const { VITE_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, VITE_VAPID_PUBLIC_KEY: vapidPublic, VAPID_PRIVATE_KEY: vapidPrivate } = process.env
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) return json(204, null)

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'missing token' })

  let body: { groupId?: unknown; kind?: unknown; id?: unknown }
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'bad json' })
  }
  const { groupId, kind, id } = body
  if (typeof groupId !== 'string' || typeof id !== 'string' || (kind !== 'expenses' && kind !== 'settlements') || groupId.length > 64 || id.length > 64) {
    return json(400, { error: 'bad request' })
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth } = await admin.auth.getUser(token)
  const user = auth.user
  if (!user) return json(401, { error: 'invalid token' })

  const { data: membership } = await admin.from('group_users').select('user_id').eq('group_id', groupId).eq('user_id', user.id).maybeSingle()
  if (!membership) return json(403, { error: 'not a member' })

  // Claim the row: only its creator, only once, only while it's fresh.
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const columns = kind === 'expenses' ? 'description, amount, paid_by' : 'from_id, to_id, amount'
  const { data: row } = await admin
    .from(kind)
    .update({ notified: true })
    .eq('group_id', groupId)
    .eq('id', id)
    .eq('created_by', user.id)
    .eq('notified', false)
    .eq('deleted', false)
    .gte('created_at', since)
    .select(columns)
    .maybeSingle()
  if (!row) return json(200, { sent: 0 })

  const [{ data: group }, { data: people }, { data: profile }, { data: members }] = await Promise.all([
    admin.from('groups').select('name').eq('id', groupId).single(),
    admin.from('people').select('id, name').eq('group_id', groupId),
    admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    admin.from('group_users').select('user_id').eq('group_id', groupId).neq('user_id', user.id),
  ])
  const name = (pid: unknown) => people?.find((p) => p.id === pid)?.name ?? 'Someone'
  const actor = profile?.display_name || 'Someone'
  const r = row as Record<string, unknown>
  const text =
    kind === 'expenses'
      ? `${actor} added ${inr(Number(r.amount))} · ${String(r.description)} (paid by ${name(r.paid_by)})`
      : `${actor} recorded: ${name(r.from_id)} paid ${name(r.to_id)} ${inr(Number(r.amount))}`

  const userIds = (members ?? []).map((m) => m.user_id as string)
  if (!userIds.length) return json(200, { sent: 0 })
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', userIds)

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', vapidPublic, vapidPrivate)
  const payload = JSON.stringify({ title: group?.name ?? 'Manage Wallet', body: text, url: `/#/group/${encodeURIComponent(groupId)}`, tag: `group-${groupId}` })

  let sent = 0
  const gone: string[] = []
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'normal' })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) gone.push(s.endpoint) // subscription expired or revoked
      }
    }),
  )
  if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone)
  return json(200, { sent })
}
