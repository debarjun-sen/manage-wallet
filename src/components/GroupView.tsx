import { useState } from 'react'
import { formatINR } from '../lib/money'
import { memberName } from '../lib/share'
import type { Group } from '../lib/types'
import { todayISO, uid } from '../lib/util'
import { AddExpense } from './AddExpense'
import { Balances } from './Balances'
import { History } from './History'
import { Icon, type IconName } from './ui'

type Tab = 'balances' | 'add' | 'history'

interface Props {
  group: Group
  onBack: () => void
  update: (fn: (g: Group) => Group) => void
  onDelete: () => void
  notify: (msg: string) => void
}

export function GroupView({ group, onBack, update, onDelete, notify }: Props) {
  const [tab, setTab] = useState<Tab>(group.expenses.length === 0 ? 'add' : 'balances')

  const tabs: { key: Tab; label: string; icon: IconName }[] = [
    { key: 'balances', label: 'Balances', icon: 'scale' },
    { key: 'add', label: 'Add', icon: 'plus' },
    { key: 'history', label: 'History', icon: 'clock' },
  ]

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="Back to groups">
          <Icon name="back" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-black">{group.name}</h1>
          <div className="truncate text-slate-500 dark:text-slate-400">{group.members.map((m) => m.name).join(', ')}</div>
        </div>
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
          onClick={() => confirm(`Delete group "${group.name}" and all its expenses?`) && onDelete()}
        >
          <Icon name="trash" className="h-4 w-4" />
          Delete
        </button>
      </div>

      <div className="sticky top-0 z-10 -mx-4 mb-5 bg-slate-50/90 px-4 py-2 backdrop-blur dark:bg-slate-950/90">
        <div role="tablist" aria-label="Group sections" className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-base font-bold transition sm:text-lg ${tab === t.key ? 'bg-white text-violet-700 shadow dark:bg-slate-950 dark:text-violet-300' : 'text-slate-600 dark:text-slate-400'}`}
            >
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'balances' && (
        <Balances
          group={group}
          onAdd={() => setTab('add')}
          onSettle={(t) => {
            update((g) => ({ ...g, settlements: [...g.settlements, { id: uid(), from: t.from, to: t.to, amount: t.amount, date: todayISO() }] }))
            notify(`${memberName(group, t.from)} paid ${memberName(group, t.to)} ${formatINR(t.amount)}`)
          }}
        />
      )}
      {tab === 'add' && (
        <AddExpense
          group={group}
          onSave={(e) => {
            update((g) => ({ ...g, expenses: [...g.expenses, { ...e, id: uid() }] }))
            notify(`Added ${formatINR(e.amount)} · ${e.description}`)
            setTab('balances')
          }}
        />
      )}
      {tab === 'history' && (
        <History
          group={group}
          onUpdateExpense={(e) => {
            update((g) => ({ ...g, expenses: g.expenses.map((x) => (x.id === e.id ? e : x)) }))
            notify('Expense updated')
          }}
          onDeleteExpense={(id) => {
            update((g) => ({ ...g, expenses: g.expenses.filter((x) => x.id !== id) }))
            notify('Expense deleted')
          }}
          onUpdateSettlement={(s) => {
            update((g) => ({ ...g, settlements: g.settlements.map((x) => (x.id === s.id ? s : x)) }))
            notify('Settlement updated')
          }}
          onDeleteSettlement={(id) => {
            update((g) => ({ ...g, settlements: g.settlements.filter((x) => x.id !== id) }))
            notify('Settlement deleted')
          }}
        />
      )}
    </div>
  )
}
