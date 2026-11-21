import { useEffect, useState, type FormEvent } from 'react'
import type { CloudStatus, SyncEngine } from '../../cloud/engine'
import type { Group } from '../../lib/types'
import { Button, Card, Icon, inputCls, Label } from '../ui'
import { PickPerson } from './PickPerson'
import { ErrorNote, errText, SignIn } from './SignIn'

type Preview = { group_id: string; name: string; people: number; already_member: boolean }

const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)

export function JoinGroup({
  engine,
  status,
  groups,
  initialCode,
  onBack,
  onOpen,
  notify,
}: {
  engine: SyncEngine
  status: CloudStatus
  groups: Group[]
  initialCode: string
  onBack: () => void
  onOpen: (groupId: string) => void
  notify: (msg: string) => void
}) {
  const [code, setCode] = useState(cleanCode(initialCode))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [joinedId, setJoinedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signedIn = Boolean(status.user)

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

  const lookup = (c: string) =>
    run(async () => {
      const p = await engine.previewInvite(c)
      if (!p) throw new Error('No group with that code. Check it, or ask for a new invite.')
      setPreview(p)
    })

  // Arriving from an invite link: look the code up as soon as we're signed in.
  useEffect(() => {
    if (signedIn && cleanCode(initialCode).length === 8) void lookup(cleanCode(initialCode))
  }, [signedIn, initialCode])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (code.length !== 8) return setError('Invite codes have 8 letters and numbers.')
    void lookup(code)
  }

  const joined = joinedId ? groups.find((g) => g.id === joinedId) : undefined

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="Back">
          <Icon name="back" className="h-6 w-6" />
        </button>
        <h1 className="text-3xl font-black">Join a group</h1>
      </div>

      <Card>
        {!status.ready ? (
          <p className="text-slate-500">Loading…</p>
        ) : !signedIn ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg text-slate-600 dark:text-slate-400">Sign in to join{code ? <> with code <span className="font-mono font-bold">{code}</span></> : ''}.</p>
            <SignIn engine={engine} />
          </div>
        ) : joined ? (
          <div className="flex flex-col gap-4">
            <div className="text-xl font-extrabold">You’re in “{joined.name}” 🎉</div>
            <PickPerson
              group={joined}
              current={joined.cloud?.memberId}
              busy={busy}
              allowAdd={joined.members.length < 10}
              onPick={(id) => void run(async () => (await engine.claimPerson(joined.id, id), onOpen(joined.id)))}
              onAddMe={(name) => void run(async () => (await engine.addMe(joined.id, name), onOpen(joined.id)))}
            />
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button variant="ghost" onClick={() => onOpen(joined.id)}>
              Skip for now
            </Button>
          </div>
        ) : joinedId ? (
          <div className="flex flex-col gap-4">
            <div className="text-xl font-extrabold">You joined the group.</div>
            <p className="text-slate-600 dark:text-slate-400">It will appear once this device syncs.</p>
            <Button onClick={() => onOpen(joinedId)}>Open group</Button>
          </div>
        ) : preview ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-2xl font-extrabold">{preview.name}</div>
              <div className="text-slate-500 dark:text-slate-400">{preview.people} people splitting expenses</div>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            {preview.already_member ? (
              <Button onClick={() => onOpen(preview.group_id)}>You’re already in it. Open</Button>
            ) : (
              <Button
                className="py-4 text-lg"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const gid = await engine.joinGroup(code || cleanCode(initialCode))
                    notify(`Joined "${preview.name}"`)
                    setJoinedId(gid)
                  })
                }
              >
                {busy ? 'Joining…' : 'Join group'}
              </Button>
            )}
            <Button variant="ghost" onClick={() => (setPreview(null), setError(null))}>
              Use a different code
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <Label>Invite code</Label>
              <input
                className={`${inputCls} text-center font-mono text-2xl uppercase tracking-[0.25em]`}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="ABCD2345"
                value={code}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                autoFocus
              />
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={busy} className="py-4 text-lg">
              {busy ? 'Looking up…' : 'Find group'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
