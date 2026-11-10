import type { AppState, Group } from './types'

const KEY = 'manage-wallet:v1'
export const EMPTY_STATE: AppState = { groups: [], budget: 0, me: '' }

const isStr = (v: unknown): v is string => typeof v === 'string'
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Structural check so corrupted or tampered storage can't crash the app or inject odd values. */
function isGroup(g: unknown): g is Group {
  if (!isObj(g) || !isStr(g.id) || !isStr(g.name) || !Array.isArray(g.members) || !Array.isArray(g.expenses) || !Array.isArray(g.settlements)) return false
  const membersOk = g.members.every((m) => isObj(m) && isStr(m.id) && isStr(m.name) && (m.upiId === undefined || isStr(m.upiId)))
  const expensesOk = g.expenses.every(
    (e) =>
      isObj(e) && isStr(e.id) && isStr(e.description) && isInt(e.amount) && isStr(e.paidBy) && isStr(e.date) &&
      Array.isArray(e.splits) && e.splits.every((s) => isObj(s) && isStr(s.memberId) && isInt(s.share)),
  )
  const settlementsOk = g.settlements.every((s) => isObj(s) && isStr(s.id) && isStr(s.from) && isStr(s.to) && isInt(s.amount) && isStr(s.date))
  return membersOk && expensesOk && settlementsOk
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_STATE
    const parsed: unknown = JSON.parse(raw)
    if (!isObj(parsed)) return EMPTY_STATE
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups.filter(isGroup) : [],
      budget: isInt(parsed.budget) && parsed.budget >= 0 ? parsed.budget : 0,
      me: isStr(parsed.me) ? parsed.me.slice(0, 40) : '',
    }
  } catch {
    return EMPTY_STATE
  }
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage full or blocked — app keeps working in memory */
  }
}
