import { useCallback, useEffect, useState } from 'react'
import type { CloudStatus, GroupUser, SyncEngine } from '../../cloud/engine'
import { memberName } from '../../lib/share'
import type { Group } from '../../lib/types'
import { Button, Card, Icon } from '../ui'
import { SyncLine } from './Account'
import { PickPerson } from './PickPerson'
import { ErrorNote, errText } from './SignIn'

export const inviteLink = (code: string) => `${window.location.origin}/#/join/${code}`

interface Props {
  group: Group
  engine: SyncEngine
  status: CloudStatus
  notify: (msg: string) => void
  onShared: (shared: Group) => void
  onGone: () => void
  goAccount: () => void
}

/** Sharing panel shown above a group's tabs: share a local group, or manage invites and people for a shared one. */
export function GroupSharing({ group, engine, status, notify, onShared, onGone, goAccount }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<string | undefined>(group.cloud?.memberId)
  const [users, setUsers] = useState<GroupUser[] | null>(null)
  const cloud = group.cloud
  const isAdmin = cloud?.role === 'admin'

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

  const loadUsers = useCallback(() => {
    if (!cloud || !status.user) return
    engine.listUsers(group.id).then(setUsers, () => setUsers(null))
  }, [cloud, engine, group.id, status.user])

  useEffect(() => {
    if (open) loadUsers()
  }, [open, loadUsers])

  // ---------- local-only group ----------
  if (!cloud) {
    return (
      <Card className="mb-4 !p-4">
        <div className="flex items-center gap-3">
          <Icon name="share" className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          <div className="min-w-0 flex-1">
            <div className="font-bold">Only on this device</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Share it so friends see and add expenses from their phones.</div>
          </div>
          {!open && (
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Share
            </Button>
          )}
        </div>
        {open && (
          <div className="mt-4 flex flex-col gap-4">
            {!status.user ? (
              <>
                <p className="text-slate-600 dark:text-slate-400">Sign in first. Your group and its history are uploaded once; after that everyone in it stays in sync.</p>
                <Button onClick={goAccount}>Sign in to share</Button>
              </>
            ) : (
              <>
                <PickPerson group={group} current={me} busy={busy} onPick={setMe} allowAdd={false} />
                <Button
                  disabled={busy || !me}
                  onClick={() =>
                    void run(async () => {
                      const shared = await engine.shareGroup(group, me!)
                      onShared(shared)
                      notify(`"${group.name}" is now shared`)
                    })
                  }
                >
                  {busy ? 'Uploading…' : 'Share this group'}
                </Button>
              </>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Not now
            </Button>
          </div>
        )}
      </Card>
    )
  }

  // ---------- shared group ----------
  const link = inviteLink(cloud.inviteCode)
  const shareText = `Join "${group.name}" on Manage Wallet to split expenses together.\nCode: ${cloud.inviteCode}\n${link}`
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Manage Wallet', text: shareText })
        return
      } catch {
        /* cancelled or unavailable: fall through to copy */
      }
    }
    await navigator.clipboard?.writeText(shareText).catch(() => undefined)
    notify('Invite copied')
  }

  return (
    <Card className="mb-4 !p-4">
      <div className="flex items-center gap-3">
        <Icon name="cloud" className="h-6 w-6 text-violet-600 dark:text-violet-400" />
        <div className="min-w-0 flex-1">
          <div className="font-bold">
            Shared · {isAdmin ? 'admin' : 'member'}
            {cloud.memberId && <span className="font-normal text-slate-500 dark:text-slate-400"> · you’re {memberName(group, cloud.memberId)}</span>}
          </div>
          {status.user ? <SyncLine status={status} /> : <span className="text-sm text-amber-700 dark:text-amber-400">Signed out: changes won’t sync</span>}
        </div>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Close' : 'Invite'}
        </Button>
      </div>

      {open && (
        <div className="mt-4 flex flex-col gap-5">
          <div className="rounded-2xl bg-violet-50 p-4 text-center dark:bg-violet-500/10">
            <div className="text-sm font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">Invite code</div>
            <div className="mt-1 select-all font-mono text-3xl font-black tracking-[0.25em]">{cloud.inviteCode}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button onClick={() => void share()}>
                <Icon name="share" className="h-4 w-4" />
                Share invite
              </Button>
              <Button
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(link).then(() => notify('Link copied'), () => notify(link))}
              >
                <Icon name="copy" className="h-4 w-4" />
                Copy link
              </Button>
            </div>
            {isAdmin && (
              <Button
                variant="ghost"
                className="mt-2 text-sm"
                disabled={busy}
                onClick={() => confirm('Make a new code? The current code and link will stop working.') && void run(async () => void (await engine.rotateInvite(group.id)))}
              >
                New code
              </Button>
            )}
          </div>

          <PickPerson
            group={group}
            current={cloud.memberId}
            busy={busy}
            allowAdd={group.members.length < 10}
            onPick={(id) => void run(() => engine.claimPerson(group.id, id))}
            onAddMe={(name) => void run(() => engine.addMe(group.id, name))}
          />

          <div>
            <div className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">On the app</div>
            {users === null ? (
              <p className="text-slate-500">Loading…</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {users.map((u) => {
                  const self = u.user_id === status.user?.id
                  return (
                    <li key={u.user_id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
                      <Icon name="user" className="h-5 w-5 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">
                          {u.display_name || 'Unnamed'}
                          {self && ' (you)'}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {u.role === 'admin' ? 'Admin' : 'Member'}
                          {u.member_id ? ` · ${memberName(group, u.member_id)}` : ''}
                        </div>
                      </div>
                      {isAdmin && !self && (
                        <>
                          <Button
                            variant="ghost"
                            className="!min-h-9 !py-1 text-sm"
                            disabled={busy}
                            onClick={() => void run(async () => (await engine.setRole(group.id, u.user_id, u.role === 'admin' ? 'member' : 'admin'), loadUsers()))}
                          >
                            {u.role === 'admin' ? 'Make member' : 'Make admin'}
                          </Button>
                          <Button
                            variant="danger"
                            className="!min-h-9 !py-1 text-sm"
                            disabled={busy}
                            onClick={() =>
                              confirm(`Remove ${u.display_name || 'this person'} from the group? They lose access on their devices.`) &&
                              void run(async () => (await engine.removeUser(group.id, u.user_id), loadUsers()))
                            }
                          >
                            Remove
                          </Button>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                confirm(`Leave "${group.name}"? It disappears from your devices; the others keep it.`) &&
                void run(async () => {
                  await engine.leave(group.id)
                  notify(`Left "${group.name}"`)
                  onGone()
                })
              }
            >
              <Icon name="logout" className="h-4 w-4" />
              Leave group
            </Button>
            {isAdmin && (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  confirm(`Delete "${group.name}" for EVERYONE? All its expenses are removed from every member's account. This can't be undone.`) &&
                  void run(async () => {
                    await engine.deleteForEveryone(group.id)
                    notify(`Deleted "${group.name}"`)
                    onGone()
                  })
                }
              >
                <Icon name="trash" className="h-4 w-4" />
                Delete for everyone
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
