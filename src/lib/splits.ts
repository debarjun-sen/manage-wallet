import { formatINR, toPaise } from './money'
import type { Split, SplitMode } from './types'

/** Split equally; leftover paise go one each to the first members so the sum is exact. */
export function equalSplit(amount: number, memberIds: string[]): Split[] {
  const n = memberIds.length
  if (n === 0) return []
  const base = Math.floor(amount / n)
  const rem = amount - base * n
  return memberIds.map((memberId, i) => ({ memberId, share: base + (i < rem ? 1 : 0) }))
}

/** Split by percentages (must total 100) using largest-remainder rounding so the sum is exact. */
export function percentSplit(amount: number, entries: { memberId: string; pct: number }[]): Split[] {
  const raw = entries.map((e) => ({ memberId: e.memberId, exact: (amount * e.pct) / 100 }))
  const splits = raw.map((r) => ({ memberId: r.memberId, share: Math.floor(r.exact + 1e-9) }))
  let rem = amount - splits.reduce((s, x) => s + x.share, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r.exact - Math.floor(r.exact + 1e-9) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; rem > 0 && order.length > 0; k = (k + 1) % order.length, rem--) {
    splits[order[k].i].share += 1
  }
  return splits
}

export type SplitResult = { ok: true; splits: Split[] } | { ok: false; error: string }

/** Build and validate splits from form values. `values` are rupee strings (exact) or percent strings. */
export function buildSplits(
  mode: SplitMode,
  amount: number,
  selected: string[],
  values: Record<string, string>,
): SplitResult {
  if (!(amount > 0)) return { ok: false, error: 'Enter an amount greater than ₹0.' }
  if (selected.length === 0) return { ok: false, error: 'Pick at least one person to split with.' }

  if (mode === 'equal') return { ok: true, splits: equalSplit(amount, selected) }

  if (mode === 'exact') {
    const splits: Split[] = []
    for (const id of selected) {
      const v = (values[id] ?? '').trim()
      const p = v === '' ? 0 : toPaise(v)
      if (p === null) return { ok: false, error: `"${v}" isn't a valid amount.` }
      if (p > 0) splits.push({ memberId: id, share: p })
    }
    const sum = splits.reduce((s, x) => s + x.share, 0)
    if (sum !== amount) {
      const diff = amount - sum
      return {
        ok: false,
        error: `Shares add up to ${formatINR(sum)} but the total is ${formatINR(amount)} — ${formatINR(Math.abs(diff))} ${diff > 0 ? 'still to assign' : 'too much'}.`,
      }
    }
    return { ok: true, splits }
  }

  const entries: { memberId: string; pct: number }[] = []
  for (const id of selected) {
    const v = (values[id] ?? '').trim()
    const pct = v === '' ? 0 : Number(v)
    if (!Number.isFinite(pct) || pct < 0) return { ok: false, error: `"${v}" isn't a valid percentage.` }
    if (pct > 0) entries.push({ memberId: id, pct })
  }
  const total = entries.reduce((s, e) => s + e.pct, 0)
  if (Math.abs(total - 100) > 0.001) {
    return {
      ok: false,
      error: `Percentages add up to ${+total.toFixed(2)}% — they need to total exactly 100% (${+Math.abs(100 - total).toFixed(2)}% ${total < 100 ? 'left' : 'over'}).`,
    }
  }
  return { ok: true, splits: percentSplit(amount, entries) }
}
