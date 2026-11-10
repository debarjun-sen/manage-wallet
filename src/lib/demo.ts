import { parseMessage, SAMPLE_MESSAGES } from './parser'
import { equalSplit, percentSplit } from './splits'
import type { AppState, Expense, Group } from './types'
import { daysAgoISO, uid } from './util'

export function demoState(): AppState {
  // Deliberately non-routable "@example" handles: a demo tap on "Pay via UPI" must never reach a real
  // stranger's account (aman@okaxis etc. could belong to someone).
  const aman = { id: uid(), name: 'Aman', upiId: 'aman.demo@example' }
  const riya = { id: uid(), name: 'Riya', upiId: 'riya.demo@example' }
  const kabir = { id: uid(), name: 'Kabir', upiId: 'kabir.demo@example' }
  const sneha = { id: uid(), name: 'Sneha' } // no UPI ID: shows the "no UPI" path
  const all = [aman.id, riya.id, kabir.id, sneha.id]

  const zomato = parseMessage(SAMPLE_MESSAGES[0].text)
  const gpay = parseMessage(SAMPLE_MESSAGES[1].text)

  const ex = (e: Omit<Expense, 'id'>): Expense => ({ id: uid(), ...e })
  const expenses: Expense[] = [
    ex({ description: 'Villa booking (2 nights)', amount: 1200000, paidBy: aman.id, splits: equalSplit(1200000, all), date: daysAgoISO(6), source: 'manual', splitMode: 'equal' }),
    ex({ description: 'Scooty rental', amount: 240000, paidBy: riya.id, splits: equalSplit(240000, all), date: daysAgoISO(5), source: 'manual', splitMode: 'equal' }),
    ex({ description: `${zomato.payee} late-night order`, amount: zomato.amount ?? 45000, paidBy: kabir.id, splits: equalSplit(zomato.amount ?? 45000, [riya.id, kabir.id, sneha.id]), date: daysAgoISO(5), source: 'pasted', splitMode: 'equal' }),
    ex({
      description: 'Beach shack dinner',
      amount: 328000,
      paidBy: sneha.id,
      splits: [
        { memberId: aman.id, share: 90000 },
        { memberId: riya.id, share: 70000 },
        { memberId: kabir.id, share: 108000 },
        { memberId: sneha.id, share: 60000 },
      ],
      date: daysAgoISO(4),
      source: 'manual',
      splitMode: 'exact',
    }),
    ex({ description: `Parasailing (${gpay.payee})`, amount: gpay.amount ?? 120000, paidBy: aman.id, splits: equalSplit(gpay.amount ?? 120000, [aman.id, kabir.id]), date: daysAgoISO(3), source: 'pasted', splitMode: 'equal' }),
    ex({
      description: 'Petrol for scooties',
      amount: 80000,
      paidBy: kabir.id,
      splits: percentSplit(80000, [
        { memberId: kabir.id, pct: 40 },
        { memberId: aman.id, pct: 20 },
        { memberId: riya.id, pct: 20 },
        { memberId: sneha.id, pct: 20 },
      ]),
      date: daysAgoISO(3),
      source: 'manual',
      splitMode: 'percent',
    }),
    ex({ description: 'Club entry', amount: 400000, paidBy: riya.id, splits: equalSplit(400000, all), date: daysAgoISO(2), source: 'manual', splitMode: 'equal' }),
    ex({ description: 'Fish market groceries', amount: 115000, paidBy: sneha.id, splits: equalSplit(115000, all), date: daysAgoISO(1), source: 'manual', splitMode: 'equal' }),
  ]

  const group: Group = {
    id: uid(),
    name: 'Goa Trip',
    members: [aman, riya, kabir, sneha],
    expenses,
    settlements: [{ id: uid(), from: kabir.id, to: aman.id, amount: 50000, date: daysAgoISO(1) }],
    createdAt: new Date().toISOString(),
  }
  return { groups: [group], budget: 800000, me: 'Aman' }
}
