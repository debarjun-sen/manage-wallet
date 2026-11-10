import { useState, type FormEvent } from 'react'
import type { Group } from '../lib/types'
import { uid } from '../lib/util'
import { Button, Card, Icon, inputCls, Label } from './ui'

interface Row {
  key: string
  name: string
  upiId: string
}

const newRow = (): Row => ({ key: uid(), name: '', upiId: '' })

export function NewGroup({ onCreate, onCancel }: { onCreate: (g: Group) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()])
  const [error, setError] = useState<string | null>(null)

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const members = rows.filter((r) => r.name.trim())
    const names = members.map((r) => r.name.trim().toLowerCase())
    if (!name.trim()) return setError('Give your group a name, e.g. "Goa Trip".')
    if (members.length < 2) return setError('Add at least 2 people.')
    if (new Set(names).size !== names.length) return setError('Two people have the same name — make them unique.')
    const badUpi = members.find((r) => r.upiId.trim() && !/^[\w.-]{2,}@[a-z][a-z0-9]+$/i.test(r.upiId.trim()))
    if (badUpi) return setError(`"${badUpi.upiId}" doesn't look like a UPI ID (e.g. name@okaxis).`)
    onCreate({
      id: uid(),
      name: name.trim(),
      members: members.map((r) => ({ id: uid(), name: r.name.trim(), ...(r.upiId.trim() ? { upiId: r.upiId.trim().toLowerCase() } : {}) })),
      expenses: [],
      settlements: [],
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={onCancel} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="Back">
          <Icon name="back" className="h-6 w-6" />
        </button>
        <h1 className="text-3xl font-black">New group</h1>
      </div>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <Label>Group name</Label>
            <input className={inputCls} maxLength={40} placeholder="Goa Trip, Room 204, Canteen gang…" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Members (2–10) · UPI ID optional</Label>
            <div className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <div key={r.key} className="flex gap-2">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder={['You', 'Friend', 'Another friend'][i] ?? `Person ${i + 1}`}
                    value={r.name}
                    maxLength={30}
                    onChange={(e) => setRow(r.key, { name: e.target.value })}
                    aria-label={`Member ${i + 1} name`}
                  />
                  <input
                    className={`${inputCls} flex-1 text-base`}
                    placeholder="upi@bank"
                    maxLength={60}
                    value={r.upiId}
                    autoCapitalize="off"
                    onChange={(e) => setRow(r.key, { upiId: e.target.value })}
                    aria-label={`Member ${i + 1} UPI ID`}
                  />
                  {rows.length > 2 && (
                    <button type="button" className="flex w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-rose-600 dark:text-slate-400" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove member">
                      <Icon name="x" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {rows.length < 10 && (
              <Button variant="ghost" className="mt-2" onClick={() => setRows((rs) => [...rs, newRow()])}>
                <Icon name="plus" />
                Add person
              </Button>
            )}
          </div>
          {error && (
            <div role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
              <Icon name="alert" className="mr-1 inline h-5 w-5 align-[-3px]" />
              {error}
            </div>
          )}
          <Button type="submit" className="py-4 text-lg">
            Create group
          </Button>
        </form>
      </Card>
    </div>
  )
}
