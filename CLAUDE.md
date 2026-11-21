# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Manage Wallet: an installable PWA for splitting shared expenses (India-focused: ₹, UPI, WhatsApp). React 19 + TypeScript (strict) + Tailwind 4 + Vite 6, hosted on Vercel.

It runs in two modes, chosen at build time:
- **Local-only** (no `VITE_SUPABASE_*` env vars): the original v1 app. No network calls, all state in `localStorage` (`manage-wallet:v1`), CSP `connect-src 'self'`. This mode must keep working unchanged.
- **Cloud** (env vars set): adds sign-in (Supabase email OTP), shared groups with invites/roles, Realtime sync and Web Push. Local groups still work exactly as before. A group syncs only after its owner shares it.

Client runtime deps are `react`, `react-dom` and `@supabase/supabase-js`. supabase-js is lazy-loaded via `src/cloud/supabase.ts`; never import it statically into the main bundle. `web-push` is only used by the server function.

Design docs are in `docs/`. `06-Shared-Groups-Install-and-Deploy.md` covers the cloud architecture, Supabase setup, env vars, deploy steps, iOS limits and the manual test checklist.

## Commands

```bash
npm run dev          # Vite dev server with --host (reachable from phones on the LAN). /api is not served here.
npm test             # vitest run (src/**/*.test.ts, node environment, logic only, no DOM tests)
npx vitest run src/lib/sync.test.ts        # single test file
npx vitest run -t "name of test"           # single test by name
npm run typecheck    # tsc for src + tsc -p api/tsconfig.json for the Vercel function
npm run build        # regenerates headers, typechecks both, then vite build
npm run preview      # production build with production headers (service worker, install, push)
npm run headers      # regenerate public/_headers and vercel.json from security-headers.mjs (+ VITE_SUPABASE_URL)
npm run icons        # regenerate icons, apple-touch-icon and iOS splash images (prints <link> tags for index.html)
npm run vapid        # generate a Web Push VAPID key pair
```

The service worker registers only in the production build (`import.meta.env.PROD` in `src/main.tsx`), so test install/offline/push with `npm run build && npm run preview`. Env vars go in `.env.local` (template: `.env.example`; gitignored).

## Architecture

- **`src/lib/`: pure, side-effect-free, unit-tested logic.** All money math belongs here, not in components.
  - `money.ts`: `formatINR` (Indian digit grouping) and `toPaise` (parses "₹1,200", "Rs. 80" and similar).
  - `splits.ts`: equal, exact and percent splits. Leftover paise are distributed so splits always sum exactly to the amount.
  - `balances.ts` (net per member, sums to 0), `settle.ts` (greedy min-cash-flow), `parser.ts` (SMS/UPI text; never throws), `share.ts` (UPI/WhatsApp links, CSV with formula-injection neutralisation).
  - `storage.ts`: `loadState` type-guards every field and drops invalid groups. A damaged `cloud` marker turns the group local-only instead of dropping it.
  - `sync.ts`: diff a group before/after an edit into row ops, outbox merging, server row ↔ local mapping, merging a full pull, and applying Realtime rows.
- **`src/App.tsx`** owns the entire `AppState` (no state library) and does hash routing (`#/`, `#/personal`, `#/new`, `#/group/<id>`, plus `#/account` and `#/join/<code>` in cloud mode). **Every state change goes through `commit(fn)`**, which works on `stateRef` synchronously; don't add `setState(updater)` calls. `updateGroup` diffs edits to shared groups and passes them to `engine.recordEdit`, so screens keep using plain `update(group => group)` callbacks and know nothing about sync.
- **`src/cloud/`**: `engine.ts` (`SyncEngine`: session, outbox in `manage-wallet:outbox:v1` with retry/backoff, full pull on start/focus/reconnect, Realtime subscription, group RPC wrappers; exposed to React through `useSyncExternalStore`), `push.ts` (Web Push subscribe), `supabase.ts` (`CLOUD_ENABLED`, lazy client).
- **`src/components/`**: screens. `GroupView` has tabs (Balances / AddExpense / History) and an optional `sharing` slot. Cloud UI is in `components/cloud/` (SignIn, Account, GroupSharing, JoinGroup, PickPerson).
- **`supabase/schema.sql`**: the whole backend (tables, RLS, triggers, `security definer` RPCs, Realtime publication). It is idempotent; rerun the full file in the SQL editor after changing it.
- **`api/notify.ts`**: Vercel Function. It sends Web Push to the other group members for a new expense/settlement, builds the text from the DB row, and claims the row's `notified` flag so each row notifies once.

### Invariants

- **All amounts are integer paise** (`Number.isSafeInteger` locally, `bigint` + `splits_valid()` check in Postgres). Convert at the UI boundary with `toPaise` / `paiseToInput`.
- **Derive, don't store**: balances, settlement suggestions, categories and monthly totals are recomputed from `expenses` + `settlements`.
- If you change the persisted shape in `types.ts`, update the guards in `storage.ts`, the row mapping in `sync.ts` and `supabase/schema.sql` together.
- IDs come from `util.uid()`, not `crypto.randomUUID` (that is unavailable on insecure LAN origins). Server keys are `(group_id, id)`. A group gets a fresh id when it is shared.
- Server rows are **soft-deleted** (`deleted = true`) so deletes travel through Realtime under RLS. Never hard-delete people/expenses/settlements from the client.
- Group membership, roles, invites, join/leave and group deletion only happen through the RPCs in `schema.sql` (`group_users` has no client write policies).

## Security constraints

- `security-headers.mjs` is the single source of truth for the CSP and other headers. `public/_headers` and `vercel.json` are **generated** by `npm run headers` (it adds exactly the `VITE_SUPABASE_URL` origin as https + wss to `connect-src`), so don't hand-edit them. Vercel reads `vercel.json` before building, so run `npm run headers` locally with the production URL and commit the result. On Vercel the build fails if the committed file doesn't match.
- Outbound requests are limited to that Supabase project and same-origin `/api/notify`. Links are user-tapped `upi://pay` and `https://wa.me/`, built with `encodeURIComponent`.
- Only `VITE_*` vars reach the browser. `SUPABASE_SERVICE_ROLE_KEY` and `VAPID_PRIVATE_KEY` are server-only (used in `api/`).
- No `dangerouslySetInnerHTML`, `eval` or dynamic script injection. Any new user text that reaches CSV, links or URLs needs escaping tests in `src/lib/security.test.ts`.
- Input limits are enforced in the UI (`maxLength`), in Postgres `check` constraints, and documented in `docs/03-Security-and-Access-Document.md` §5.2. Keep them in sync.
- `public/sw.js`: bump the `CACHE` name (`manage-wallet-vN`) whenever caching logic or the shell changes. Navigations are network-first; assets are cache-first; it also handles `push` / `notificationclick`.

## Repo notes

- `dist/` is in `.gitignore` but its files were committed earlier and are still tracked, so a build shows them as modified.
- `.claude/launch.json` defines the `dev` preview server for the desktop app's browser pane.
