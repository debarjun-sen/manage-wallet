import { describe, expect, it } from 'vitest'
import { computeBalances } from './balances'
import { equalSplit } from './splits'
import {
  applyOps,
  applyRemoteRow,
  buildGroups,
  diffGroup,
  enqueue,
  mergePulled,
  opToRow,
  rowToExpense,
  type ExpenseRow,
  type Op,
} from './sync'
import type { Expense, Group } from './types'

const people = [
  { id: 'a', name: 'Asha', upiId: 'asha@okaxis' },
  { id: 'b', name: 'Bala' },
]
const exp = (id: string, amount = 1000): Expense => ({
  id,
  description: `Item ${id}`,
  amount,
  paidBy: 'a',
  splits: equalSplit(amount, ['a', 'b']),
  date: '2026-11-20',
  source: 'manual',
  splitMode: 'equal',
})
const group = (over: Partial<Group> = {}): Group => ({
  id: 'g1',
  name: 'Flat',
  members: people,
  expenses: [exp('e1')],
  settlements: [],
  createdAt: '2026-11-01T00:00:00Z',
  cloud: { role: 'admin', inviteCode: 'ABCD2345', memberId: 'a' },
  ...over,
})

describe('diffGroup', () => {
  it('produces no ops for identical content, even with different key order', () => {
    const g = group()
    const reordered = { ...g, expenses: [{ splitMode: 'equal' as const, ...exp('e1') }] }
    expect(diffGroup(g, reordered)).toEqual([])
  })

  it('detects add, edit and delete across collections, people first', () => {
    const prev = group({ expenses: [exp('e1'), exp('e2')] })
    const next = {
      ...prev,
      members: [...people, { id: 'c', name: 'Chen' }],
      expenses: [{ ...exp('e1'), description: 'Rent' }, exp('e3')],
      settlements: [{ id: 's1', from: 'b', to: 'a', amount: 500, date: '2026-11-21' }],
    }
    const ops = diffGroup(prev, next).map((o) => [o.kind, o.id, o.row === null ? 'del' : o.isNew ? 'new' : 'edit'])
    expect(ops).toEqual([
      ['people', 'c', 'new'],
      ['expenses', 'e1', 'edit'],
      ['expenses', 'e3', 'new'],
      ['expenses', 'e2', 'del'],
      ['settlements', 's1', 'new'],
    ])
  })
})

describe('enqueue', () => {
  const add: Op = { kind: 'expenses', groupId: 'g1', id: 'e9', row: exp('e9'), isNew: true }
  it('merges repeated edits of the same row and keeps isNew', () => {
    const q = enqueue(enqueue([], [add]), [{ ...add, row: exp('e9', 2000), isNew: false }])
    expect(q).toHaveLength(1)
    expect(q[0].isNew).toBe(true)
    expect((q[0].row as Expense).amount).toBe(2000)
  })
  it('cancels an add that is deleted before it was sent', () => {
    expect(enqueue([add], [{ ...add, row: null, isNew: false }])).toEqual([])
  })
  it('never touches ops that are already being sent', () => {
    const q = enqueue([add], [{ ...add, row: null, isNew: false }], 1)
    expect(q).toHaveLength(2)
    expect(q[1].row).toBeNull()
  })
})

describe('row mapping', () => {
  it('round-trips an expense through the server row shape', () => {
    const e = exp('e1', 1001)
    const row = opToRow({ kind: 'expenses', groupId: 'g1', id: e.id, row: e, isNew: true }) as unknown as ExpenseRow
    expect(row.group_id).toBe('g1')
    expect(rowToExpense(row)).toEqual(e)
  })
  it('accepts bigint amounts returned as numbers and timestamps as dates', () => {
    const e = rowToExpense({ group_id: 'g', id: 'x', description: 'Tea', amount: 2000, paid_by: 'a', splits: [{ memberId: 'a', share: 2000 }], date: '2026-11-20', source: 'pasted', split_mode: null })
    expect(e).toEqual({ id: 'x', description: 'Tea', amount: 2000, paidBy: 'a', splits: [{ memberId: 'a', share: 2000 }], date: '2026-11-20', source: 'pasted' })
  })
  it('rejects malformed rows instead of crashing', () => {
    expect(rowToExpense({ group_id: 'g', id: 'x', description: 'Tea', amount: 1.5, paid_by: 'a', splits: [], date: '', source: '', split_mode: null })).toBeNull()
    expect(rowToExpense({ group_id: 'g', id: 'x', description: 'Tea', amount: 100, paid_by: 'a', splits: [{ memberId: 'a', share: '100' }], date: '', source: '', split_mode: null })).toBeNull()
  })
  it('a soft delete only sends the key', () => {
    expect(opToRow({ kind: 'settlements', groupId: 'g1', id: 's1', row: null, isNew: false })).toEqual({ group_id: 'g1', id: 's1', deleted: true })
  })
})

describe('buildGroups', () => {
  it('assembles groups in creation order, skips deleted rows and keeps balances summing to zero', () => {
    const [g] = buildGroups({
      groups: [{ id: 'g1', name: 'Flat', invite_code: 'ABCD2345', created_at: '2026-11-01T00:00:00Z' }],
      memberships: [{ group_id: 'g1', role: 'member', member_id: 'b' }],
      people: [
        { group_id: 'g1', id: 'a', name: 'Asha', upi_id: 'asha@okaxis' },
        { group_id: 'g1', id: 'b', name: 'Bala', upi_id: null },
      ],
      expenses: [
        { ...(opToRow({ kind: 'expenses', groupId: 'g1', id: 'e2', row: exp('e2'), isNew: true }) as unknown as ExpenseRow), created_at: '2026-11-02T00:00:00Z' },
        { ...(opToRow({ kind: 'expenses', groupId: 'g1', id: 'e1', row: exp('e1'), isNew: true }) as unknown as ExpenseRow), created_at: '2026-11-01T00:00:00Z' },
        { ...(opToRow({ kind: 'expenses', groupId: 'g1', id: 'e3', row: exp('e3'), isNew: true }) as unknown as ExpenseRow), deleted: true },
      ],
      settlements: [],
    })
    expect(g.cloud).toEqual({ role: 'member', inviteCode: 'ABCD2345', memberId: 'b' })
    expect(g.members).toEqual(people)
    expect(g.expenses.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(Object.values(computeBalances(g)).reduce((s, x) => s + x, 0)).toBe(0)
  })
})

describe('mergePulled', () => {
  it('keeps local-only groups, replays unsynced edits and keeps a copy of groups you lost access to', () => {
    const local = group({ id: 'local', cloud: undefined })
    const gone = group({ id: 'gone', name: 'Old trip' })
    const mine = group()
    const serverCopy = group({ expenses: [] })
    const pending: Op[] = [{ kind: 'expenses', groupId: 'g1', id: 'e7', row: exp('e7'), isNew: true }]
    const brandNew = group({ id: 'g2', name: 'Goa' })
    const { groups, lost } = mergePulled([local, gone, mine], [serverCopy, brandNew], pending)
    expect(groups.map((g) => g.id)).toEqual(['g2', 'local', 'gone', 'g1'])
    expect(groups.find((g) => g.id === 'g1')!.expenses.map((e) => e.id)).toEqual(['e7'])
    expect(groups.find((g) => g.id === 'gone')!.cloud).toBeUndefined()
    expect(lost).toEqual([{ id: 'gone', name: 'Old trip' }])
    expect(groups.find((g) => g.id === 'local')).toBe(local)
  })
})

describe('applyRemoteRow', () => {
  const row = opToRow({ kind: 'expenses', groupId: 'g1', id: 'e5', row: exp('e5'), isNew: true }) as unknown as ExpenseRow
  it('adds, updates and deletes rows of known shared groups', () => {
    const added = applyRemoteRow([group()], 'expenses', row, [])!
    expect(added[0].expenses.map((e) => e.id)).toEqual(['e1', 'e5'])
    const removed = applyRemoteRow(added, 'expenses', { ...row, deleted: true }, [])!
    expect(removed[0].expenses.map((e) => e.id)).toEqual(['e1'])
  })
  it('asks for a pull when the group is unknown, and ignores local-only groups', () => {
    expect(applyRemoteRow([group({ cloud: undefined })], 'expenses', row, [])).toBeNull()
  })
  it('does not overwrite a newer local edit waiting in the outbox', () => {
    const gs = [group()]
    const pending: Op[] = [{ kind: 'expenses', groupId: 'g1', id: 'e5', row: exp('e5', 9999), isNew: true }]
    expect(applyRemoteRow(gs, 'expenses', row, pending)).toBe(gs)
  })
})

describe('applyOps', () => {
  it('only applies ops for the given group', () => {
    const g = group()
    const out = applyOps(g, [
      { kind: 'expenses', groupId: 'other', id: 'x', row: exp('x'), isNew: true },
      { kind: 'expenses', groupId: 'g1', id: 'e1', row: null, isNew: false },
    ])
    expect(out.expenses).toEqual([])
  })
})
