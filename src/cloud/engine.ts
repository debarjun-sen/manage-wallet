/**
 * Sync engine for shared groups: auth session, outbox replay, full pulls and Realtime updates.
 * It never touches React directly; App.tsx gives it a `host` to read and replace the groups list.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import {
  applyRemoteRow,
  buildGroups,
  diffGroup,
  enqueue,
  mergePulled,
  opToRow,
  stripCloud,
  type ExpenseRow,
  type GroupRow,
  type Kind,
  type MembershipRow,
  type Op,
  type PersonRow,
  type SettlementRow,
} from '../lib/sync'
import type { Group } from '../lib/types'
import { uid } from '../lib/util'
import { disablePush, enablePush, pushState, type PushState } from './push'
import { getClient, VAPID_PUBLIC_KEY } from './supabase'

export interface CloudUser {
  id: string
  email: string
  displayName: string
}

export interface CloudStatus {
  ready: boolean // initial session check done
  user: CloudUser | null
  online: boolean
  pending: number // local changes not yet on the server
  syncing: boolean
  lastSync: number | null
  error: string | null
}

export interface GroupUser {
  user_id: string
  role: 'admin' | 'member'
  member_id: string | null
  display_name: string
  joined_at: string
}

export interface Host {
  getGroups(): Group[]
  setGroups(fn: (groups: Group[]) => Group[]): void
  notify(msg: string): void
}

const OUTBOX_KEY = 'manage-wallet:outbox:v1'
const USER_KEY = 'manage-wallet:cloud-user'
const KINDS: Kind[] = ['people', 'expenses', 'settlements']
const PAGE = 1000

function loadOutbox(): Op[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]')
    if (!Array.isArray(v)) return []
    return v.filter(
      (op): op is Op =>
        !!op && typeof op === 'object' && KINDS.includes(op.kind) && typeof op.groupId === 'string' && typeof op.id === 'string' && (op.row === null || typeof op.row === 'object'),
    )
  } catch {
    return []
  }
}

/** Retry later on network trouble, rate limits, expired tokens and server errors; anything else is a rejection. */
const isTransient = (status: number) => status === 0 || status === 401 || status === 408 || status === 429 || status >= 500

type SendResult = 'ok' | 'retry' | 'rejected'

export class SyncEngine {
  host: Host
  private status: CloudStatus = { ready: false, user: null, online: navigator.onLine, pending: 0, syncing: false, lastSync: null, error: null }
  private listeners = new Set<() => void>()
  private outbox: Op[] = loadOutbox()
  private frozen = 0
  private flushing = false
  private retryTimer: number | undefined
  private retries = 0
  private pulling: Promise<void> | null = null
  private pullAgain = false
  private pullTimer: number | undefined
  private channel: RealtimeChannel | null = null
  private generation = 0 // bumped by start/stop so a superseded start() (React StrictMode) bails out
  private cleanup: (() => void)[] = []

  constructor(host: Host) {
    this.host = host
    this.status = { ...this.status, pending: this.outbox.length }
  }

  // ---- React binding (useSyncExternalStore) ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getStatus = () => this.status
  private set(patch: Partial<CloudStatus>) {
    this.status = { ...this.status, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  // ---- lifecycle ----
  async start() {
    const gen = ++this.generation
    const c = await getClient()
    if (gen !== this.generation) return
    const { data: sub } = c.auth.onAuthStateChange((event, session) => {
      // Never await Supabase calls inside this callback (it holds the auth lock): defer instead.
      setTimeout(() => {
        if (event === 'SIGNED_OUT' || !session) void this.onSignedOut()
        else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') void this.onSignedIn(session.user.id, session.user.email ?? '')
      }, 0)
    })
    const { data } = await c.auth.getSession()
    if (!data.session) this.set({ ready: true })

    const onOnline = () => {
      this.set({ online: true })
      void this.flush()
      this.schedulePull(0)
    }
    const onOffline = () => this.set({ online: false })
    const onVisible = () => {
      if (document.visibilityState === 'visible' && this.status.user) {
        void this.flush()
        this.schedulePull(0)
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    this.cleanup.push(
      () => sub.subscription.unsubscribe(),
      () => window.removeEventListener('online', onOnline),
      () => window.removeEventListener('offline', onOffline),
      () => document.removeEventListener('visibilitychange', onVisible),
    )
  }

  stop() {
    this.generation++
    this.cleanup.splice(0).forEach((fn) => fn())
    void this.unsubscribeRealtime()
    window.clearTimeout(this.retryTimer)
    window.clearTimeout(this.pullTimer)
  }

  private async onSignedIn(id: string, email: string) {
    const c = await getClient()
    // A different account on this device: its predecessor's shared groups and queued edits don't belong to it.
    let previous: string | null = null
    try {
      previous = localStorage.getItem(USER_KEY)
      localStorage.setItem(USER_KEY, id)
    } catch {
      /* storage blocked */
    }
    if (previous && previous !== id) {
      this.host.setGroups((gs) => gs.filter((g) => !g.cloud))
      this.setOutbox([])
    }
    const { data: profile } = await c.from('profiles').select('display_name').eq('id', id).maybeSingle()
    this.set({ ready: true, user: { id, email, displayName: (profile?.display_name as string | undefined) ?? '' } })
    if (!this.channel) this.subscribeRealtime(c)
    await this.pull()
    void this.flush()
  }

  private async onSignedOut() {
    await this.unsubscribeRealtime()
    this.set({ ready: true, user: null })
  }

  // ---- outbox ----
  private setOutbox(ops: Op[]) {
    this.outbox = ops
    try {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops))
    } catch {
      /* storage full: ops stay in memory */
    }
    this.set({ pending: ops.length })
  }

  /** Called by App for every edit to a shared group. */
  recordEdit(prev: Group, next: Group) {
    const ops = diffGroup(prev, next)
    if (ops.length === 0) return
    this.setOutbox(enqueue(this.outbox, ops, this.frozen))
    queueMicrotask(() => void this.flush())
  }

  private dropOpsFor(groupId: string) {
    const keep = this.outbox.filter((op, i) => i < this.frozen || op.groupId !== groupId)
    this.setOutbox(keep)
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.status.user || this.outbox.length === 0 || !navigator.onLine) return
    this.flushing = true
    this.set({ syncing: true })
    window.clearTimeout(this.retryTimer)
    this.frozen = this.outbox.length
    const batch = this.outbox.slice(0, this.frozen)
    let result: SendResult = 'retry'
    try {
      const c = await getClient()
      result = await this.send(c, batch)
      if (result === 'rejected' && batch.length > 1) {
        // Find the bad op(s): resend one by one so valid edits still go through.
        result = 'ok'
        let rejected = 0
        for (const op of batch) {
          const r = await this.send(c, [op])
          if (r === 'retry') {
            result = 'retry'
            break
          }
          if (r === 'rejected') rejected++
        }
        if (result === 'ok' && rejected) result = 'rejected'
      }
      if (result !== 'retry') void this.notifyServer(c, batch)
    } catch {
      result = 'retry'
    }
    const sent = this.frozen
    this.frozen = 0
    this.flushing = false
    if (result === 'retry') {
      this.retries++
      this.set({ syncing: false, error: navigator.onLine ? 'Sync failed, retrying…' : null })
      this.retryTimer = window.setTimeout(() => void this.flush(), Math.min(30_000, 2_000 * 2 ** Math.min(this.retries, 4)))
      return
    }
    this.retries = 0
    this.setOutbox(this.outbox.slice(sent))
    this.set({ syncing: false, error: null, lastSync: Date.now() })
    if (result === 'rejected') {
      this.host.notify('A change was refused by the server and was undone')
      this.schedulePull(0)
    }
    if (this.outbox.length) void this.flush()
  }

  private async send(c: SupabaseClient, ops: Op[]): Promise<SendResult> {
    for (const kind of KINDS) {
      const ups = ops.filter((op) => op.kind === kind && op.row !== null)
      if (ups.length) {
        const { error, status } = await c.from(kind).upsert(ups.map(opToRow), { onConflict: 'group_id,id' })
        if (error) return isTransient(status) ? 'retry' : 'rejected'
      }
      const dels = ops.filter((op) => op.kind === kind && op.row === null)
      for (const groupId of new Set(dels.map((d) => d.groupId))) {
        const ids = dels.filter((d) => d.groupId === groupId).map((d) => d.id)
        const { error, status } = await c.from(kind).update({ deleted: true }).eq('group_id', groupId).in('id', ids)
        if (error) return isTransient(status) ? 'retry' : 'rejected'
      }
    }
    return 'ok'
  }

  /** Ask the push function to tell the rest of the group about new expenses/payments (best effort). */
  private async notifyServer(c: SupabaseClient, ops: Op[]) {
    if (!VAPID_PUBLIC_KEY) return
    const fresh = ops.filter((op) => op.isNew && op.row !== null && op.kind !== 'people').slice(0, 3)
    if (!fresh.length) return
    const { data } = await c.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    for (const op of fresh) {
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: op.groupId, kind: op.kind, id: op.id }),
      }).catch(() => undefined)
    }
  }

  // ---- pull ----
  schedulePull(delay = 400) {
    window.clearTimeout(this.pullTimer)
    this.pullTimer = window.setTimeout(() => void this.pull(), delay)
  }

  async pull(): Promise<void> {
    if (!this.status.user) return
    if (this.pulling) {
      this.pullAgain = true
      return this.pulling
    }
    this.pulling = this.doPull().finally(() => {
      this.pulling = null
      if (this.pullAgain) {
        this.pullAgain = false
        void this.pull()
      }
    })
    return this.pulling
  }

  private async doPull() {
    const user = this.status.user
    if (!user || !navigator.onLine) return
    this.set({ syncing: true })
    try {
      const c = await getClient()
      const all = async <T>(build: () => { range(a: number, b: number): PromiseLike<{ data: unknown; error: { message: string } | null }> }) => {
        const rows: T[] = []
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await build().range(from, from + PAGE - 1)
          if (error) throw new Error(error.message)
          const page = (data ?? []) as T[]
          rows.push(...page)
          if (page.length < PAGE) return rows
        }
      }
      const [groups, memberships, people, expenses, settlements] = await Promise.all([
        all<GroupRow>(() => c.from('groups').select('id,name,invite_code,created_at').order('id')),
        all<MembershipRow>(() => c.from('group_users').select('group_id,role,member_id').eq('user_id', user.id).order('group_id')),
        all<PersonRow>(() => c.from('people').select('group_id,id,name,upi_id').eq('deleted', false).order('group_id').order('id')),
        all<ExpenseRow>(() =>
          c.from('expenses').select('group_id,id,description,amount,paid_by,splits,date,source,split_mode,created_at').eq('deleted', false).order('group_id').order('id'),
        ),
        all<SettlementRow>(() => c.from('settlements').select('group_id,id,from_id,to_id,amount,date,created_at').eq('deleted', false).order('group_id').order('id')),
      ])
      if (this.status.user?.id !== user.id) return
      const pulled = buildGroups({ groups, memberships, people, expenses, settlements })
      let lost: { id: string; name: string }[] = []
      this.host.setGroups((gs) => {
        const merged = mergePulled(gs, pulled, this.outbox)
        lost = merged.lost
        return merged.groups
      })
      for (const g of lost) {
        this.dropOpsFor(g.id)
        this.host.notify(`You're no longer in "${g.name}". A copy stays on this device.`)
      }
      this.set({ syncing: false, lastSync: Date.now(), error: null })
    } catch (e) {
      this.set({ syncing: false, error: e instanceof Error ? e.message : 'Sync failed' })
    }
  }

  // ---- realtime ----
  private subscribeRealtime(c: SupabaseClient) {
    let wasSubscribed = false
    const ch = c.channel('manage-wallet-sync')
    for (const kind of KINDS) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: kind }, (payload) => {
        const row = payload.new as PersonRow | ExpenseRow | SettlementRow | undefined
        if (!row || typeof row.group_id !== 'string') return
        let unknown = false
        this.host.setGroups((gs) => {
          const next = applyRemoteRow(gs, kind, row, this.outbox)
          if (next === null) unknown = true
          return next ?? gs
        })
        if (unknown) this.schedulePull()
      })
    }
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups' }, (payload) => {
      const row = payload.new as GroupRow | undefined
      if (!row?.id) return
      this.host.setGroups((gs) =>
        gs.map((g) => (g.id === row.id && g.cloud ? { ...g, name: row.name, cloud: { ...g.cloud, inviteCode: row.invite_code } } : g)),
      )
    })
    // Joins, leaves and role changes: re-read memberships.
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'group_users' }, () => this.schedulePull())
    ch.subscribe((state) => {
      if (state === 'SUBSCRIBED') {
        // After a reconnect we may have missed events: catch up.
        if (wasSubscribed) this.schedulePull(0)
        wasSubscribed = true
      }
    })
    this.channel = ch
  }

  private async unsubscribeRealtime() {
    const ch = this.channel
    this.channel = null
    if (ch) await (await getClient()).removeChannel(ch)
  }

  // ---- auth ----
  async sendCode(email: string) {
    const c = await getClient()
    const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    if (error) throw new Error(error.message)
  }

  async verifyCode(email: string, token: string) {
    const c = await getClient()
    const { error } = await c.auth.verifyOtp({ email, token, type: 'email' })
    if (error) throw new Error(error.message)
  }

  /** Signs out and removes shared groups from this device (they stay on the server). */
  async signOut() {
    const c = await getClient()
    await disablePush(c).catch(() => undefined)
    await this.unsubscribeRealtime()
    await c.auth.signOut().catch(() => undefined)
    this.host.setGroups((gs) => gs.filter((g) => !g.cloud))
    this.setOutbox([])
    try {
      localStorage.removeItem(USER_KEY)
    } catch {
      /* ignore */
    }
    this.set({ user: null, error: null, lastSync: null })
  }

  async setDisplayName(name: string) {
    const user = this.status.user
    if (!user) return
    const c = await getClient()
    const { error } = await c.from('profiles').update({ display_name: name }).eq('id', user.id)
    if (error) throw new Error(error.message)
    this.set({ user: { ...user, displayName: name } })
  }

  // ---- push ----
  pushState(): Promise<PushState> {
    return pushState()
  }
  async enablePush(): Promise<PushState> {
    return enablePush(await getClient())
  }
  async disablePush() {
    await disablePush(await getClient())
  }

  // ---- groups ----
  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const c = await getClient()
    const { data, error } = await c.rpc(fn, args)
    if (error) throw new Error(error.message)
    return data as T
  }

  /**
   * Upload a local group and make it shared (you become admin). It gets a fresh server id; the ids of its
   * people, expenses and settlements stay the same. Returns the shared copy to replace the local one.
   */
  async shareGroup(g: Group, memberId: string): Promise<Group> {
    if (!this.status.user) throw new Error('Sign in first')
    const c = await getClient()
    const id = `${uid()}${uid()}`
    const created = await this.rpc<GroupRow>('create_shared_group', { p_id: id, p_name: g.name, p_member_id: memberId })
    try {
      const rows = (kind: Kind, list: { id: string }[]) =>
        list.map((row) => opToRow({ kind, groupId: id, id: row.id, row, isNew: true } as Op))
      // Backdate created_at one second apart so the server keeps the original order.
      const base = Date.now() - (g.expenses.length + g.settlements.length + 5) * 1000
      const stamped = (list: Record<string, unknown>[], offset: number) => list.map((r, i) => ({ ...r, created_at: new Date(base + (offset + i) * 1000).toISOString() }))
      const chunks = <T>(list: T[]) => Array.from({ length: Math.ceil(list.length / 500) }, (_, i) => list.slice(i * 500, i * 500 + 500))
      const uploads: [Kind, Record<string, unknown>[]][] = [
        ['people', rows('people', g.members)],
        ['expenses', stamped(rows('expenses', g.expenses), 0)],
        ['settlements', stamped(rows('settlements', g.settlements), g.expenses.length)],
      ]
      for (const [kind, list] of uploads) {
        for (const part of chunks(list)) {
          const { error } = await c.from(kind).insert(part)
          if (error) throw new Error(error.message)
        }
      }
    } catch (e) {
      await c.rpc('delete_shared_group', { p_group: id })
      throw e
    }
    return { ...g, id, cloud: { role: 'admin', inviteCode: created.invite_code, memberId } }
  }

  previewInvite(code: string) {
    return this.rpc<{ group_id: string; name: string; people: number; already_member: boolean }[]>('preview_invite', { p_code: code }).then((r) => r[0] ?? null)
  }

  async joinGroup(code: string): Promise<string> {
    const gid = await this.rpc<string>('join_group', { p_code: code })
    await this.pull()
    return gid
  }

  async claimPerson(groupId: string, memberId: string) {
    await this.rpc('claim_person', { p_group: groupId, p_member_id: memberId })
    this.host.setGroups((gs) => gs.map((g) => (g.id === groupId && g.cloud ? { ...g, cloud: { ...g.cloud, memberId } } : g)))
  }

  /** Add yourself as a new person in a shared group (when you're not in its list yet). */
  async addMe(groupId: string, name: string) {
    const c = await getClient()
    const id = uid()
    const { error } = await c.from('people').insert({ group_id: groupId, id, name })
    if (error) throw new Error(error.message)
    this.host.setGroups((gs) => gs.map((g) => (g.id === groupId && !g.members.some((m) => m.id === id) ? { ...g, members: [...g.members, { id, name }] } : g)))
    await this.claimPerson(groupId, id)
  }

  async leave(groupId: string) {
    await this.rpc('leave_group', { p_group: groupId })
    this.dropOpsFor(groupId)
    this.host.setGroups((gs) => gs.filter((g) => g.id !== groupId))
  }

  async deleteForEveryone(groupId: string) {
    await this.rpc('delete_shared_group', { p_group: groupId })
    this.dropOpsFor(groupId)
    this.host.setGroups((gs) => gs.filter((g) => g.id !== groupId))
  }

  /** Stop syncing a group locally after an error, keeping its data as a local-only group. */
  detach(groupId: string) {
    this.dropOpsFor(groupId)
    this.host.setGroups((gs) => gs.map((g) => (g.id === groupId ? stripCloud(g) : g)))
  }

  async rotateInvite(groupId: string) {
    const code = await this.rpc<string>('rotate_invite_code', { p_group: groupId })
    this.host.setGroups((gs) => gs.map((g) => (g.id === groupId && g.cloud ? { ...g, cloud: { ...g.cloud, inviteCode: code } } : g)))
    return code
  }

  listUsers(groupId: string) {
    return this.rpc<GroupUser[]>('list_group_users', { p_group: groupId })
  }

  async setRole(groupId: string, userId: string, role: 'admin' | 'member') {
    await this.rpc('set_member_role', { p_group: groupId, p_user: userId, p_role: role })
    if (userId === this.status.user?.id) await this.pull()
  }

  async removeUser(groupId: string, userId: string) {
    await this.rpc('remove_member', { p_group: groupId, p_user: userId })
  }

  /** Clears queued edits (used by Reset). */
  clearOutbox() {
    this.setOutbox([])
  }
}
