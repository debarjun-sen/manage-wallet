export interface Transfer {
  from: string
  to: string
  amount: number
}

/**
 * Greedy min-cash-flow: repeatedly match the biggest debtor with the biggest creditor.
 * Produces at most n-1 transfers, and applying them zeroes every balance.
 */
export function minCashFlow(balances: Record<string, number>): Transfer[] {
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .map(([id, amt]) => ({ id, amt }))
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < 0)
    .map(([id, amt]) => ({ id, amt: -amt }))
  const byAmt = (a: { id: string; amt: number }, b: { id: string; amt: number }) =>
    b.amt - a.amt || a.id.localeCompare(b.id)

  const out: Transfer[] = []
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmt)
    debtors.sort(byAmt)
    const c = creditors[0]
    const d = debtors[0]
    const amount = Math.min(c.amt, d.amt)
    out.push({ from: d.id, to: c.id, amount })
    c.amt -= amount
    d.amt -= amount
    if (c.amt === 0) creditors.shift()
    if (d.amt === 0) debtors.shift()
  }
  return out
}
