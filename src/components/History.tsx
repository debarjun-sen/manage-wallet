import { useState } from 'react'
import { categorize } from '../lib/category'
import { formatINR, paiseToInput, toPaise } from '../lib/money'
import { memberName } from '../lib/share'
import type { Expense, Group, Settlement } from '../lib/types'
import { prettyDate } from '../lib/util'
import { ExpenseForm } from './ExpenseForm'
import { Button, Card, Empty, Icon, inputCls } from './ui'

interface Props {
  group: Group
  onUpdateExpense: (e: Expense) => void
  onDeleteExpense: (id: string) => void
  onUpdateSettlement: (s: Settlement) => void
  onDeleteSettlement: (id: string) => void
}

type Item = { kind: 'expense'; e: Expense; order: number } | { kind: 'settlement'; s: Settlement; order: number }

export function History({ group, onUpdateExpense, onDeleteExpense, onUpdateSettlement, onDeleteSettlement }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [settleAmt, setSettleAmt] = useState('')

  const items: Item[] = [
    ...group.expenses.map((e, i) => ({ kind: 'expense' as const, e, order: i })),
    ...group.settlements.map((s, i) => ({ kind: 'settlement' as const, s, order: i + 0.5 })),
  ].sort((a, b) => {
    const da = a.kind === 'expense' ? a.e.date : a.s.date
    const db = b.kind === 'expense' ? b.e.date : b.s.date
    return db.localeCompare(da) || b.order - a.order
  })

  const editingExpense = group.expenses.find((e) => e.id === editing)
  if (editingExpense) {
    return (
      <Card>
        <div className="mb-4 text-xl font-extrabold">Edit expense</div>
        <ExpenseForm
          group={group}
          initial={editingExpense}
          submitLabel="Save changes"
          onCancel={() => setEditing(null)}
          onSave={(e) => {
            onUpdateExpense({ ...e, id: editingExpense.id })
            setEditing(null)
          }}
        />
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <Empty emoji="🕰️" title="Nothing here yet">
        <p className="text-slate-500 dark:text-slate-400">Expenses and settle-ups will show up here, newest first.</p>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => {
        if (it.kind === 'expense') {
          const e = it.e
          const cat = categorize(e.description)
          return (
            <Card key={e.id} className="!p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-2xl dark:bg-violet-500/15" aria-hidden="true">{cat.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="truncate text-lg font-bold">{e.description}</div>
                    <div className="text-lg font-extrabold tabular-nums">{formatINR(e.amount)}</div>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {memberName(group, e.paidBy)} paid · split {e.splits.length} {e.splits.length === 1 ? 'way' : 'ways'}
                    {e.splitMode && e.splitMode !== 'equal' ? ` (${e.splitMode === 'exact' ? 'exact' : '%'})` : ''}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    {prettyDate(e.date)}
                    {e.source === 'pasted' && <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 font-semibold text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">from message</span>}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-1">
                <Button variant="ghost" className="!px-3" onClick={() => setEditing(e.id)}>
                  <Icon name="pencil" className="h-4 w-4" />
                  Edit
                </Button>
                <Button variant="danger" className="!px-3" onClick={() => confirm(`Delete "${e.description}"?`) && onDeleteExpense(e.id)}>
                  <Icon name="trash" className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </Card>
          )
        }
        const s = it.s
        const isEditing = editing === s.id
        return (
          <Card key={s.id} className="!bg-emerald-50 !p-4 !ring-emerald-200 dark:!bg-emerald-500/10 dark:!ring-emerald-500/30">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"><Icon name="check" className="h-6 w-6" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold">
                  {memberName(group, s.from)} paid {memberName(group, s.to)}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Settle-up · {prettyDate(s.date)}</div>
              </div>
              {!isEditing && <div className="text-lg font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">{formatINR(s.amount)}</div>}
            </div>
            {isEditing ? (
              <div className="mt-3 flex gap-2">
                <input className={`${inputCls} py-2`} inputMode="decimal" value={settleAmt} onChange={(e) => setSettleAmt(e.target.value)} aria-label="Settlement amount" autoFocus />
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button
                  variant="success"
                  onClick={() => {
                    const p = toPaise(settleAmt)
                    if (p && p > 0) {
                      onUpdateSettlement({ ...s, amount: p })
                      setEditing(null)
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            ) : (
              <div className="mt-2 flex justify-end gap-1">
                <Button
                  variant="ghost"
                  className="!px-3"
                  onClick={() => {
                    setSettleAmt(paiseToInput(s.amount))
                    setEditing(s.id)
                  }}
                >
                  <Icon name="pencil" className="h-4 w-4" />
                  Edit
                </Button>
                <Button variant="danger" className="!px-3" onClick={() => confirm('Delete this settlement?') && onDeleteSettlement(s.id)}>
                  <Icon name="trash" className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
