import { computeBalances } from './balances'
import { categorize } from './category'
import { formatINR } from './money'
import { minCashFlow } from './settle'
import type { Group, Member } from './types'

export const memberName = (g: Group, id: string) => g.members.find((m) => m.id === id)?.name ?? 'Someone'

export function upiLink(receiver: Member, amount: number): string | null {
  if (!receiver.upiId) return null
  return `upi://pay?pa=${encodeURIComponent(receiver.upiId)}&pn=${encodeURIComponent(receiver.name)}&am=${(amount / 100).toFixed(2)}&cu=INR`
}

export function whatsappSummary(g: Group): string {
  const transfers = minCashFlow(computeBalances(g))
  const total = g.expenses.reduce((s, e) => s + e.amount, 0)
  const lines = [`💸 *${g.name}* — Manage Wallet`, `Total spent: ${formatINR(total)}`, '']
  if (transfers.length === 0) lines.push('✅ Everyone is settled up!')
  else {
    lines.push('*Who pays whom:*')
    for (const t of transfers) {
      const to = g.members.find((m) => m.id === t.to)
      lines.push(`• ${memberName(g, t.from)} pays ${memberName(g, t.to)} ${formatINR(t.amount)}${to?.upiId ? ` (UPI: ${to.upiId})` : ''}`)
    }
  }
  return lines.join('\n')
}

export function whatsappUrl(g: Group): string {
  return `https://wa.me/?text=${encodeURIComponent(whatsappSummary(g))}`
}

const esc = (v: string | number) => {
  let s = String(v)
  // Neutralise CSV/formula injection: a description like =HYPERLINK(...) must not execute in Excel/Sheets.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function groupToCsv(g: Group): string {
  const rows: (string | number)[][] = [['Type', 'Date', 'Description', 'Category', 'Amount (INR)', 'Paid by / From', 'Split / To', 'Source']]
  for (const e of g.expenses) {
    rows.push([
      'Expense',
      e.date,
      e.description,
      categorize(e.description).label,
      (e.amount / 100).toFixed(2),
      memberName(g, e.paidBy),
      e.splits.map((s) => `${memberName(g, s.memberId)}: ${(s.share / 100).toFixed(2)}`).join('; '),
      e.source,
    ])
  }
  for (const s of g.settlements) {
    rows.push(['Settlement', s.date, 'Settle up', '', (s.amount / 100).toFixed(2), memberName(g, s.from), memberName(g, s.to), ''])
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n')
}

export function downloadCsv(g: Group) {
  const blob = new Blob(['﻿' + groupToCsv(g)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${g.name.replace(/[^\w-]+/g, '_')}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
