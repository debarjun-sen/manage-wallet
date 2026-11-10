import { describe, expect, it } from 'vitest'
import { computeBalances } from './balances'
import { demoState } from './demo'
import { formatINR, toPaise } from './money'
import { buildSplits, equalSplit, percentSplit } from './splits'
import type { Expense, Group } from './types'

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

const g = (expenses: Expense[], settlements: Group['settlements'] = []): Group => ({
  id: 'g',
  name: 'T',
  members: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
  expenses,
  settlements,
  createdAt: '',
})
const exp = (amount: number, paidBy: string, ids = ['a', 'b', 'c']): Expense => ({
  id: Math.random().toString(),
  description: 'x',
  amount,
  paidBy,
  splits: equalSplit(amount, ids),
  date: '2026-11-10',
  source: 'manual',
})

describe('money', () => {
  it('formats with Indian grouping', () => {
    expect(formatINR(12000000)).toBe('₹1,20,000')
    expect(formatINR(45050)).toBe('₹450.50')
    expect(formatINR(-34000)).toBe('-₹340')
  })
  it('parses rupee strings to paise', () => {
    expect(toPaise('1,200')).toBe(120000)
    expect(toPaise('Rs. 450.10')).toBe(45010)
    expect(toPaise('₹0.07')).toBe(7)
    expect(toPaise('abc')).toBeNull()
  })
})

describe('splits', () => {
  it('equal split distributes leftover paise exactly', () => {
    const s = equalSplit(10000, ['a', 'b', 'c'])
    expect(s.map((x) => x.share)).toEqual([3334, 3333, 3333])
  })
  it('percent split sums to the amount', () => {
    const s = percentSplit(10001, [{ memberId: 'a', pct: 33.33 }, { memberId: 'b', pct: 33.33 }, { memberId: 'c', pct: 33.34 }])
    expect(s.reduce((a, x) => a + x.share, 0)).toBe(10001)
  })
  it('rejects exact shares that do not add up', () => {
    const r = buildSplits('exact', 10000, ['a', 'b'], { a: '50', b: '40' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/still to assign/)
  })
  it('rejects percentages not totalling 100', () => {
    expect(buildSplits('percent', 10000, ['a', 'b'], { a: '50', b: '40' }).ok).toBe(false)
    expect(buildSplits('percent', 10000, ['a', 'b'], { a: '60', b: '40' }).ok).toBe(true)
  })
})

describe('computeBalances', () => {
  it('payer gets back what others owe', () => {
    const b = computeBalances(g([exp(30000, 'a')]))
    expect(b).toEqual({ a: 20000, b: -10000, c: -10000 })
  })
  it('settlements reduce balances', () => {
    const b = computeBalances(g([exp(30000, 'a')], [{ id: 's', from: 'b', to: 'a', amount: 10000, date: '' }]))
    expect(b).toEqual({ a: 10000, b: 0, c: -10000 })
  })
  it('always sums to exactly zero (random fuzz)', () => {
    for (let i = 0; i < 500; i++) {
      const ids = ['a', 'b', 'c']
      const es = Array.from({ length: 1 + (i % 9) }, () => {
        const sub = ids.filter(() => Math.random() > 0.3)
        return exp(1 + Math.floor(Math.random() * 1e6), ids[Math.floor(Math.random() * 3)], sub.length ? sub : ['a'])
      })
      expect(sum(computeBalances(g(es)))).toBe(0)
    }
  })
  it('demo data balances sum to zero', () => {
    expect(sum(computeBalances(demoState().groups[0]))).toBe(0)
  })
})
