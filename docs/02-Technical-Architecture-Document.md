# Manage Wallet — Technical Architecture Document

| | |
|---|---|
| **Version** | Describes v1.0.0 as built |
| **Date** | 12 Nov 2026 |

---

## 1. Architecture overview

Manage Wallet is a **client-only single-page application**. There is no server, database or API. All state is held in React memory and mirrored to the browser's `localStorage`. A service worker makes the shell available offline.

```
┌───────────────────────────── Browser / installed PWA ─────────────────────────────┐
│                                                                                    │
│  index.html ─► main.tsx ─► App.tsx  (state, hash router, toast)                    │
│                              │                                                     │
│          ┌───────────────────┼─────────────────────────┐                           │
│          ▼                   ▼                         ▼                           │
│      Home list          GroupView (tabs)           Personal ("My month")           │
│      NewGroup           ├─ Balances                                                │
│                         ├─ AddExpense ─► ExpenseForm                               │
│                         └─ History    ─► ExpenseForm                               │
│                              │                                                     │
│                              ▼                                                     │
│   src/lib (pure, unit-tested):  money · splits · balances · settle · parser ·      │
│                                 category · share · storage · demo · util           │
│                              │                                                     │
│              ┌───────────────┴───────────────┐                                     │
│              ▼                               ▼                                     │
│        localStorage                    Service Worker (sw.js)                      │
│        key manage-wallet:v1            Cache "manage-wallet-v3"                    │
└────────────────────────────────────────────────────────────────────────────────────┘
        Outbound only by user tap:  upi://pay…  (UPI app)   https://wa.me/…  (WhatsApp)
```

**Design principles**
1. *Pure core, thin UI*: all money logic lives in `src/lib` as side-effect-free functions with unit tests.
2. *Integers only*: amounts are paise, never floats, so sums are exact.
3. *Derive, don't store*: balances, settlement suggestions, categories and monthly totals are recomputed from expenses and settlements.
4. *No network*: CSP `connect-src 'self'` makes this enforceable.

## 2. Technology stack

| Layer | Choice | Notes |
|---|---|---|
| UI | React 19 (StrictMode), function components + hooks | No state library |
| Language | TypeScript ~5.8, strict (`tsc --noEmit` in build) | |
| Styling | Tailwind CSS 4 via `@tailwindcss/vite` | Utility classes; one global `index.css` |
| Build | Vite 6, `@vitejs/plugin-react` | `dev` runs with `--host` for LAN testing |
| Tests | Vitest (node environment) | `src/**/*.test.ts`; logic only, no DOM tests |
| Hosting | Static: Vercel (`vercel.json`) or Netlify/Cloudflare Pages (`public/_headers`) | Both generated from one source |
| Runtime deps | `react`, `react-dom` only | Minimal supply-chain surface |

## 3. Repository layout

```
index.html                 Shell, meta, manifest link
security-headers.mjs       Single source of truth for HTTP security headers
vercel.json / public/_headers   Generated header configs (npm run headers)
vite.config.ts             React + Tailwind plugins; preview serves same headers; vitest config
scripts/                   write-headers.mjs, make-icons.mjs
public/                    sw.js, manifest.webmanifest, icons
src/
  main.tsx                 Mount + production-only SW registration
  App.tsx                  State owner, hash router, header, bottom nav, toast, Home view
  index.css                Tailwind import, focus ring, reduced-motion, `pop` keyframes
  components/              ui, NewGroup, GroupView, AddExpense, ExpenseForm, Balances, History, Personal
  lib/                     money, splits, balances, settle, parser, category, share, storage, demo, util, types
```

## 4. Data model

Defined in `src/lib/types.ts`. All amounts are integer paise.

```
AppState  { groups: Group[]; budget: number; me: string }
Group     { id; name; members: Member[]; expenses: Expense[]; settlements: Settlement[]; createdAt (ISO) }
Member    { id; name; upiId? }
Expense   { id; description; amount; paidBy: memberId; splits: Split[]; date "YYYY-MM-DD";
            source: 'manual'|'pasted'; splitMode?: 'equal'|'exact'|'percent' }
Split     { memberId; share }
Settlement{ id; from: memberId; to: memberId; amount; date "YYYY-MM-DD" }
```

Notes
- Groups embed their members, expenses and settlements (single JSON document; no joins).
- `Expense.splits` are the authoritative shares; `splitMode` is retained only so the edit form can reopen in the same mode.
- Category is **not stored**; it is recomputed from `description` each render, so changing keyword rules re-labels history.
- IDs come from `uid()` (timestamp + counter + random), chosen because `crypto.randomUUID` is unavailable on insecure LAN origins.
- `me` is a *name string*, matched case-insensitively to members in every group.

## 5. Core algorithms

| Module | Function | Behaviour |
|---|---|---|
| `money.ts` | `toPaise`, `formatINR`, `paiseToInput` | Accepts "₹1,200", "Rs. 80", "450.50"; rejects >2 decimals; `Intl` `en-IN` formatting. |
| `splits.ts` | `equalSplit` | `floor(amount/n)` each; remainder paise to the first members. |
| | `percentSplit` | Largest-remainder method so shares sum exactly. |
| | `buildSplits` | Validates mode-specific input; returns `{ok, splits}` or `{ok:false, error}`. |
| `balances.ts` | `computeBalances` | +amount to payer, −share per split, settlements shift from/to; sums to 0. |
| `settle.ts` | `minCashFlow` | Greedy largest creditor ↔ largest debtor; ≤ n−1 transfers; deterministic tie-break by id. |
| `parser.ts` | `parseMessage` | Input truncated to 1000 chars, whitespace collapsed; regexes for amount (₹/Rs/INR, Indian grouping, fallback on "debited/paid…"), payee (two patterns + VPA prettify), VPA, date (DD-MM-YY, "10 Nov"), method. Never throws. |
| `category.ts` | `categorize` | Word-start keyword match over ordered rules; default Other. |
| `share.ts` | `upiLink`, `whatsappSummary/Url`, `groupToCsv`, `downloadCsv` | URL-encoded params; CSV formula-injection guard; BOM; Blob download. |
| `storage.ts` | `loadState`, `saveState` | Structural validation per group; try/catch both ways. |

## 6. Application state and data flow

- `App` owns `AppState` via `useState(loadState)`; an effect runs `saveState` on every change (whole-document write).
- Group-scoped mutations flow through `updateGroup(id, fn)`, passed to `GroupView` as `update`. Child components never touch storage.
- `GroupView` holds only UI state (active tab). `ExpenseForm` holds local form state and emits a validated `Omit<Expense,'id'>`.
- Derived data (`computeBalances`, `minCashFlow`, category totals) is computed in `useMemo` inside view components.
- **Routing**: hash-based. `parseHash` ⇄ `toHash`; `go(route, replace?)` uses `pushState`/`replaceState` and a `hashchange` listener keeps Back/Forward in sync. A missing group id renders a "Group not found" state.
- **Feedback**: a single toast string in `App` rendered in a persistent `role="status"` live region (auto-clears after 2.5 s).

## 7. Offline and PWA

`public/sw.js` (cache `manage-wallet-v3`):
- **install**: fetch `/index.html` (no-store), extract `/assets/*` URLs by regex, precache with shell files, `skipWaiting`.
- **activate**: delete other caches, `clients.claim`.
- **fetch** (GET, same-origin only): navigations are network-first with cache fallback to `/index.html` (only caching OK, basic, non-redirected responses); other requests cache-first with runtime caching.
- Registered only in production builds (`import.meta.env.PROD`), on `load`; failure is swallowed.
- `sw.js` is served `Cache-Control: no-cache` so updates propagate.

Operational note: the cache name is a manual constant; bump it whenever the precache strategy changes (hashed assets already change per build).

## 8. Build, test and deploy

| Command | Effect |
|---|---|
| `npm run dev` | Vite dev server, `--host` |
| `npm run build` | `write-headers` → `tsc --noEmit` → `vite build` |
| `npm run preview` | Serves `dist` with the production security headers |
| `npm test` | Vitest: balances, settle, parser, security |
| `npm run icons` | Regenerates PNG icons |

Deployment is a static upload of `dist/`. Headers must be applied by the host (Vercel reads `vercel.json`; Netlify/Cloudflare read `_headers`). HTTPS is required for install and service worker (except `localhost`).

## 9. Testing strategy (current and recommended)

**Existing**: unit tests for balance sums, min-cash-flow, parser samples, and security (CSV injection, UPI link param hijacking, WhatsApp URL, parser ReDoS/length cap, storage validation, demo handles).

**Recommended additions**
- Property-based tests for `equalSplit`/`percentSplit` sums and `minCashFlow` zeroing.
- Component tests (React Testing Library) for `ExpenseForm` validation and `NewGroup` rules.
- E2E (Playwright) covering J1–J5, offline reload, and install criteria.
- A parser corpus test with real, anonymised bank/UPI messages.

## 10. Known limitations and technical debt

| # | Item | Impact |
|---|---|---|
| T-1 | Whole-state JSON write to `localStorage` on every change | Fine at small scale; ~5 MB quota; quota errors silently ignored |
| T-2 | Storage key `manage-wallet:v1` has no migration layer | Schema changes need a versioned migrator |
| T-3 | `loadState` validates shape but not references (e.g. `paidBy` not in members) | Balance code tolerates unknown ids via `?? 0`, but UI shows "Someone" |
| T-4 | Native `confirm()` dialogs | Inconsistent UX; blocks in some embedded webviews |
| T-5 | Settlement amount is not validated against current debt | Over-settling is possible via History edit |
| T-6 | Categories derived from free text on every render | Not user-correctable; rule changes rewrite history |
| T-7 | Personal view matches `me` by name | Name collisions or renames mis-attribute shares |
| T-8 | `per person` tile = total ÷ members, ignoring who actually participated | Can mislead for partial splits |
| T-9 | Date handled as strings; month filter uses `startsWith` | Works for ISO but not validated on load |
| T-10 | No DOM/E2E tests; service worker untested | Regressions possible in UI and offline paths |
| T-11 | Service worker precache relies on regexing built HTML | Brittle if the build output format changes |
| T-12 | Members cannot be edited after group creation | Data model supports it; UI does not |

## 11. Extension paths

1. **Backup/restore**: JSON export/import of `AppState` (schema version field).
2. **Shared groups**: add an optional sync layer (e.g. end-to-end-encrypted blob per group behind a share link, or CRDT-based) without changing the pure core; storage becomes an adapter interface (`load/save/subscribe`).
3. **IndexedDB** if data outgrows `localStorage`.
4. **Push/reminders** need a backend; keep optional so offline mode remains first-class.
5. **i18n/currency**: replace hard-coded `en-IN`/`INR` with a locale + currency setting stored in `AppState`.
