import { useEffect, useState } from 'react'
import type { CloudStatus, SyncEngine } from '../../cloud/engine'
import type { PushState } from '../../cloud/push'
import { Button, Card, Icon, inputCls, Label } from '../ui'
import { ErrorNote, errText, SignIn } from './SignIn'

export function SyncLine({ status }: { status: CloudStatus }) {
  const text = !status.online
    ? `Offline${status.pending ? ` · ${status.pending} change${status.pending > 1 ? 's' : ''} waiting` : ''}`
    : status.error
      ? status.error
      : status.syncing || status.pending
        ? 'Syncing…'
        : status.lastSync
          ? `Synced ${new Date(status.lastSync).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
          : 'Connected'
  const dot = !status.online || status.error ? 'bg-amber-500' : status.syncing || status.pending ? 'bg-sky-500' : 'bg-emerald-500'
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
      {text}
    </span>
  )
}

const PUSH_HELP: Record<PushState, string> = {
  on: 'You get a notification when someone in your shared groups adds an expense or records a payment.',
  off: 'Get notified when someone in your shared groups adds an expense or records a payment.',
  denied: 'Notifications are blocked for this app. Allow them in your browser or phone settings, then come back.',
  'needs-install': 'On iPhone and iPad, notifications only work after you add Manage Wallet to your Home Screen (Share → Add to Home Screen) and open it from there.',
  unsupported: 'Notifications aren’t available here. Use the installed app on a phone, or the production site in Chrome, Edge, Firefox or Safari.',
}

export function Account({ engine, status, notify, onJoin }: { engine: SyncEngine; status: CloudStatus; notify: (msg: string) => void; onJoin: () => void }) {
  const [name, setName] = useState(status.user?.displayName ?? '')
  const [push, setPush] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setName(status.user?.displayName ?? ''), [status.user?.displayName])
  useEffect(() => {
    if (status.user) void engine.pushState().then(setPush)
  }, [engine, status.user])

  if (!status.ready) return <p className="pt-6 text-center text-slate-500">Loading…</p>

  if (!status.user) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-black">Sign in</h1>
        <Card>
          <p className="mb-5 text-lg text-slate-600 dark:text-slate-400">
            Sign in to share a group with friends, join theirs, and keep shared groups in sync on all your phones. Groups you don’t share stay only on this device.
          </p>
          <SignIn engine={engine} />
        </Card>
      </div>
    )
  }

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

  const togglePush = () =>
    run(async () => {
      if (push === 'on') {
        await engine.disablePush()
        setPush('off')
        notify('Notifications off')
      } else {
        const s = await engine.enablePush()
        setPush(s)
        if (s === 'on') notify('Notifications on')
      }
    })

  const signOut = () => {
    const warn = status.pending ? `\n\n${status.pending} change(s) haven’t synced yet and will be lost.` : ''
    if (!confirm(`Sign out? Shared groups will be removed from this device; they stay in your account.${warn}`)) return
    void run(async () => {
      await engine.signOut()
      notify('Signed out')
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-black">Account</h1>
      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Signed in as</div>
            <div className="truncate text-xl font-extrabold">{status.user.email}</div>
            <SyncLine status={status} />
          </div>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const n = name.trim()
              if (!n) return setError('Enter a name your friends will recognise.')
              void run(async () => {
                await engine.setDisplayName(n)
                notify('Name saved')
              })
            }}
          >
            <Label>Your name (shown to your groups)</Label>
            <div className="flex gap-2">
              <input className={`${inputCls} flex-1`} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={busy || name.trim() === status.user.displayName}>
                Save
              </Button>
            </div>
          </form>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <Icon name="bell" className="mt-1 h-6 w-6 text-violet-600 dark:text-violet-400" />
          <div className="flex flex-1 flex-col gap-3">
            <div className="text-xl font-extrabold">Notifications</div>
            <p className="text-slate-600 dark:text-slate-400">{push ? PUSH_HELP[push] : 'Checking…'}</p>
            {(push === 'on' || push === 'off') && (
              <Button variant={push === 'on' ? 'ghost' : 'primary'} disabled={busy} onClick={() => void togglePush()}>
                {push === 'on' ? 'Turn off on this device' : 'Turn on notifications'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Button variant="secondary" className="py-4 text-lg" onClick={onJoin}>
        <Icon name="link" />
        Join a group with a code
      </Button>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button variant="danger" onClick={signOut} disabled={busy}>
        <Icon name="logout" />
        Sign out
      </Button>
    </div>
  )
}
