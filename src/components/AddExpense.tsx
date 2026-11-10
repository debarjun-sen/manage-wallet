import { useState } from 'react'
import { formatINR } from '../lib/money'
import { MAX_MESSAGE_LENGTH, parseMessage, SAMPLE_MESSAGES, type ParsedMessage } from '../lib/parser'
import type { Expense, Group } from '../lib/types'
import { prettyDate } from '../lib/util'
import { ExpenseForm, type ExpenseDraft } from './ExpenseForm'
import { Button, Card, Icon } from './ui'

interface Props {
  group: Group
  onSave: (e: Omit<Expense, 'id'>) => void
}

export function AddExpense({ group, onSave }: Props) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedMessage | null>(null)
  const [draft, setDraft] = useState<ExpenseDraft | undefined>(undefined)
  const [formKey, setFormKey] = useState(0)

  const runParse = (t: string) => {
    const p = parseMessage(t)
    setParsed(p)
    setDraft({
      description: p.payee ?? '',
      amount: p.amount,
      date: p.date,
      source: 'pasted',
    })
    setFormKey((k) => k + 1)
  }

  const pasteClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) {
        setText(t)
        runParse(t)
      }
    } catch {
      /* clipboard blocked — user can paste manually */
    }
  }

  const clear = () => {
    setText('')
    setParsed(null)
    setDraft(undefined)
    setFormKey((k) => k + 1)
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white ring-0 dark:from-violet-700 dark:to-fuchsia-700 dark:ring-0">
        <div className="mb-1 flex items-center gap-2 text-xl font-extrabold"><Icon name="clipboard" className="h-6 w-6" />Paste SMS / UPI message</div>
        <p className="mb-3 text-violet-100">Paste a bank SMS or GPay / PhonePe message — we'll fill in the expense for you.</p>
        <textarea
          className="w-full rounded-2xl border-0 bg-white/95 px-4 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-white/50"
          rows={3}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder='e.g. "You paid ₹1,200 to Rahul Kumar via Google Pay"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text')
            if (t) setTimeout(() => runParse(t), 0)
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="bg-white !text-violet-700 hover:bg-violet-50" onClick={() => runParse(text)} disabled={!text.trim()}>
            <Icon name="sparkles" />
            Read message
          </Button>
          <Button variant="ghost" className="!text-white hover:!bg-white/15" onClick={pasteClipboard}>
            Paste from clipboard
          </Button>
          {(text || parsed) && (
            <Button variant="ghost" className="!text-white hover:!bg-white/15" onClick={clear}>
              Clear
            </Button>
          )}
        </div>
        <div className="mt-4 text-sm font-semibold uppercase tracking-wide text-violet-200">Try a sample</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SAMPLE_MESSAGES.map((s) => (
            <button
              key={s.label}
              type="button"
              className="min-h-11 rounded-full bg-white/15 px-4 text-sm font-semibold hover:bg-white/25"
              onClick={() => {
                setText(s.text)
                runParse(s.text)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      {parsed && (
        <div
          role="status"
          className={`rounded-2xl px-4 py-3 text-base font-semibold ring-1 ${
            parsed.ok
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30'
              : 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30'
          }`}
        >
          {parsed.ok ? 'Got it! ' : "Couldn't read everything — fill in the rest below. "}
          <span className="font-normal">
            {[
              parsed.amount !== undefined && formatINR(parsed.amount),
              parsed.payee && `to ${parsed.payee}`,
              parsed.date && prettyDate(parsed.date),
              parsed.method && `via ${parsed.method}`,
            ]
              .filter(Boolean)
              .join(' · ') || 'Nothing recognised'}
          </span>
          {parsed.ok && <div className="mt-1 font-normal">Now pick who paid and how to split, then save.</div>}
        </div>
      )}

      <Card>
        <div className="mb-4 text-xl font-extrabold">{parsed ? 'Review & save' : 'Or add manually'}</div>
        <ExpenseForm key={formKey} group={group} initial={draft} onSave={(e) => { onSave(e); clear() }} />
      </Card>
    </div>
  )
}
