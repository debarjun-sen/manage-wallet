/** All money values are integer paise (₹1 = 100 paise). */
export interface Member {
  id: string
  name: string
  upiId?: string
}

export interface Split {
  memberId: string
  share: number
}

export type SplitMode = 'equal' | 'exact' | 'percent'

export interface Expense {
  id: string
  description: string
  amount: number
  paidBy: string
  splits: Split[]
  date: string // YYYY-MM-DD
  source: 'manual' | 'pasted'
  splitMode?: SplitMode
}

export interface Settlement {
  id: string
  from: string
  to: string
  amount: number
  date: string // YYYY-MM-DD
}

/** Present only on groups shared through the cloud. Local-only groups never have it. */
export interface CloudInfo {
  role: 'admin' | 'member'
  inviteCode: string
  /** Which person (Member.id) in this group the signed-in user is, if they picked one. */
  memberId?: string
}

export interface Group {
  id: string
  name: string
  members: Member[]
  expenses: Expense[]
  settlements: Settlement[]
  createdAt: string
  cloud?: CloudInfo
}

export interface AppState {
  groups: Group[]
  budget: number // monthly budget in paise
  me: string // member name used for the personal tab
}
