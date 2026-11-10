import type { Group } from './types'

/**
 * Net balance per member in paise. Positive = gets money back, negative = owes.
 * Always sums to exactly zero because every expense's splits sum to its amount.
 */
export function computeBalances(group: Pick<Group, 'members' | 'expenses' | 'settlements'>): Record<string, number> {
  const net: Record<string, number> = {}
  for (const m of group.members) net[m.id] = 0
  for (const e of group.expenses) {
    net[e.paidBy] = (net[e.paidBy] ?? 0) + e.amount
    for (const s of e.splits) net[s.memberId] = (net[s.memberId] ?? 0) - s.share
  }
  for (const s of group.settlements) {
    // "from" paid "to": from's debt shrinks, to's credit shrinks.
    net[s.from] = (net[s.from] ?? 0) + s.amount
    net[s.to] = (net[s.to] ?? 0) - s.amount
  }
  return net
}
