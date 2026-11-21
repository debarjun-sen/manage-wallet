import { afterEach, describe, expect, it } from 'vitest'
import { demoState } from './demo'
import { MAX_MESSAGE_LENGTH, parseMessage } from './parser'
import { groupToCsv, upiLink, whatsappUrl } from './share'
import { loadState } from './storage'
import type { Group } from './types'
// @ts-expect-error plain .mjs module without type declarations
import { buildCsp } from '../../security-headers.mjs'

const group = (description: string, memberName = 'Asha'): Group => ({
  id: 'g',
  name: 'Room',
  members: [{ id: 'a', name: memberName, upiId: 'asha@example' }, { id: 'b', name: 'Bo' }],
  expenses: [{ id: 'e', description, amount: 10000, paidBy: 'a', splits: [{ memberId: 'a', share: 5000 }, { memberId: 'b', share: 5000 }], date: '2026-11-10', source: 'manual' }],
  settlements: [],
  createdAt: '',
})

describe('CSV export', () => {
  it.each(['=HYPERLINK("http://evil","x")', '+cmd|calc', '-2+3', '@SUM(A1)'])('neutralises formula %s', (d) => {
    const line = groupToCsv(group(d)).split('\n')[1]
    expect(line).toContain(`'${d.replace(/"/g, '""')}`)
  })
  it('also neutralises member names', () => {
    expect(groupToCsv(group('Pizza', '=1+1'))).toContain("'=1+1")
  })
})

describe('links', () => {
  it('UPI link cannot be hijacked by crafted names/IDs', () => {
    const link = upiLink({ id: 'x', name: 'A&pa=evil@bank', upiId: 'a@b&am=1' }, 34000)!
    const params = new URLSearchParams(link.split('?')[1])
    expect(params.get('pa')).toBe('a@b&am=1')
    expect(params.get('pn')).toBe('A&pa=evil@bank')
    expect(params.getAll('pa')).toHaveLength(1)
    expect(params.get('am')).toBe('340.00')
  })
  it('WhatsApp link always targets wa.me', () => {
    expect(whatsappUrl(group('<script>alert(1)</script>'))).toMatch(/^https:\/\/wa\.me\/\?text=[^<>]*$/)
  })
  it('demo data never points at real UPI handles', () => {
    for (const m of demoState().groups[0].members) if (m.upiId) expect(m.upiId).toMatch(/@example$/)
  })
})

describe('parser robustness', () => {
  it('handles a huge pathological paste quickly', () => {
    const evil = 'paid to ' + 'Aa '.repeat(200000) + 'a'.repeat(200000)
    const t = performance.now()
    parseMessage(evil)
    expect(performance.now() - t).toBeLessThan(200)
  })
  it('ignores text beyond the cap', () => {
    expect(parseMessage('x'.repeat(MAX_MESSAGE_LENGTH) + ' Rs.500 paid').amount).toBeUndefined()
  })
})

describe('storage validation', () => {
  const store: Record<string, string> = {}
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => (store[k] = v),
  }
  afterEach(() => Object.keys(store).forEach((k) => delete store[k]))

  it('drops malformed groups instead of crashing', () => {
    store['manage-wallet:v1'] = JSON.stringify({ groups: [group('ok'), { id: 1 }, null, { ...group('bad'), expenses: [{ amount: 'NaN' }] }], budget: -5, me: 7 })
    const s = loadState()
    expect(s.groups).toHaveLength(1)
    expect(s.budget).toBe(0)
    expect(s.me).toBe('')
  })
  it('keeps a valid cloud marker and turns a damaged one into a local-only group', () => {
    const shared = { ...group('ok'), id: 's', cloud: { role: 'admin', inviteCode: 'ABCD2345', memberId: 'a' } }
    const damaged = { ...group('ok'), id: 'd', cloud: { role: 'owner', inviteCode: 5 } }
    store['manage-wallet:v1'] = JSON.stringify({ groups: [shared, damaged], budget: 0, me: '' })
    const [s, d] = loadState().groups
    expect(s.cloud).toEqual({ role: 'admin', inviteCode: 'ABCD2345', memberId: 'a' })
    expect(d.id).toBe('d')
    expect('cloud' in d).toBe(false)
  })
  it('survives invalid JSON', () => {
    store['manage-wallet:v1'] = '{not json'
    expect(loadState().groups).toEqual([])
  })
})

describe('content security policy', () => {
  const connect = (csp: string) => csp.split('; ').find((d) => d.startsWith('connect-src'))
  it('stays self-only for the local-only build', () => {
    expect(connect(buildCsp(undefined))).toBe("connect-src 'self'")
  })
  it('allows exactly the configured Supabase project over https and wss', () => {
    expect(connect(buildCsp('https://abc.supabase.co/'))).toBe("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co")
  })
  it('refuses a non-https Supabase URL', () => {
    expect(() => buildCsp('http://abc.supabase.co')).toThrow()
  })
})
