import { describe, expect, it } from 'vitest'
import { categorize } from './category'
import { parseMessage, prettifyVpa } from './parser'

describe('parseMessage — brief samples', () => {
  it('bank debit SMS with VPA', () => {
    const p = parseMessage('Rs.450.00 debited from A/c XX1234 on 10-11-26 to VPA zomato@icici (UPI Ref 123456789)')
    expect(p).toMatchObject({ ok: true, amount: 45000, payee: 'Zomato', vpa: 'zomato@icici', date: '2026-11-10', method: 'UPI' })
  })
  it('Google Pay message with ₹ and comma thousands', () => {
    const p = parseMessage('You paid ₹1,200 to Rahul Kumar via Google Pay')
    expect(p).toMatchObject({ ok: true, amount: 120000, payee: 'Rahul Kumar', method: 'Google Pay' })
    expect(p.date).toBeUndefined()
  })
  it('PhonePe message', () => {
    const p = parseMessage('Paid ₹80 to Canteen Stall on PhonePe')
    expect(p).toMatchObject({ ok: true, amount: 8000, payee: 'Canteen Stall', method: 'PhonePe' })
  })
})

describe('parseMessage — resilience', () => {
  it.each([
    ['INR 1,20,000.50 debited', 12000050],
    ['Rs 250 spent', 25000],
    ['Rs. 99.5 paid', 9950],
    ['₹ 2,499 sent', 249900],
    ['Sent Rs.1,500.00 From HDFC Bank A/C x9999 To rahul.k@okhdfc On 05/11/26', 150000],
  ])('amount in %s', (text, amount) => {
    expect(parseMessage(text).amount).toBe(amount)
  })
  it('reads "spent at MERCHANT" and textual dates', () => {
    const p = parseMessage('Rs 250 spent at Dominos Pizza on 7 Nov 2026')
    expect(p).toMatchObject({ amount: 25000, payee: 'Dominos Pizza', date: '2026-11-07' })
  })
  it('falls back to VPA for payee and DD/MM/YY dates', () => {
    const p = parseMessage('Sent Rs.1,500.00 From HDFC Bank A/C x9999 To rahul.k@okhdfc On 05/11/26')
    expect(p.payee).toBe('Rahul K')
    expect(p.date).toBe('2026-11-05')
  })
  it('fails gracefully on junk but keeps what it found', () => {
    expect(parseMessage('')).toEqual({ ok: false })
    const p = parseMessage('Paid to Ravi Kumar via GPay')
    expect(p.ok).toBe(false)
    expect(p.payee).toBe('Ravi Kumar')
  })
  it('prettifies VPAs', () => {
    expect(prettifyVpa('big.bazaar-1@ybl')).toBe('Big Bazaar')
  })
})

describe('categorize', () => {
  it('tags merchants', () => {
    expect(categorize('Zomato').key).toBe('food')
    expect(categorize('Uber to airport').key).toBe('travel')
    expect(categorize('Amazon order').key).toBe('shopping')
    expect(categorize('Coca cola').key).toBe('other')
  })
})
