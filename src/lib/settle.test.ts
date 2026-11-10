import { describe, expect, it } from 'vitest'
import { computeBalances } from './balances'
import { demoState } from './demo'
import { minCashFlow, type Transfer } from './settle'

const apply = (bal: Record<string, number>, ts: Transfer[]) => {
  const b = { ...bal }
  for (const t of ts) {
    b[t.from] += t.amount
    b[t.to] -= t.amount
  }
  return b
}

describe('minCashFlow', () => {
  it('returns nothing when everyone is settled', () => {
    expect(minCashFlow({ a: 0, b: 0 })).toEqual([])
  })
  it('handles a simple debt', () => {
    expect(minCashFlow({ a: 34000, b: -34000 })).toEqual([{ from: 'b', to: 'a', amount: 34000 }])
  })
  it('collapses a chain into fewer transfers', () => {
    // a owes b 100, b owes c 100 => a pays c directly
    expect(minCashFlow({ a: -100, b: 0, c: 100 })).toEqual([{ from: 'a', to: 'c', amount: 100 }])
  })
  it('zeroes every balance with at most n-1 positive integer transfers (fuzz)', () => {
    for (let i = 0; i < 1000; i++) {
      const n = 2 + (i % 9)
      const bal: Record<string, number> = {}
      let total = 0
      for (let k = 0; k < n - 1; k++) {
        const v = Math.floor(Math.random() * 200000) - 100000
        bal[`m${k}`] = v
        total += v
      }
      bal[`m${n - 1}`] = -total
      const ts = minCashFlow(bal)
      expect(ts.length).toBeLessThanOrEqual(n - 1)
      for (const t of ts) {
        expect(Number.isInteger(t.amount)).toBe(true)
        expect(t.amount).toBeGreaterThan(0)
      }
      expect(Object.values(apply(bal, ts)).every((v) => v === 0)).toBe(true)
    }
  })
  it('settles the demo group completely', () => {
    const bal = computeBalances(demoState().groups[0])
    const ts = minCashFlow(bal)
    expect(ts.length).toBeGreaterThan(0)
    expect(Object.values(apply(bal, ts)).every((v) => v === 0)).toBe(true)
  })
})
