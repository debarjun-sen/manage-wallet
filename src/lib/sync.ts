/**
 * Pure sync logic for shared (cloud) groups. No network here: the engine in src/cloud/ feeds it.
 *
 * Local edits keep going through the existing `update(group => group)` callbacks. For a shared group
 * we diff the group before/after the edit into row-level operations (upsert or soft-delete of one
 * person / expense / settlement), queue them in an outbox, and replay them to the server. Server
 * rows come back as the same local shapes, so the existing UI and money logic stay untouched.
 */
import type { CloudInfo, Expense, Group, Member, Settlement, Split } from './types'

export type Kind = 'people' | 'expenses' | 'settlements'

export type Op =
  | { kind: 'people'; groupId: string; id: string; row: Member | null; isNew: boolean }
  | { kind: 'expenses'; groupId: string; id: string; row: Expense | null; isNew: boolean }
  | { kind: 'settlements'; groupId: string; id: string; row: Settlement | null; isNew: boolean }

// ---- server row shapes (snake_case, as stored in Postgres) ----

export interface GroupRow {
  id: string
  name: string
  invite_code: string
  created_at: string
}
export interface MembershipRow {
  group_id: string
  role: string
  member_id: string | null
}
export interface PersonRow {
  group_id: string
  id: string
  name: string
  upi_id: string | null
  deleted?: boolean
}
export interface ExpenseRow {
  group_id: string
  id: string
  description: string
  amount: number
  paid_by: string
  splits: unknown
  date: string
  source: string
  split_mode: string | null
  deleted?: boolean
  created_at?: string
}
export interface SettlementRow {
  group_id: string
  id: string
  from_id: string
  to_id: string
  amount: number
  date: string
  deleted?: boolean
  created_at?: string
}

const COLLECTION = { people: 'members', expenses: 'expenses', settlements: 'settlements' } as const

/** Order-insensitive deep compare for small JSON-like values. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

function diffList<T extends { id: string }>(prev: T[], next: T[]): { id: string; row: T | null; isNew: boolean }[] {
  const before = new Map(prev.map((x) => [x.id, x]))
  const after = new Set(next.map((x) => x.id))
  const out: { id: string; row: T | null; isNew: boolean }[] = []
  for (const x of next) {
    const old = before.get(x.id)
    if (!old) out.push({ id: x.id, row: x, isNew: true })
    else if (old !== x && canon(old) !== canon(x)) out.push({ id: x.id, row: x, isNew: false })
  }
  for (const x of prev) if (!after.has(x.id)) out.push({ id: x.id, row: null, isNew: false })
  return out
}

/** Row-level operations that turn `prev` into `next`. People first so foreign keys resolve on the server. */
export function diffGroup(prev: Group, next: Group): Op[] {
  const groupId = prev.id
  return [
    ...diffList(prev.members, next.members).map((d) => ({ kind: 'people' as const, groupId, ...d })),
    ...diffList(prev.expenses, next.expenses).map((d) => ({ kind: 'expenses' as const, groupId, ...d })),
    ...diffList(prev.settlements, next.settlements).map((d) => ({ kind: 'settlements' as const, groupId, ...d })),
  ]
}

const sameKey = (a: Op, b: Op) => a.kind === b.kind && a.groupId === b.groupId && a.id === b.id

/**
 * Add ops to the outbox, merging with queued ops for the same row. Items before index `frozen` are
 * already being sent and are left alone. An add followed by a delete that never reached the server cancels out.
 */
export function enqueue(queue: Op[], ops: Op[], frozen = 0): Op[] {
  const out = [...queue]
  for (const op of ops) {
    const i = out.findIndex((q, idx) => idx >= frozen && sameKey(q, op))
    if (i === -1) {
      out.push(op)
      continue
    }
    const isNew = out[i].isNew
    if (isNew && op.row === null) out.splice(i, 1)
    else out[i] = { ...op, isNew } as Op
  }
  return out
}

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id)
  if (i === -1) return [...list, row]
  const copy = [...list]
  copy[i] = row
  return copy
}

function applyOne(g: Group, kind: Kind, id: string, row: Member | Expense | Settlement | null): Group {
  const key = COLLECTION[kind]
  const list = g[key] as { id: string }[]
  const next = row === null ? list.filter((x) => x.id !== id) : upsertById(list, row)
  return { ...g, [key]: next }
}

/** Replay queued local ops on top of a group (used after a pull so unsynced edits aren't lost). */
export function applyOps(g: Group, ops: Op[]): Group {
  return ops.filter((op) => op.groupId === g.id).reduce((acc, op) => applyOne(acc, op.kind, op.id, op.row), g)
}

// ---- mapping local <-> server rows ----

export function opToRow(op: Op): Record<string, unknown> {
  const base = { group_id: op.groupId, id: op.id, deleted: false }
  if (op.row === null) return { ...base, deleted: true }
  if (op.kind === 'people') return { ...base, name: op.row.name, upi_id: op.row.upiId ?? null }
  if (op.kind === 'expenses') {
    const e = op.row
    return {
      ...base,
      description: e.description,
      amount: e.amount,
      paid_by: e.paidBy,
      splits: e.splits.map((s) => ({ memberId: s.memberId, share: s.share })),
      date: e.date,
      source: e.source,
      split_mode: e.splitMode ?? null,
    }
  }
  const s = op.row
  return { ...base, from_id: s.from, to_id: s.to, amount: s.amount, date: s.date }
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
const day = (v: unknown) => (isStr(v) ? v.slice(0, 10) : '')

export function rowToPerson(r: PersonRow): Member | null {
  if (!isStr(r.id) || !isStr(r.name)) return null
  return { id: r.id, name: r.name, ...(isStr(r.upi_id) && r.upi_id ? { upiId: r.upi_id } : {}) }
}

export function rowToExpense(r: ExpenseRow): Expense | null {
  if (!isStr(r.id) || !isStr(r.description) || !isInt(Number(r.amount)) || !isStr(r.paid_by) || !Array.isArray(r.splits)) return null
  const splits: Split[] = []
  for (const s of r.splits as unknown[]) {
    if (!s || typeof s !== 'object') return null
    const { memberId, share } = s as Record<string, unknown>
    if (!isStr(memberId) || !isInt(share)) return null
    splits.push({ memberId, share })
  }
  const mode = r.split_mode
  return {
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    paidBy: r.paid_by,
    splits,
    date: day(r.date),
    source: r.source === 'pasted' ? 'pasted' : 'manual',
    ...(mode === 'equal' || mode === 'exact' || mode === 'percent' ? { splitMode: mode } : {}),
  }
}

export function rowToSettlement(r: SettlementRow): Settlement | null {
  if (!isStr(r.id) || !isStr(r.from_id) || !isStr(r.to_id) || !isInt(Number(r.amount))) return null
  return { id: r.id, from: r.from_id, to: r.to_id, amount: Number(r.amount), date: day(r.date) }
}

function rowToLocal(kind: Kind, row: PersonRow | ExpenseRow | SettlementRow) {
  if (kind === 'people') return rowToPerson(row as PersonRow)
  if (kind === 'expenses') return rowToExpense(row as ExpenseRow)
  return rowToSettlement(row as SettlementRow)
}

const byCreated = (a: { created_at?: string; id: string }, b: { created_at?: string; id: string }) =>
  (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id)

export function toCloudInfo(m: MembershipRow, inviteCode: string): CloudInfo {
  return { role: m.role === 'admin' ? 'admin' : 'member', inviteCode, ...(m.member_id ? { memberId: m.member_id } : {}) }
}

/** Assemble local Group objects from the rows of a full pull. */
export function buildGroups(data: {
  groups: GroupRow[]
  memberships: MembershipRow[]
  people: PersonRow[]
  expenses: ExpenseRow[]
  settlements: SettlementRow[]
}): Group[] {
  const live = <T extends { deleted?: boolean; group_id: string }>(rows: T[], gid: string) => rows.filter((r) => r.group_id === gid && !r.deleted)
  const out: Group[] = []
  for (const g of data.groups) {
    const m = data.memberships.find((x) => x.group_id === g.id)
    if (!m) continue
    out.push({
      id: g.id,
      name: g.name,
      createdAt: g.created_at,
      members: live(data.people, g.id).map(rowToPerson).filter((x): x is Member => x !== null),
      expenses: [...live(data.expenses, g.id)].sort(byCreated).map(rowToExpense).filter((x): x is Expense => x !== null),
      settlements: [...live(data.settlements, g.id)].sort(byCreated).map(rowToSettlement).filter((x): x is Settlement => x !== null),
      cloud: toCloudInfo(m, g.invite_code),
    })
  }
  return out
}

export function stripCloud(g: Group): Group {
  const copy = { ...g }
  delete copy.cloud
  return copy
}

/**
 * Merge a full pull into local groups. Local-only groups are untouched; shared groups are replaced by
 * the server copy plus any unsynced local ops; shared groups the server no longer returns (deleted, or
 * you were removed) are kept on this device as local-only copies so no data silently disappears.
 */
export function mergePulled(local: Group[], pulled: Group[], outbox: Op[]): { groups: Group[]; lost: { id: string; name: string }[] } {
  const byId = new Map(pulled.map((g) => [g.id, g]))
  const used = new Set<string>()
  const lost: { id: string; name: string }[] = []
  const merged: Group[] = []
  for (const g of local) {
    if (!g.cloud) merged.push(g)
    else if (byId.has(g.id)) {
      merged.push(applyOps(byId.get(g.id)!, outbox))
      used.add(g.id)
    } else {
      lost.push({ id: g.id, name: g.name })
      merged.push(stripCloud(g))
    }
  }
  const fresh = pulled.filter((g) => !used.has(g.id)).map((g) => applyOps(g, outbox))
  return { groups: [...fresh, ...merged], lost }
}

/**
 * Apply one Realtime row change. Returns null when the group isn't on this device yet (caller should pull).
 * Rows with a queued local op are skipped: the local edit is newer and is about to be sent.
 */
export function applyRemoteRow(groups: Group[], kind: Kind, row: PersonRow | ExpenseRow | SettlementRow, outbox: Op[]): Group[] | null {
  const g = groups.find((x) => x.id === row.group_id && x.cloud)
  if (!g) return null
  if (outbox.some((op) => op.kind === kind && op.groupId === row.group_id && op.id === row.id)) return groups
  const local = row.deleted ? null : rowToLocal(kind, row)
  if (!row.deleted && local === null) return groups
  const next = applyOne(g, kind, row.id, local)
  return groups.map((x) => (x === g ? next : x))
}

