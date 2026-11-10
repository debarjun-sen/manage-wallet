import { useMemo, useState } from 'react'
import { categorize } from '../lib/category'
import { formatINR, paiseToInput, toPaise } from '../lib/money'
import type { AppState } from '../lib/types'
import { Card, inputCls, Label } from './ui'

interface Props {
  state: AppState
  setBudget: (paise: number) => void
  setMe: (name: string) => void
}

export function Personal({ state, setBudget, setMe }: Props) {
  const [budgetText, setBudgetText] = useState(state.budget ? paiseToInput(state.budget) : '')
  const names = useMemo(
    () => [...new Set(state.groups.flatMap((g) => g.members.map((m) => m.name)))].sort((a, b) => a.localeCompare(b)),
    [state.groups],
  )

  const now = new Date()
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - now.getDate() + 1 // including today

  const { spent, byCat } = useMemo(() => {
    let spent = 0
    const byCat = new Map<string, { emoji: string; label: string; amt: number }>()
    const me = state.me.trim().toLowerCase()
    if (!me) return { spent, byCat: [] as { emoji: string; label: string; amt: number }[] }
    for (const g of state.groups) {
      const ids = new Set(g.members.filter((m) => m.name.trim().toLowerCase() === me).map((m) => m.id))
      for (const e of g.expenses) {
        if (!e.date.startsWith(monthPrefix)) continue
        const share = e.splits.filter((s) => ids.has(s.memberId)).reduce((a, s) => a + s.share, 0)
        if (!share) continue
        spent += share
        const c = categorize(e.description)
        const cur = byCat.get(c.key) ?? { emoji: c.emoji, label: c.label, amt: 0 }
        cur.amt += share
        byCat.set(c.key, cur)
      }
    }
    return { spent, byCat: [...byCat.values()].sort((a, b) => b.amt - a.amt) }
  }, [state.groups, state.me, monthPrefix])

  const remaining = state.budget - spent
  const safeToday = remaining > 0 ? Math.floor(remaining / daysLeft) : 0
  const usedPct = state.budget > 0 ? Math.min(100, (spent / state.budget) * 100) : 0

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-black">My month</h1>

      <Card className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-center text-white ring-0 dark:ring-0">
        <div className="text-lg font-semibold text-violet-100">Safe to spend today</div>
        <div className="my-1 text-6xl font-black tabular-nums">{state.budget > 0 ? formatINR(safeToday) : '—'}</div>
        <div className="text-violet-100">
          {state.budget > 0
            ? remaining > 0
              ? `${formatINR(remaining)} left · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to go`
              : `Over budget by ${formatINR(-remaining)} 😬`
            : 'Set a monthly budget below to see this.'}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <Label>Monthly budget</Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-400">₹</span>
            <input
              className={`${inputCls} pl-10 text-2xl font-bold`}
              inputMode="decimal"
              placeholder="8000"
              value={budgetText}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.,]/g, '')
                setBudgetText(v)
                setBudget(toPaise(v) ?? 0)
              }}
            />
          </div>
        </div>
        <div>
          <Label>Who are you?</Label>
          {names.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">Create a group first — your share of group expenses counts toward your budget.</p>
          ) : (
            <select className={inputCls} value={state.me} onChange={(e) => setMe(e.target.value)}>
              <option value="">Pick your name…</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </div>
        {state.budget > 0 && (
          <div>
            <div className="mb-1 flex justify-between text-sm font-semibold text-slate-500 dark:text-slate-400">
              <span>Spent this month: {formatINR(spent)}</span>
              <span>{Math.round(usedPct)}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-full rounded-full ${usedPct >= 100 ? 'bg-rose-500' : usedPct > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usedPct}%` }} />
            </div>
          </div>
        )}
      </Card>

      {byCat.length > 0 && (
        <Card>
          <Label>Where it went (your share)</Label>
          <div className="flex flex-col gap-3">
            {byCat.map((c) => (
              <div key={c.label} className="flex items-center gap-3">
                <span className="text-2xl">{c.emoji}</span>
                <div className="flex-1">
                  <div className="flex justify-between font-semibold">
                    <span>{c.label}</span>
                    <span className="tabular-nums">{formatINR(c.amt)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${(c.amt / Math.max(1, spent)) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
