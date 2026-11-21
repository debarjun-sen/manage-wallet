import { useState } from 'react'
import type { Group } from '../../lib/types'
import { Button, Chip, inputCls, Label } from '../ui'

/** "Which one is you?" — choose an existing person in the group, or add yourself by name. */
export function PickPerson({
  group,
  current,
  busy,
  onPick,
  onAddMe,
  allowAdd = true,
}: {
  group: Group
  current?: string
  busy: boolean
  onPick: (memberId: string) => void
  onAddMe?: (name: string) => void
  allowAdd?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const taken = group.members.some((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase())

  return (
    <div className="flex flex-col gap-3">
      <Label>Which one is you?</Label>
      <div className="flex flex-wrap gap-2">
        {group.members.map((m) => (
          <Chip key={m.id} active={m.id === current} disabled={busy} onClick={() => onPick(m.id)}>
            {m.name}
          </Chip>
        ))}
      </div>
      {allowAdd && onAddMe && !adding && (
        <Button variant="ghost" onClick={() => setAdding(true)}>
          I’m not on the list
        </Button>
      )}
      {allowAdd && onAddMe && adding && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && !taken) onAddMe(name.trim())
          }}
        >
          <input className={`${inputCls} flex-1`} maxLength={30} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Your name" />
          <Button type="submit" disabled={busy || !name.trim() || taken}>
            Add me
          </Button>
        </form>
      )}
      {adding && taken && <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">That name is already in the group. Tap it above instead.</p>}
    </div>
  )
}
