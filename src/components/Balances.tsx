import { useMemo } from 'react'
import { computeBalances } from '../lib/balances'
import { formatINR } from '../lib/money'
import { minCashFlow, type Transfer } from '../lib/settle'
import { downloadCsv, memberName, upiLink, whatsappUrl } from '../lib/share'
import type { Group } from '../lib/types'
import { Avatar, Button, Card, Empty, Icon } from './ui'

interface Props {
  group: Group
  onSettle: (t: Transfer) => void
  onAdd: () => void
}

export function Balances({ group, onSettle, onAdd }: Props) {
  const balances = useMemo(() => computeBalances(group), [group])
  const transfers = useMemo(() => minCashFlow(balances), [balances])
  const total = group.expenses.reduce((s, e) => s + e.amount, 0)
  const maxAbs = Math.max(1, ...Object.values(balances).map(Math.abs))

  if (group.expenses.length === 0) {
    return (
      <Empty emoji="🧾" title="No expenses yet">
        <p className="max-w-sm text-slate-500 dark:text-slate-400">Add the first expense — or paste a UPI / bank SMS — and we'll work out who owes whom.</p>
        <Button onClick={onAdd} className="mt-2">
          <Icon name="plus" />
          Add first expense
        </Button>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Card className="!p-4">
          <div className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total spent</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums">{formatINR(total)}</div>
        </Card>
        <Card className="!p-4">
          <div className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Per person</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums">{formatINR(Math.round(total / Math.max(1, group.members.length)))}</div>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-2xl font-extrabold">Who pays whom</h2>
        {transfers.length === 0 ? (
          <Card className="text-center">
            <div className="text-5xl" aria-hidden="true">🎉</div>
            <div className="mt-2 text-2xl font-extrabold">All settled up!</div>
            <p className="text-slate-500 dark:text-slate-400">Nobody owes anything. Go plan the next trip.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {transfers.map((t) => {
              const receiver = group.members.find((m) => m.id === t.to)
              const link = receiver ? upiLink(receiver, t.amount) : null
              return (
                <Card key={`${t.from}-${t.to}`} className="!p-4">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 text-xl leading-snug sm:text-2xl">
                      <span className="font-extrabold">{memberName(group, t.from)}</span>
                      <span className="text-slate-500 dark:text-slate-400"> pays </span>
                      <span className="font-extrabold">{memberName(group, t.to)}</span>
                    </div>
                    <div className="text-2xl font-black tabular-nums text-violet-600 sm:text-3xl dark:text-violet-300">{formatINR(t.amount)}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {link ? (
                      <a
                        href={link}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 font-semibold text-white shadow-sm shadow-violet-600/30 hover:bg-violet-700"
                      >
                        <Icon name="zap" />
                        Pay via UPI
                      </a>
                    ) : (
                      <span className="inline-flex flex-1 items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        No UPI ID for {receiver?.name}
                      </span>
                    )}
                    <Button variant="secondary" className="flex-1" onClick={() => onSettle(t)}>
                      <Icon name="check" />
                      Mark as settled
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-2xl font-extrabold">Balances</h2>
        <Card className="!p-2">
          {group.members.map((m) => {
            const v = balances[m.id] ?? 0
            const pct = (Math.abs(v) / maxAbs) * 100
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-2xl p-3">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-lg font-bold">{m.name}</span>
                    <span
                      className={`text-lg font-extrabold tabular-nums ${v > 0 ? 'text-emerald-600 dark:text-emerald-400' : v < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                      {v > 0 ? `gets back ${formatINR(v)}` : v < 0 ? `owes ${formatINR(-v)}` : 'settled up'}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${v >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            )
          })}
        </Card>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <a
          href={whatsappUrl(group)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#128C7E] px-4 py-3 font-semibold text-white shadow-sm hover:brightness-95"
        >
          <Icon name="message" />
          Share on WhatsApp
        </a>
        <Button variant="secondary" onClick={() => downloadCsv(group)}>
          <Icon name="download" />
          Export CSV
        </Button>
      </div>
    </div>
  )
}
