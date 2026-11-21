import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SyncEngine, type CloudStatus } from './cloud/engine'
import { CLOUD_ENABLED } from './cloud/supabase'
import { Account } from './components/cloud/Account'
import { GroupSharing } from './components/cloud/GroupSharing'
import { JoinGroup } from './components/cloud/JoinGroup'
import { GroupView } from './components/GroupView'
import { NewGroup } from './components/NewGroup'
import { Personal } from './components/Personal'
import { Button, Card, Empty, Icon, type IconName } from './components/ui'
import { computeBalances } from './lib/balances'
import { demoState } from './lib/demo'
import { formatINR } from './lib/money'
import { minCashFlow } from './lib/settle'
import { EMPTY_STATE, loadState, saveState } from './lib/storage'
import type { AppState, Group } from './lib/types'

type Route =
  | { name: 'home' }
  | { name: 'personal' }
  | { name: 'new-group' }
  | { name: 'group'; id: string }
  | { name: 'account' }
  | { name: 'join'; code: string }

// Hash routing: the browser / Android back button works and groups are deep-linkable.
function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h === 'personal') return { name: 'personal' }
  if (h === 'new') return { name: 'new-group' }
  const m = /^group\/(.+)$/.exec(h)
  if (m) return { name: 'group', id: decodeURIComponent(m[1]) }
  if (CLOUD_ENABLED) {
    if (h === 'account') return { name: 'account' }
    const j = /^join(?:\/([A-Za-z0-9]{0,16}))?$/.exec(h)
    if (j) return { name: 'join', code: j[1] ?? '' }
  }
  return { name: 'home' }
}

function toHash(r: Route): string {
  switch (r.name) {
    case 'personal':
      return '#/personal'
    case 'new-group':
      return '#/new'
    case 'group':
      return `#/group/${encodeURIComponent(r.id)}`
    case 'account':
      return '#/account'
    case 'join':
      return r.code ? `#/join/${encodeURIComponent(r.code)}` : '#/join'
    default:
      return '#/'
  }
}

const NO_CLOUD: CloudStatus = { ready: true, user: null, online: true, pending: 0, syncing: false, lastSync: null, error: null }
const noSubscribe = () => () => undefined
const noStatus = () => NO_CLOUD

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [route, setRouteState] = useState<Route>(parseHash)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  // All state changes go through `commit`, which works on the latest state synchronously. That lets
  // shared-group edits be diffed exactly once (no double-run React updaters) and handed to the sync engine.
  const stateRef = useRef(state)
  const commit = useCallback((fn: (s: AppState) => AppState) => {
    const next = fn(stateRef.current)
    if (next === stateRef.current) return
    stateRef.current = next
    setState(next)
  }, [])

  const notifyRef = useRef<(msg: string) => void>(() => undefined)
  const [engine] = useState(() =>
    CLOUD_ENABLED
      ? new SyncEngine({
          getGroups: () => stateRef.current.groups,
          setGroups: (fn) => commit((s) => ({ ...s, groups: fn(s.groups) })),
          notify: (msg) => notifyRef.current(msg),
        })
      : null,
  )
  const cloud = useSyncExternalStore(engine?.subscribe ?? noSubscribe, engine?.getStatus ?? noStatus)
  useEffect(() => {
    if (!engine) return
    void engine.start()
    return () => engine.stop()
  }, [engine])

  // Block bodies: an effect must return nothing or a cleanup function (StrictMode calls it in dev).
  useEffect(() => {
    saveState(state)
  }, [state])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])
  useEffect(() => {
    const onHash = () => setRouteState(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  /** Navigate. `replace` swaps the current history entry (so Back skips forms / deleted groups). */
  const go = useCallback((r: Route, replace = false) => {
    const h = toHash(r)
    if (replace) window.history.replaceState(null, '', h)
    else if (window.location.hash !== h) window.history.pushState(null, '', h)
    setRouteState(r)
  }, [])

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2500)
  }, [])
  notifyRef.current = notify

  const updateGroup = (id: string, fn: (g: Group) => Group) =>
    commit((s) => {
      const prev = s.groups.find((g) => g.id === id)
      if (!prev) return s
      const next = fn(prev)
      if (prev.cloud && engine) engine.recordEdit(prev, next)
      return { ...s, groups: s.groups.map((g) => (g.id === id ? next : g)) }
    })

  const loadDemo = () => {
    const demo = demoState()
    commit((s) => ({ ...s, groups: [...demo.groups, ...s.groups], budget: s.budget || demo.budget, me: s.me || demo.me }))
    go({ name: 'group', id: demo.groups[0].id })
    notify('Goa Trip demo loaded')
  }

  const reset = () => {
    const extra = cloud.user ? ' You will also be signed out; shared groups stay in your account.' : ''
    if (!confirm(`Clear ALL groups, expenses and settings on this device?${extra}`)) return
    if (engine && cloud.user) void engine.signOut()
    engine?.clearOutbox()
    commit(() => EMPTY_STATE)
    go({ name: 'home' }, true)
    notify('Everything cleared')
  }

  const group = route.name === 'group' ? state.groups.find((g) => g.id === route.id) : undefined
  const showNav = route.name === 'home' || route.name === 'personal' || route.name === 'account'
  const navItems: { name: 'home' | 'personal' | 'account'; icon: IconName; label: string }[] = [
    { name: 'home', icon: 'users', label: 'Groups' },
    { name: 'personal', icon: 'target', label: 'My month' },
    ...(CLOUD_ENABLED ? [{ name: 'account' as const, icon: 'user' as const, label: cloud.user ? 'Account' : 'Sign in' }] : []),
  ]

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="mx-auto flex max-w-2xl items-center gap-2 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" className="flex min-h-11 items-center gap-2 rounded-2xl" onClick={() => go({ name: 'home' })}>
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <span className="text-xl font-black tracking-tight">Manage Wallet</span>
        </button>
        <div className="flex-1" />
        <Button variant="ghost" className="!px-3 text-sm" onClick={loadDemo}>
          <Icon name="sparkles" className="h-4 w-4" />
          Demo
        </Button>
        <Button variant="danger" className="!px-3 text-sm" onClick={reset}>
          <Icon name="reset" className="h-4 w-4" />
          Reset
        </Button>
      </header>

      <main className={`mx-auto max-w-2xl px-4 pt-3 ${showNav ? 'pb-32' : 'pb-16'}`}>
        {route.name === 'home' && (
          <Home
            groups={state.groups}
            open={(id) => go({ name: 'group', id })}
            create={() => go({ name: 'new-group' })}
            loadDemo={loadDemo}
            join={CLOUD_ENABLED ? () => go({ name: 'join', code: '' }) : undefined}
          />
        )}
        {route.name === 'new-group' && (
          <NewGroup
            onCancel={() => go({ name: 'home' })}
            onCreate={(g) => {
              commit((s) => ({ ...s, groups: [g, ...s.groups] }))
              go({ name: 'group', id: g.id }, true)
              notify(`"${g.name}" created`)
            }}
          />
        )}
        {route.name === 'group' && group && (
          <GroupView
            key={group.id}
            group={group}
            onBack={() => go({ name: 'home' })}
            update={(fn) => updateGroup(group.id, fn)}
            onDelete={() => {
              if (group.cloud && engine) {
                // Shared group: "Leave" (the group lives on for the others).
                engine.leave(group.id).then(
                  () => {
                    notify(`Left "${group.name}"`)
                    go({ name: 'home' }, true)
                  },
                  (e: unknown) => notify(e instanceof Error ? e.message : 'Could not leave the group'),
                )
                return
              }
              commit((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== group.id) }))
              go({ name: 'home' }, true)
            }}
            notify={notify}
            deleteLabel={group.cloud ? 'Leave' : undefined}
            deleteConfirm={group.cloud ? `Leave "${group.name}"? It disappears from your devices; the others keep it.` : undefined}
            sharing={
              engine ? (
                <GroupSharing
                  group={group}
                  engine={engine}
                  status={cloud}
                  notify={notify}
                  goAccount={() => go({ name: 'account' })}
                  onGone={() => go({ name: 'home' }, true)}
                  onShared={(shared) => {
                    // A pull may already have brought the shared copy in: never keep two groups with one id.
                    commit((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== shared.id).map((g) => (g.id === group.id ? shared : g)) }))
                    go({ name: 'group', id: shared.id }, true)
                  }}
                />
              ) : undefined
            }
          />
        )}
        {route.name === 'account' && engine && <Account engine={engine} status={cloud} notify={notify} onJoin={() => go({ name: 'join', code: '' })} />}
        {route.name === 'join' && engine && (
          <JoinGroup
            engine={engine}
            status={cloud}
            groups={state.groups}
            initialCode={route.code}
            notify={notify}
            onBack={() => go({ name: 'home' })}
            onOpen={(id) => go({ name: 'group', id }, true)}
          />
        )}
        {route.name === 'group' && !group && (
          <Empty emoji="🤷" title="Group not found">
            <p className="text-slate-500 dark:text-slate-400">It may have been deleted or lives on another device.</p>
            <Button onClick={() => go({ name: 'home' }, true)}>Back to groups</Button>
          </Empty>
        )}
        {route.name === 'personal' && (
          <Personal state={state} setBudget={(budget) => commit((s) => ({ ...s, budget }))} setMe={(me) => commit((s) => ({ ...s, me }))} />
        )}
      </main>

      {showNav && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className={`mx-auto grid max-w-2xl ${navItems.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {navItems.map((n) => {
              const active = route.name === n.name
              return (
                <button
                  key={n.name}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => go({ name: n.name })}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-sm font-bold ${active ? 'text-violet-600 dark:text-violet-300' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  <Icon name={n.icon} className="h-6 w-6" />
                  {n.label}
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {/* Live region stays mounted so screen readers announce each toast. */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
        {toast && (
          <div className="flex animate-[pop_.2s_ease-out] items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-base font-semibold text-white shadow-xl dark:bg-white dark:text-slate-900">
            <Icon name="check" className="h-5 w-5 text-emerald-400 dark:text-emerald-600" />
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}

function Home({
  groups,
  open,
  create,
  loadDemo,
  join,
}: {
  groups: Group[]
  open: (id: string) => void
  create: () => void
  loadDemo: () => void
  join?: () => void
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col gap-5 pt-6">
        <div className="text-center">
          <div className="text-6xl" aria-hidden="true">
            💸
          </div>
          <h1 className="mt-3 text-4xl font-black leading-tight">
            Split bills, <span className="text-violet-600 dark:text-violet-400">not friendships.</span>
          </h1>
          <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">Add or paste an expense and instantly see who owes whom. Settle up with one tap on UPI.</p>
        </div>
        <Button className="py-4 text-lg" onClick={create}>
          <Icon name="plus" />
          Create a group
        </Button>
        <Button variant="secondary" className="py-4 text-lg" onClick={loadDemo}>
          <Icon name="sparkles" />
          Load demo data (Goa Trip)
        </Button>
        {join && (
          <Button variant="ghost" className="py-4 text-lg" onClick={join}>
            <Icon name="link" />
            Join a friend’s group
          </Button>
        )}
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          {join ? 'No sign-up needed. Sign in only to share groups with friends.' : 'No sign-up. Everything stays on this device.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black">Your groups</h1>
        <Button onClick={create}>
          <Icon name="plus" />
          New group
        </Button>
      </div>
      {groups.map((g) => {
        const total = g.expenses.reduce((s, e) => s + e.amount, 0)
        const pending = minCashFlow(computeBalances(g)).length
        return (
          <button key={g.id} type="button" className="rounded-3xl text-left" onClick={() => open(g.id)}>
            <Card className="transition hover:ring-violet-400">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-2xl font-extrabold">{g.name}</div>
                  <div className="truncate text-slate-500 dark:text-slate-400">
                    {g.cloud && <span className="font-semibold text-violet-600 dark:text-violet-400">Shared · </span>}
                    {g.members.length} people · {g.expenses.length} expenses
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black tabular-nums">{formatINR(total)}</div>
                  <div className={`text-sm font-semibold ${pending ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {g.expenses.length === 0 ? 'No expenses yet' : pending ? `${pending} to settle` : 'All settled'}
                  </div>
                </div>
              </div>
            </Card>
          </button>
        )
      })}
      {join && (
        <Button variant="ghost" onClick={join}>
          <Icon name="link" />
          Join a friend’s group with a code
        </Button>
      )}
    </div>
  )
}
