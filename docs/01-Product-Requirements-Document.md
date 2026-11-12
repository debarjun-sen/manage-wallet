# Manage Wallet — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | Manage Wallet (v1.0.0) |
| **Type** | Installable PWA, offline-first, no backend |
| **Document status** | Reverse-engineered from the shipped codebase; "As built" sections describe what exists today, "Gaps" sections are proposals |
| **Date** | 12 Nov 2026 |

---

## 1. Summary

Manage Wallet is a bill-splitting app for friend groups in India. A user creates a group, adds expenses (by typing or by pasting a bank SMS / UPI app message), and instantly sees **who owes whom** in the fewest possible payments. Each payment can be completed with one tap through a UPI deep link, then marked as settled. A second screen, **My month**, turns the user's share of group spending into a "Safe to spend today" budget figure.

Everything runs in the browser. There is no account, no server and no network call; data lives in `localStorage` and the app works offline once installed.

## 2. Problem and opportunity

Friends sharing trips, flats and canteen bills in India already pay almost entirely through UPI. What they lack is a lightweight way to track *who paid for what* and to close the loop. Existing splitters are account-based, English/USD-centric, or require everyone to install the same app. Typical pain points:

- Expenses are scattered across UPI apps, SMS and chat; re-typing them is tedious.
- Working out "who pays whom" in a group of 4+ is error-prone.
- Settling needs a copy-paste of UPI IDs and amounts.
- Sign-up friction and privacy concerns about sharing financial data with a server.

## 3. Target users

| Persona | Context | Primary need |
|---|---|---|
| **Trip organiser** (e.g. Aman, Goa Trip) | Fronts large bookings for 3–9 friends | See balances in one glance, nudge others to pay |
| **College / hostel group** | Canteen, cabs, stationery, many small expenses | Fast entry, paste from UPI message, no sign-up |
| **Flatmates** | Rent, groceries, utilities, recurring | Clear running balance, CSV for records |
| **Budget-conscious individual** | Own share of group spend matters | Monthly budget and daily safe-to-spend |

## 4. Goals and non-goals

### Goals
1. A first expense can be added in under 15 seconds, including from a pasted message.
2. Balances are always correct to the paisa and always sum to zero.
3. Settling a debt takes at most two taps (Pay via UPI → Mark as settled).
4. Zero-friction onboarding: no sign-up, usable offline, installable.
5. Privacy by default: data never leaves the device unless the user shares it.

### Non-goals (v1)
- Moving money. The app only opens a UPI deep link; the user's UPI app executes the payment.
- Multi-device sync, shared live groups, or user accounts.
- Multi-currency (INR only, stored as integer paise).
- Reading SMS automatically (user pastes text; the app does not request SMS or clipboard permissions beyond an explicit tap).
- Receipt scanning / OCR.

## 5. Scope — features as built

### 5.1 Groups
| ID | Requirement | Behaviour in v1.0 |
|---|---|---|
| G-1 | Create a group | Name (≤40 chars), 2–10 members (≤30 chars each), optional UPI ID per member. Validation: name required, ≥2 members, unique names (case-insensitive), UPI ID must match `name@handle` pattern. |
| G-2 | List groups | Home shows name, member count, expense count, total spent and a status ("N to settle" / "All settled" / "No expenses yet"). |
| G-3 | Open a group | Deep-linkable at `#/group/<id>`; opens on *Add* if empty, otherwise *Balances*. |
| G-4 | Delete a group | Confirmation prompt, removes group and all its data. |
| G-5 | Demo data | "Goa Trip": 4 members, 8 expenses in all three split modes, 1 settlement. UPI IDs use non-routable `@example` handles. |

### 5.2 Expenses
| ID | Requirement | Behaviour in v1.0 |
|---|---|---|
| E-1 | Add expense | Amount (₹, up to 2 decimals), date (default today), description (≤80 chars), payer, participants, split mode. |
| E-2 | Split modes | **Equal** (remainder paise distributed one each to first members), **Exact ₹** (must sum to total), **Percent** (must total 100%, largest-remainder rounding). Switching mode pre-fills an even split. |
| E-3 | Live validation | Status line shows "₹X each", "₹X left to assign", "✓ Adds up to 100%"; submit errors are explicit. |
| E-4 | Auto-category | Description keywords map to Food, Travel, Stay, Fun, Shopping, Other; shown as a chip while typing. |
| E-5 | Edit / delete expense | From History; editing reuses the same form. Delete asks for confirmation. |
| E-6 | Paste a message | Textarea (max 1000 chars), "Read message", "Paste from clipboard", three sample messages. Parser extracts amount, payee, UPI handle, date (DD-MM-YY and "10 Nov") and method (GPay, PhonePe, Paytm, BHIM, UPI). Result banner shows what was recognised; the user still picks payer and split. |

### 5.3 Balances and settlement
| ID | Requirement | Behaviour in v1.0 |
|---|---|---|
| B-1 | Net balance per member | Bar + text: "gets back ₹X", "owes ₹X", "settled up". |
| B-2 | Minimum transfers | Greedy min-cash-flow; at most *n−1* transfers; presented as "A pays B ₹X". |
| B-3 | Summary tiles | Total spent; per person (total ÷ members). |
| B-4 | Pay via UPI | `upi://pay?pa&pn&am&cu=INR` link when the receiver has a UPI ID; otherwise "No UPI ID for X". |
| B-5 | Mark as settled | Records a settlement dated today for the suggested amount; balances update instantly. |
| B-6 | Settlement history | Listed with expenses; amount editable, deletable. |
| B-7 | Share on WhatsApp | `wa.me` link with a formatted summary (total, who pays whom, UPI IDs). |
| B-8 | Export CSV | Expenses and settlements, UTF-8 BOM, formula-injection neutralised. |

### 5.4 My month (personal budget)
| ID | Requirement | Behaviour in v1.0 |
|---|---|---|
| P-1 | Monthly budget | Free-text ₹ amount, stored in paise. |
| P-2 | "Who are you?" | Pick a name drawn from all group members; identity is matched by name across groups. |
| P-3 | Spend this month | Sum of the user's *share* of every expense dated in the current month. |
| P-4 | Safe to spend today | (Budget − spent) ÷ days left including today; 0 if over budget; over-budget message. |
| P-5 | Category breakdown | Share per category with proportional bars. |

### 5.5 Platform
- Installable PWA (manifest, 192/512 icons, maskable), standalone, portrait.
- Offline: service worker precaches shell and built assets; navigation is network-first with cached fallback.
- Hash routing (`#/`, `#/personal`, `#/new`, `#/group/<id>`); Back button works.
- Global **Reset** clears all local data after confirmation.
- Light and dark themes via `prefers-color-scheme`; reduced-motion respected.

## 6. User journeys

**J1 — First use.** Open app → *Create a group* (or *Load demo*) → add members → land on *Add* → type or paste first expense → *Balances* shows the result.

**J2 — Paste and split.** *Add* → tap *Paste from clipboard* → draft fills with amount/payee/date → pick payer, split mode → *Add expense* → toast confirms → *Balances*.

**J3 — Settle up.** *Balances* → "Kabir pays Aman ₹3,400" → *Pay via UPI* (UPI app opens) → return → *Mark as settled* → row disappears; "All settled up!" when empty.

**J4 — Correct a mistake.** *History* → *Edit* an expense → *Save changes*; or delete with confirmation.

**J5 — Check my budget.** *My month* → set budget, pick my name → read "Safe to spend today".

## 7. Functional rules and invariants

1. All money is an integer number of paise; display uses `en-IN` grouping.
2. For every expense, the sum of splits equals the amount exactly.
3. Group balances always sum to zero.
4. A minimum-transfer list, once applied, zeroes every balance.
5. A settlement of A→B increases A's balance and decreases B's.
6. Persistent data is schema-validated on load; invalid groups are dropped, not crashed on.
7. Member names within a group are unique (case-insensitive).

## 8. Success metrics

Because the app has no analytics or backend, metrics are either manual (user tests) or require an opt-in telemetry decision (see Open Questions).

| Metric | Target |
|---|---|
| Time from launch to first saved expense (demo script) | < 60 s end to end; < 15 s for a pasted message |
| Parser recognised-amount rate on Indian bank/UPI messages | ≥ 90% on a test corpus of 100 real samples |
| Balance correctness | 100% (property-tested: sums to zero, transfers zero balances) |
| Lighthouse PWA / Accessibility | PWA installable; Accessibility ≥ 95 |
| Offline load | 100% of core flows work with network disabled after first load |

## 9. Gaps and proposed enhancements

These are not in v1.0. Each maps to a ticket in the Feature Ticket List.

| Area | Gap | Why it matters |
|---|---|---|
| Data safety | No backup/restore; clearing site data or switching phones loses everything | Highest-risk limitation of a local-only app |
| Groups | Members cannot be added, renamed or removed after creation | Real groups change |
| Settlements | "Mark as settled" only records the suggested amount; partial payments need History edit | Common real-world case |
| Sharing | No way for friends to see the same group | Core expectation of splitters; needs a sync/backend decision |
| Budget | Identity is a name match, not a member link; no per-category budgets | Fragile if names differ across groups |
| Parser | Regex-based; limited to common formats | Coverage varies by bank |
| Categories | Fixed keyword list, derived at render time (not editable) | Users cannot correct a wrong tag |
| Localisation | English only; INR only | Reach |
| Recurring | No recurring expenses (rent) | Flatmate use case |

## 10. Assumptions, risks, open questions

**Assumptions:** users are on Android/iOS browsers with UPI apps installed; groups are small (≤10); one device holds the "source of truth" for a group.

**Risks**
- Local-only storage means data loss with no recovery (mitigate: export/import, reminder to back up).
- UPI deep links behave differently across apps/devices and do nothing on desktop.
- Parser false positives could mis-record an amount (mitigated by the review-before-save step).

**Open questions**
1. Is multi-device/shared-group sync in scope, and if so, accounts or link-based sharing?
2. Is anonymous, opt-in analytics acceptable given the "everything stays on this device" promise?
3. Should the app verify settlements (it cannot confirm that a UPI payment completed)?
4. Which regions beyond India (currency, payment rails) are targeted?
