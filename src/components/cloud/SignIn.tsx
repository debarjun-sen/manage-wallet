import { useState, type FormEvent } from 'react'
import type { SyncEngine } from '../../cloud/engine'
import { Button, Icon, inputCls, Label } from '../ui'

export function ErrorNote({ children }: { children: string }) {
  return (
    <div role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
      <Icon name="alert" className="mr-1 inline h-5 w-5 align-[-3px]" />
      {children}
    </div>
  )
}

const errText = (e: unknown) => {
  const msg = e instanceof Error ? e.message : ''
  if (!msg) return 'Something went wrong. Try again.'
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'Can’t reach the server. Check your connection and try again.'
  return msg
}
export { errText }

/**
 * Email + one-time code. A code (not a magic link) is used on purpose: on iOS a link opens in Safari,
 * which has separate storage from the Home Screen app, so the installed app would never get signed in.
 */
export function SignIn({ engine }: { engine: SyncEngine }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const send = (e: FormEvent) => {
    e.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return setError('Enter a valid email address.')
    void run(async () => {
      await engine.sendCode(addr)
      setEmail(addr)
      setStep('code')
    })
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    const token = code.replace(/\s/g, '')
    if (!/^\d{6,10}$/.test(token)) return setError('Enter the code from the email.')
    void run(() => engine.verifyCode(email, token))
  }

  if (step === 'email') {
    return (
      <form onSubmit={send} className="flex flex-col gap-4">
        <div>
          <Label>Email</Label>
          <input className={inputCls} type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" disabled={busy} className="py-4 text-lg">
          {busy ? 'Sending…' : 'Email me a sign-in code'}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      <p className="text-slate-600 dark:text-slate-400">
        We sent a code to <span className="font-semibold text-slate-900 dark:text-slate-100">{email}</span>. It can take a minute; check spam too.
      </p>
      <div>
        <Label>Code</Label>
        <input
          className={`${inputCls} text-center text-2xl tracking-[0.4em]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={12}
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ''))}
          autoFocus
        />
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" disabled={busy} className="py-4 text-lg">
        {busy ? 'Checking…' : 'Sign in'}
      </Button>
      <Button variant="ghost" onClick={() => (setStep('email'), setCode(''), setError(null))}>
        Use a different email
      </Button>
    </form>
  )
}
