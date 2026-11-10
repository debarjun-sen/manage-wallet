import { toPaise } from './money'

export interface ParsedMessage {
  ok: boolean // true when at least an amount was found
  amount?: number // paise
  payee?: string
  vpa?: string
  date?: string // YYYY-MM-DD
  method?: string
}

// ₹ / Rs / Rs. / INR followed by an amount, with Indian or western comma grouping.
const AMOUNT_RE = /(?:₹|\brs\.?|\binr)\s*((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?)/i
const AMOUNT_FALLBACK_RE = /\b(?:debited|paid|sent|spent|transferred)\s+(?:by|of|for)?\s*((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?)\b/i

const STOP = String.raw`(?=\s+(?:via|on|using|through|from|for|ref|upi|with|at)\b|[.,(\n]|$)`
const NAME_PATTERNS = [
  new RegExp(String.raw`\b(?:paid|sent|transferred)\b.{0,40}?\bto\s+(.+?)` + STOP, 'i'),
  new RegExp(String.raw`\b(?:at|to)\s+([A-Z][\w&' -]*?)` + STOP),
]
const VPA_RE = /([a-z0-9._-]{2,}@[a-z][a-z0-9]+)/i

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const NUM_DATE_RE = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/
const TEXT_DATE_RE = /\b(\d{1,2})[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]*(\d{4}|\d{2})?\b/i

function iso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseDate(text: string): string | undefined {
  const n = NUM_DATE_RE.exec(text)
  if (n) {
    const y = n[3].length === 2 ? 2000 + Number(n[3]) : Number(n[3])
    const r = iso(y, Number(n[2]), Number(n[1])) // Indian format: DD-MM-YY
    if (r) return r
  }
  const t = TEXT_DATE_RE.exec(text)
  if (t) {
    const y = t[3] ? (t[3].length === 2 ? 2000 + Number(t[3]) : Number(t[3])) : new Date().getFullYear()
    return iso(y, MONTHS.indexOf(t[2].toLowerCase()) + 1, Number(t[1]))
  }
  return undefined
}

/** "zomato@icici" -> "Zomato", "big.bazaar-1@ybl" -> "Big Bazaar" */
export function prettifyVpa(vpa: string): string {
  const words = vpa
    .split('@')[0]
    .split(/[._-]+/)
    .filter((w) => w && !/^\d+$/.test(w))
    .map((w) => w.replace(/\d+$/, ''))
    .filter(Boolean)
  if (words.length === 0) return vpa
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function detectMethod(text: string): string | undefined {
  if (/google\s*pay|\bgpay\b/i.test(text)) return 'Google Pay'
  if (/phone\s*pe/i.test(text)) return 'PhonePe'
  if (/paytm/i.test(text)) return 'Paytm'
  if (/\bbhim\b/i.test(text)) return 'BHIM'
  if (/\bupi\b|\bvpa\b/i.test(text)) return 'UPI'
  return undefined
}

/** Parse a bank SMS / UPI app message into an expense draft. Never throws. */
export const MAX_MESSAGE_LENGTH = 1000

export function parseMessage(text: string): ParsedMessage {
  // Cap input: real SMS/UPI messages are short, and bounding length keeps regex time trivially small
  // even for a huge or malicious paste (no tab freeze).
  const clean = text.slice(0, MAX_MESSAGE_LENGTH).replace(/\s+/g, ' ').trim()
  const result: ParsedMessage = { ok: false }
  if (!clean) return result

  const am = AMOUNT_RE.exec(clean) ?? AMOUNT_FALLBACK_RE.exec(clean)
  if (am) {
    const p = toPaise(am[1])
    if (p !== null && p > 0) result.amount = p
  }

  const vpa = VPA_RE.exec(clean)
  if (vpa) result.vpa = vpa[1].toLowerCase()

  for (const re of NAME_PATTERNS) {
    const m = re.exec(clean)
    const name = m?.[1]?.trim()
    const isVpaFragment = !!result.vpa && result.vpa.startsWith(name?.toLowerCase() ?? '\0')
    if (name && !isVpaFragment && !/^(vpa|a\/c|ac|your|you|account)\b/i.test(name) && !name.includes('@') && name.length <= 40) {
      result.payee = name
      break
    }
  }
  if (!result.payee && result.vpa) result.payee = prettifyVpa(result.vpa)

  result.date = parseDate(clean)
  result.method = detectMethod(clean)
  result.ok = result.amount !== undefined
  return result
}

export const SAMPLE_MESSAGES = [
  { label: 'Bank SMS · Zomato', text: 'Rs.450.00 debited from A/c XX1234 on 10-11-26 to VPA zomato@icici (UPI Ref 123456789)' },
  { label: 'Google Pay', text: 'You paid ₹1,200 to Rahul Kumar via Google Pay' },
  { label: 'PhonePe', text: 'Paid ₹80 to Canteen Stall on PhonePe' },
]
