import { useMemo, useState, type FormEvent } from 'react'
import { categorize } from '../lib/category'
import { formatINR, paiseToInput, toPaise } from '../lib/money'
import { buildSplits, equalSplit } from '../lib/splits'
import type { Expense, Group, SplitMode } from '../lib/types'
import { todayISO } from '../lib/util'
import { Button, Chip, Icon, inputCls, Label } from './ui'

export interface ExpenseDraft {
  description?: string
  amount?: number
  date?: string
  paidBy?: string
  splits?: Expense['splits']
  splitMode?: SplitMode
  source?: Expense['source']
}

interface Props {
  group: Group
  initial?: ExpenseDraft
  submitLabel?: string
  onSave: (e: Omit<Expense, 'id'>) => void
  onCancel?: () => void
}

const MODES: { key: SplitMode; label: string }[] = [
  { key: 'equal', label: 'Equal' },
  { key: 'exact', label: '₹ Exact' },
  { key: 'percent', label: '% Percent' },
]

function initialValues(mode: SplitMode, amount: number, splits: Expense['splits'] | undefined): Record<string, string> {
  const v: Record<string, string> = {}
  if (!splits || mode === 'equal') return v
  for (const s of splits) v[s.memberId] = mode === 'exact' ? paiseToInput(s.share) : String(+((s.share / amount) * 100).toFixed(2))
  return v
}

export function ExpenseForm({ group, initial, submitLabel = 'Add expense', onSave, onCancel }: Props) {
  const allIds = group.members.map((m) => m.id)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(initial?.amount ? paiseToInput(initial.amount) : '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? group.members[0]?.id ?? '')
  const [selected, setSelected] = useState<string[]>(
    initial?.splits ? initial.splits.map((s) => s.memberId).filter((id) => allIds.includes(id)) : allIds,
  )
  const [mode, setMode] = useState<SplitMode>(initial?.splitMode ?? 'equal')
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(initial?.splitMode ?? 'equal', initial?.amount ?? 1, initial?.splits),
  )
  const [submitted, setSubmitted] = useState(false)

  const amountPaise = toPaise(amount) ?? 0
  const orderedSelected = allIds.filter((id) => selected.includes(id))
  const result = useMemo(() => buildSplits(mode, amountPaise, orderedSelected, values), [mode, amountPaise, orderedSelected.join(), values])
  const cat = categorize(description)

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const switchMode = (m: SplitMode) => {
    setMode(m)
    if (m === 'equal' || orderedSelected.length === 0) return
    // Pre-fill with an even split so the user only tweaks what differs.
    const eq = equalSplit(amountPaise, orderedSelected)
    const v: Record<string, string> = {}
    if (m === 'exact') eq.forEach((s) => (v[s.memberId] = amountPaise ? paiseToInput(s.share) : ''))
    else {
      const n = orderedSelected.length
      const base = Math.floor((100 / n) * 100) / 100
      orderedSelected.forEach((id, i) => (v[id] = String(i === n - 1 ? +(100 - base * (n - 1)).toFixed(2) : base)))
    }
    setValues(v)
  }

  let status: { text: string; bad: boolean } | null = null
  if (amountPaise > 0 && orderedSelected.length > 0) {
    if (mode === 'equal') {
      const eq = equalSplit(amountPaise, orderedSelected)
      status = { text: `${formatINR(eq[eq.length - 1].share)} each · ${orderedSelected.length} ${orderedSelected.length === 1 ? 'person' : 'people'}`, bad: false }
    } else if (mode === 'exact') {
      const sum = orderedSelected.reduce((s, id) => s + (toPaise(values[id] ?? '') ?? 0), 0)
      const left = amountPaise - sum
      status = { text: left === 0 ? '✓ Shares match the total' : left > 0 ? `${formatINR(left)} left to assign` : `${formatINR(-left)} over the total`, bad: left !== 0 }
    } else {
      const sum = orderedSelected.reduce((s, id) => s + (Number(values[id]) || 0), 0)
      const left = +(100 - sum).toFixed(2)
      status = { text: Math.abs(left) < 0.001 ? '✓ Adds up to 100%' : left > 0 ? `${left}% left to assign` : `${-left}% over 100%`, bad: Math.abs(left) >= 0.001 }
    }
  }

  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    setSubmitted(true)
    if (!description.trim() || !paidBy || !result.ok) return
    onSave({
      description: description.trim(),
      amount: amountPaise,
      paidBy,
      splits: result.splits,
      date: date || todayISO(),
      source: initial?.source ?? 'manual',
      splitMode: mode,
    })
  }

  const descMissing = submitted && !description.trim()
  const error = !result.ok ? result.error : null

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-[1fr_auto]">
        <div>
          <Label>Amount</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">₹</span>
            <input
              className={`${inputCls} pl-10 text-3xl font-bold`}
              inputMode="decimal"
              placeholder="0"
              value={amount}
              autoFocus={!initial}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
              aria-label="Amount in rupees"
            />
          </div>
        </div>
        <div>
          <Label>Date</Label>
          <input type="date" aria-label="Date" className={`${inputCls} h-[60px] min-[420px]:w-44`} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>What for?</Label>
        <div className="relative">
          <input
            className={`${inputCls} pr-32`}
            placeholder="Pizza night, cab to station…"
            maxLength={80}
            value={description}
            aria-label="Description"
            aria-invalid={descMissing}
            aria-describedby={descMissing ? 'desc-error' : undefined}
            onChange={(e) => setDescription(e.target.value)}
          />
          {description.trim() && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
              <span aria-hidden="true">{cat.emoji}</span> {cat.label}
            </span>
          )}
        </div>
        {descMissing && (
          <p id="desc-error" className="mt-2 font-semibold text-rose-700 dark:text-rose-300">
            Add a short description, e.g. "Pizza night".
          </p>
        )}
      </div>

      <div>
        <Label>Who paid?</Label>
        <div className="flex flex-wrap gap-2">
          {group.members.map((m) => (
            <Chip key={m.id} active={paidBy === m.id} onClick={() => setPaidBy(m.id)}>
              {m.name}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>Split between</Label>
          <button type="button" className="mb-2 min-h-11 px-2 text-sm font-semibold text-violet-700 dark:text-violet-300" onClick={() => setSelected(selected.length === allIds.length ? [] : allIds)}>
            {selected.length === allIds.length ? 'Clear' : 'Everyone'}
          </button>
        </div>
        <div className="mb-3 inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => switchMode(m.key)}
              className={`rounded-xl px-4 py-2 font-semibold transition ${mode === m.key ? 'bg-white text-violet-700 shadow dark:bg-slate-950 dark:text-violet-300' : 'text-slate-500'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {group.members.map((m) => {
            const on = selected.includes(m.id)
            return (
              <div key={m.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ring-1 ${on ? 'ring-violet-300 dark:ring-violet-700' : 'opacity-60 ring-slate-200 dark:ring-slate-800'}`}>
                <label className="flex flex-1 cursor-pointer items-center gap-3 text-lg font-medium">
                  <input type="checkbox" checked={on} onChange={() => toggle(m.id)} className="h-5 w-5 accent-violet-600" />
                  {m.name}
                </label>
                {on && mode !== 'equal' && (
                  <div className="relative w-32">
                    {mode === 'exact' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>}
                    <input
                      className={`${inputCls} py-2 text-right ${mode === 'exact' ? 'pl-7' : 'pr-8'}`}
                      inputMode="decimal"
                      value={values[m.id] ?? ''}
                      placeholder="0"
                      onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                      aria-label={`${m.name} share`}
                    />
                    {mode === 'percent' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {status && (
          <div className={`mt-3 text-base font-semibold ${status.bad ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{status.text}</div>
        )}
      </div>

      {submitted && error && (
        <div role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
          <Icon name="alert" className="mr-1 inline h-5 w-5 align-[-3px]" />
          {error}
        </div>
      )}

      <div className="flex gap-3">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" className="flex-[2] py-4 text-lg">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
