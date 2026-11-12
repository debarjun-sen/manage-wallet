# Manage Wallet — Feature Ticket List

**Basis:** v1.0.0 codebase review, 12 Nov 2026.
**Legend** — Priority: P0 must-have · P1 should · P2 nice · P3 later. Size: S (≤1 day) · M (2–3 days) · L (≈1 week) · XL (>1 week). Status: ✅ Done (shipped in v1.0) · ⬜ Open.

---

## Part A — Shipped baseline (for traceability)

| ID | Epic | Ticket | Status |
|---|---|---|---|
| MW-001 | Groups | Create group with 2–10 members, optional UPI IDs, validation | ✅ |
| MW-002 | Groups | Groups list with totals and settle status | ✅ |
| MW-003 | Groups | Delete group with confirmation | ✅ |
| MW-004 | Groups | Demo "Goa Trip" data with non-routable UPI handles | ✅ |
| MW-005 | Expenses | Add expense: amount, date, description, payer, participants | ✅ |
| MW-006 | Expenses | Equal / exact / percent split with exact-sum rounding | ✅ |
| MW-007 | Expenses | Live split status and validation messages | ✅ |
| MW-008 | Expenses | Keyword auto-categorisation | ✅ |
| MW-009 | Expenses | Edit and delete expense from History | ✅ |
| MW-010 | Parser | Paste SMS/UPI message → amount, payee, VPA, date, method | ✅ |
| MW-011 | Balances | Net balances and minimum-transfer suggestions | ✅ |
| MW-012 | Balances | Pay via UPI deep link | ✅ |
| MW-013 | Balances | Mark as settled; edit/delete settlements | ✅ |
| MW-014 | Share | WhatsApp summary; CSV export with injection guard | ✅ |
| MW-015 | Personal | Monthly budget, safe-to-spend today, category breakdown | ✅ |
| MW-016 | Platform | PWA manifest, offline service worker, hash routing | ✅ |
| MW-017 | Security | CSP + security headers pipeline; security unit tests | ✅ |
| MW-018 | Platform | Light/dark theme, reduced motion, a11y basics | ✅ |

---

## Part B — Backlog

### Epic 1 — Data safety (P0)

**MW-101 · Export / import full backup (JSON)** — P0 · M
As a user, I want to download and restore all my data so I don't lose it when I change phones or clear the browser.
- Settings/menu action "Back up data" downloads `manage-wallet-backup-YYYY-MM-DD.json` containing `{schemaVersion, exportedAt, state}`.
- "Restore" validates with the same type guards as `loadState`, caps file size (e.g. 5 MB), shows a summary (N groups, N expenses), and asks **Replace** or **Merge**.
- Invalid file shows a clear error and changes nothing.
- Unit tests for round-trip and malformed files.

**MW-102 · Storage schema versioning and migrations** — P0 · S
- Add `schemaVersion` to persisted state; `loadState` runs ordered migrators.
- Rename key strategy documented; tests for v1→v2 sample.

**MW-103 · Storage failure feedback** — P1 · S
- When `saveState` throws (quota/blocked), show a persistent banner "Changes can't be saved on this device — back up now".
- Test with a throwing `localStorage` stub.

**MW-104 · Backup reminder nudge** — P2 · S
- After N expenses or 14 days since last backup, show a dismissible reminder.

### Epic 2 — Group management (P1)

**MW-111 · Edit group name** — P1 · S
**MW-112 · Add member to existing group** — P1 · M
- Name/UPI validation identical to create; new member has zero balance; participates only in future expenses unless chosen in edits.
**MW-113 · Rename member / edit UPI ID** — P1 · M
- Updates all displays; `me` follows renames; warn when UPI ID changes (see MW-312).
**MW-114 · Remove member** — P1 · M
- Blocked if balance ≠ 0 or member appears in expenses; otherwise archive. Tests for reference integrity.
**MW-115 · Archive / restore group** — P2 · S

### Epic 3 — Expenses and splitting

**MW-121 · Split by shares / weights** (e.g. 2:1:1) — P2 · M
**MW-122 · Multiple payers for one expense** — P2 · L
**MW-123 · Itemised bill with tax/tip allocation** — P3 · L
**MW-124 · Recurring expenses** (rent, subscriptions; daily/weekly/monthly) — P2 · L
- Generates entries on app open; user can skip/edit; tests for month-end dates.
**MW-125 · Expense notes and receipt photo (stored locally)** — P3 · L
**MW-126 · Duplicate expense / "add similar"** — P2 · S
**MW-127 · Undo last delete/edit (toast with Undo)** — P1 · S
**MW-128 · Search, filter (member, category, date range) and sort in History** — P1 · M
**MW-129 · Editable category with per-expense override** — P2 · M
- Store `category` on expense; fall back to keyword rule; migration via MW-102.
**MW-130 · Custom category keywords** — P3 · M

### Epic 4 — Message parser

**MW-141 · Parser regression corpus** — P0 · M
- 100+ anonymised real bank/UPI/wallet messages (HDFC, SBI, ICICI, Axis, Kotak, GPay, PhonePe, Paytm, BHIM, Amazon Pay) with expected fields; CI target ≥ 90% amount, ≥ 75% payee.
**MW-142 · Support debit vs credit detection** — P1 · S
- Warn "This looks like money received" when message says credited/received.
**MW-143 · Multi-message paste (batch)** — P2 · M
- Split by blank line/timestamps, show a review list, add selected as expenses.
**MW-144 · Regional/number formats and languages (Hindi numerals, "Rs 1.2k")** — P3 · M
**MW-145 · Share-target / "Share to Manage Wallet" from SMS or UPI apps (Web Share Target)** — P2 · M
- Manifest `share_target`; opens Add with text prefilled.

### Epic 5 — Settlement

**MW-151 · Partial settlement amount before recording** — P1 · S
- "Mark as settled" opens a sheet with editable amount (default suggested), date, optional note.
**MW-152 · Over-settlement warning/validation** — P2 · S
**MW-153 · UPI payment confirmation sheet** — P1 · S
- Before opening `upi://`, show receiver name, VPA and amount; copy-VPA button; desktop fallback (QR code or copy) since deep links do nothing on desktop.
**MW-154 · QR code for UPI payment** — P2 · M
**MW-155 · Settle-all / per-person settle view** — P3 · M
**MW-156 · Reminder message template per debtor (WhatsApp)** — P2 · S

### Epic 6 — Sharing and sync (needs product decision)

**MW-161 · Decision spike: shared groups architecture** — P1 · M
- Compare E2E-encrypted link sharing, CRDT sync, and conventional backend+auth; deliver ADR, threat model update and cost estimate. Blocks MW-162–165.
**MW-162 · Read-only share link / image of balances** — P2 · M
**MW-163 · Shared group with live sync** — P2 · XL
**MW-164 · Authentication (passkeys/OTP)** — P2 · L
**MW-165 · Conflict resolution and audit trail** — P2 · L
**MW-166 · WhatsApp summary options (include UPI IDs toggle, preview)** — P1 · S
- Default excludes UPI IDs; preview text before opening.
**MW-167 · Export PDF / image statement for a group** — P3 · M

### Epic 7 — My month / personal finance

**MW-171 · Link "me" to a member id per group (not by name)** — P1 · M
- Resolve ambiguity when names differ or collide; migration from name.
**MW-172 · Per-category budgets** — P2 · M
**MW-173 · Personal (non-group) expenses** — P2 · L
**MW-174 · Month picker and history of previous months** — P2 · M
**MW-175 · Budget over-threshold alerts (75%, 100%) in-app** — P3 · S
**MW-176 · Correct "Per person" tile to reflect actual participants** — P2 · S

### Epic 8 — Security and privacy hardening

**MW-181 · Optional app lock (PIN/WebAuthn)** — P1 · L
- Lock on launch/after inactivity; failure limits; "forgot" = reset data.
**MW-182 · Optional at-rest encryption with passphrase (WebCrypto AES-GCM)** — P2 · L
- Key derivation (PBKDF2/Argon2 via WASM), encrypted blob in storage, clear UX about unrecoverable passphrase; interacts with MW-101.
**MW-183 · Remove `style-src 'unsafe-inline'`** — P2 · S
- Replace inline widths with CSS variables/classes; update `security-headers.mjs`; header test.
**MW-184 · Reference-integrity validation in `loadState`** — P1 · S
- Drop/repair expenses whose `paidBy`/splits/settlement members are missing; tests.
**MW-185 · Date validation on load and in forms** — P2 · S
- Enforce `YYYY-MM-DD` valid dates; reject far-future/impossible dates.
**MW-186 · Dependency and header CI checks** — P2 · S
- `npm audit`, lockfile review, post-deploy header assertion.
**MW-187 · In-app privacy note** — P1 · S
- Explains local-only storage, what sharing exposes (WhatsApp, CSV).
**MW-188 · Use `crypto.getRandomValues` where available in `uid()`** — P3 · S

### Epic 9 — Front-end quality and accessibility

**MW-191 · Replace native `confirm()` with accessible modal** — P1 · M
**MW-192 · Tabs: `aria-controls`, roving tabindex, arrow-key navigation** — P2 · S
**MW-193 · Progress bars as `role="progressbar"` with values** — P2 · S
**MW-194 · Contrast audit (amber/violet on light & dark)** — P2 · S
**MW-195 · Component test suite (React Testing Library)** — P1 · M
**MW-196 · E2E suite (Playwright): journeys J1–J5, offline, dark mode** — P1 · L
**MW-197 · Automated a11y checks (axe) in CI** — P2 · S
**MW-198 · Settings screen (theme override, currency/locale, backup, privacy, about)** — P2 · M
**MW-199 · Empty-state and first-run tutorial polish** — P3 · S
**MW-200 · Haptics/sound feedback on settle (optional)** — P3 · S

### Epic 10 — Platform and localisation

**MW-211 · Update-available prompt for new service-worker version** — P1 · M
**MW-212 · Service worker tests (install, update, offline fallback)** — P1 · M
**MW-213 · Replace regex-scraped precache with build-generated manifest** — P2 · M
**MW-214 · i18n framework + Hindi UI** — P2 · L
**MW-215 · Multi-currency / locale setting** — P3 · L
**MW-216 · iOS install guidance and splash assets** — P2 · S
**MW-217 · Optional privacy-preserving analytics (opt-in, aggregate)** — P3 · M
- Requires product decision (PRD open question 2).
**MW-218 · Property-based tests for splits and settlement** — P1 · S

---

## Part C — Suggested release plan

| Release | Theme | Tickets |
|---|---|---|
| **v1.1** (stabilise) | Don't lose data; fix correctness edges | MW-101, 102, 103, 127, 128, 141, 151, 153, 166, 184, 187, 191, 211, 218 |
| **v1.2** (group life) | Real groups change | MW-111–114, 142, 152, 171, 176, 195, 196, 212 |
| **v1.3** (power use) | Flexibility and polish | MW-121, 124, 126, 129, 143, 145, 156, 172, 174, 183, 192–194, 198 |
| **v2.0** (sharing) | Shared groups (after MW-161 decision) | MW-162–165, 181, 182, 214 |

## Part D — Dependencies

- MW-101 ← MW-102 (versioned format) → MW-182 (encrypted backups)
- MW-129, MW-171, MW-114 require MW-102 (migrations)
- MW-163 ← MW-161, MW-164, MW-165
- MW-153 ← MW-154 (QR fallback)
- MW-196 ← MW-195 (shared test fixtures)
