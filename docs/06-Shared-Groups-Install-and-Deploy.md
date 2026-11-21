# Manage Wallet: Installable app, shared groups, deployment

| | |
|---|---|
| **Version** | v2.0 (adds cloud-shared groups on top of v1.0) |
| **Date** | 22 Nov 2026 |
| **Backend** | Supabase (Postgres + Auth + Realtime) and one Vercel Function for push |

---

## 0. Setup checklist (things only you can do)

1. **Create a Supabase project** at supabase.com (free tier is enough). Pick a region close to your users (Mumbai `ap-south-1` for India).
2. **Run the schema**: Supabase Dashboard → SQL Editor → paste all of `supabase/schema.sql` → Run.
3. **Turn on email codes**: Authentication → Sign In / Providers → Email: enabled. Then Authentication → Emails → Templates: in **both** "Magic Link" and "Confirm signup", put the code in the email body, e.g. `Your Manage Wallet code is {{ .Token }}`. (Leaving the link in is fine; the app uses the code.)
4. **Set the Site URL**: Authentication → URL Configuration → Site URL = `https://manage-wallet-jet.vercel.app`.
5. **Custom SMTP (before real users)**: Supabase's built-in email sender is only for testing and allows very few emails per hour. Add an SMTP provider (Resend, Postmark, Amazon SES, …) under Authentication → Emails → SMTP Settings.
6. **Generate push keys**: `npm run vapid` prints a public and a private key.
7. **Copy keys** into `.env.local` (from `.env.example`) and into Vercel → Project → Settings → Environment Variables (section 5).

Everything else has a default: invite codes are 8 characters, groups are capped at 10 people like before, and any member can add, edit or delete expenses (as on a single device today).

---

## 1. Why Supabase

Supabase gives Postgres with row-level security, email OTP auth and Realtime row streaming as one managed service that the browser can call directly. The app stays a static Vite site on Vercel, and the only server code is a ~100-line function for Web Push. Firebase would work too, but its NoSQL rules fit the relational group → people → expenses data less naturally, and Postgres lets us enforce money invariants (splits sum to the amount, integer paise) in the database itself.

---

## 2. What changed (and what didn't)

- **Local groups behave exactly as before.** Without the Supabase env vars, the build is the v1 app: no sign-in UI, no network, same CSP.
- With the env vars, the app gains a **Sign in** tab, a **Share** card on each group, and a **Join** screen (`#/join/CODE`).
- A group becomes shared only when its owner taps **Share this group**. Existing data is never uploaded automatically.

### Architecture

```
UI components (unchanged) ──update(group => group)──► App.tsx commit()
                                                       │
                       local group ◄───────────────────┤ shared group (group.cloud set)
                       (localStorage only)             ▼
                                         sync.ts diffGroup(prev, next) → row ops
                                                       ▼
                                engine.ts outbox (localStorage) ─► Supabase (upsert / soft delete)
                                     ▲                                  │
                                     └──── Realtime row changes ◄───────┘ (RLS-filtered)
                                     └──── full pull on start / focus / reconnect
new expense/payment ─► POST /api/notify (Vercel) ─► Web Push ─► other members' service workers
```

- `src/lib/sync.ts`: pure diff, outbox merging, row mapping and merge logic (unit-tested in `sync.test.ts`).
- `src/cloud/engine.ts`: session, outbox replay with retry/backoff, full pulls, Realtime subscription, group RPCs.
- `src/cloud/push.ts`: Web Push subscribe/unsubscribe. `public/sw.js` shows notifications and opens the group on tap.
- `api/notify.ts`: builds the message from the database row (never from client text), checks that the caller created the row and is in the group, and notifies each row once.

### Data model

| Table | Key | Notes |
|---|---|---|
| `groups` | `id` | name, `invite_code` (8 chars, no look-alike letters) |
| `group_users` | `(group_id, user_id)` | `role` admin/member, `member_id` = which person in the split this user is |
| `people` | `(group_id, id)` | the existing `Member`s; people without the app stay as plain names |
| `expenses` | `(group_id, id)` | `amount` bigint paise, `splits` jsonb, check: splits sum to amount; FK `paid_by` → people |
| `settlements` | `(group_id, id)` | FK `from_id`/`to_id` → people |
| `profiles` | `id` | display name shown to group mates |
| `push_subscriptions` | `endpoint` | one per device |

Rows are **soft-deleted** (`deleted = true`) so deletions reach other devices through Realtime under the same access rules. `created_by`, `created_at` and `group_id` are fixed by a trigger, so clients can't forge or move rows.

Locally, the only change to the stored shape is an **optional** `cloud` field on `Group` (`role`, `inviteCode`, `memberId`). The localStorage key stays `manage-wallet:v1`, and old data loads unchanged.

### Migration path for existing data

1. Nothing happens on upgrade. All existing groups stay local.
2. The owner opens a group → **Share** → signs in → picks "which one is you" → **Share this group**. The group, its people, expenses and settlements are uploaded once (original order kept). The group gets a new server id; all inner ids stay the same. If the upload fails halfway, the server copy is deleted and the local group is untouched.
3. Friends join with the invite and pick their own name, or add themselves.
4. If a shared group is deleted by an admin, or you're removed, your device keeps a **local copy** instead of losing the data.
5. Signing out removes shared groups from that device. They stay in the account and come back when you sign in, on any device.

### Access rules (enforced by Postgres row-level security)

| Action | Who |
|---|---|
| See a group, its people, expenses, settlements, members | members of that group only |
| Add/edit/delete expenses and settlements | any member |
| Add a person (e.g. "add me" on join) | any member |
| Rename/remove people, rename group | admins |
| Invite code: view/share | any member · **new code** (old link stops working): admins |
| Make admin / make member / remove a user | admins (a group always keeps at least one admin) |
| Delete group for everyone | admins |
| Leave | anyone; the last admin leaving promotes the longest-standing member; the last person leaving deletes the group |

Verified against a local Postgres 14: outsiders see 0 rows and can't insert, members can't rotate codes, change roles or insert into `group_users`, forged `created_by` is reset, splits that don't add up and unknown payers are rejected, and leave/promote/delete behave as listed.

---

## 3. Installing the app

The app is a Progressive Web App: manifest, service worker (offline), maskable icons, Android splash from the manifest, and iOS launch images for every iPhone size (`public/splash/`, generated by `npm run icons`).

### Android (Chrome, Edge, Samsung Internet)
1. Open `https://manage-wallet-jet.vercel.app` in Chrome.
2. Tap **Install app** in the banner, or ⋮ menu → **Install app** / **Add to Home screen** → **Install**.
3. Open **Wallet** from the home screen: it runs full-screen with a splash screen.
4. Invite links tapped in WhatsApp usually open straight in the installed app (Chrome links installed PWAs to their site).

### iPhone / iPad (Safari, iOS 16.4+ for notifications)
1. Open the site in **Safari** (on iOS 17+ other browsers' Share → Add to Home Screen also works).
2. Tap **Share** (square with arrow) → **Add to Home Screen** → **Add**.
3. Open **Wallet** from the Home Screen. Sign in **inside the installed app**: the Safari tab and the Home Screen app have separate storage.

### iOS limitations that affect these features
- **Notifications only work in the Home Screen app** (iOS 16.4+), never in a Safari tab, and only after you tap **Turn on notifications** (Account screen).
- **Invite links open in Safari, not in the installed app.** Join inside the app with **Join a friend's group with a code** and type the 8-character code. The invite message always includes the code for this reason.
- **Separate storage**: data and sign-in in Safari are not shared with the Home Screen app, so use one of them.
- **Storage can be evicted**: iOS may clear a web app's storage after weeks of non-use. Shared groups come back from the server when you sign in. Local-only groups don't, so share groups you care about.
- **No background sync**: queued offline edits are sent the next time the app is opened while online.
- **No install prompt**: iOS never shows an "Install" banner; users have to use Add to Home Screen.

### Offline behaviour
- Everything that worked offline before still does (the app shell and assets are cached by `public/sw.js`, cache `manage-wallet-v4`).
- Edits to shared groups made offline are queued (`manage-wallet:outbox:v1`) and sent automatically when back online. The group card shows "Offline · N changes waiting".
- Signing in, joining, sharing and admin actions need a connection.
- Conflicts: the last write to the same expense wins. Edits to different expenses never conflict.

---

## 4. Local development

```powershell
npm install
copy .env.example .env.local    # then fill in the values
npm run headers                 # puts your Supabase origin into the CSP (vercel.json, public/_headers)
npm run dev                     # sign-in, sharing, sync work; push needs the production build
npm test
npm run typecheck
npm run build; npm run preview  # service worker + install + offline + push (on localhost)
```

`/api/notify` doesn't run under `vite`. To try push locally, use `npx vercel dev` (after `npx vercel link`), or test on a Vercel preview deployment.

---

## 5. Deploying to Vercel

Environment variables (Vercel → Project → Settings → Environment Variables). Set them for **Production and Preview**:

| Name | Value | Exposed to browser? |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | yes (public) |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key | yes (public; RLS protects data) |
| `VITE_VAPID_PUBLIC_KEY` | public key from `npm run vapid` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | **no**. Mark it Sensitive |
| `VAPID_PRIVATE_KEY` | private key from `npm run vapid` | **no**. Mark it Sensitive |
| `VAPID_SUBJECT` | `mailto:you@yourdomain` | no |

Then:

```powershell
npm run headers
```
```powershell
git add -A
```
```powershell
git commit -m "Add installable app and shared groups"
```
```powershell
git push
```

If the Vercel project is connected to the Git repo, the push deploys it. Otherwise, with the CLI:

```powershell
npx vercel link
```
```powershell
npx vercel --prod
```

Notes:
- Vercel reads `vercel.json` (which holds the CSP) **before** building. `npm run headers` must therefore run locally with the same `VITE_SUPABASE_URL`, and the result must be committed. The build fails with a clear message if the committed file doesn't match, rather than shipping a CSP that blocks Supabase.
- `api/notify.ts` is picked up automatically as a Vercel Function. Without the VAPID/service-role variables it returns 204 and the app works without push.
- After deploying, check the headers: `curl -sI https://manage-wallet-jet.vercel.app | findstr /i content-security` should list your Supabase origin under `connect-src`.

---

## 6. Manual test checklist

Use two phones (A = Android/Chrome, B = iPhone/Safari) or one phone and a desktop browser in a private window.

**Regression (v1 behaviour)**
- [ ] With no Supabase env vars: no Sign-in tab, no Share card, header/home/group screens look as before; `npm test` passes.
- [ ] Demo, add/paste expense, history edit/delete, settle, WhatsApp, CSV, My month all work on a local group.

**Install**
- [ ] A: Install from Chrome → icon on home screen → opens full-screen with violet-on-dark splash.
- [ ] B: Share → Add to Home Screen → opens full-screen; launch image shows; status bar readable.
- [ ] Airplane mode → relaunch on both → app opens and local groups work.

**Sign-in**
- [ ] A: Sign in tab → email → receive email with a 6-digit code → enter → "Signed in as …". Set a display name.
- [ ] B (inside the Home Screen app): same; wrong code shows an error; "Use a different email" works.

**Create and share**
- [ ] A: create a group (or open an existing one) → Share → pick yourself → Share this group → card shows "Shared · admin" and an 8-character code; the home list shows "Shared".
- [ ] All existing expenses and settlements are still there with the same balances.

**Join from a second device**
- [ ] A: Share invite → send to B via WhatsApp.
- [ ] B: in the installed app, Groups → "Join a friend's group with a code" → enter the code → the group name and head-count show → Join → pick your name (or "I'm not on the list" → add) → the group opens with all data.
- [ ] A desktop browser opening the invite link directly lands on the Join screen with the code filled in.
- [ ] A: Invite panel → "On the app" lists both users with roles.

**Shared data syncing**
- [ ] B adds an expense → it appears on A within a few seconds without refreshing; balances match on both.
- [ ] A edits that expense, B deletes another, A marks a payment settled → all of it shows on the other phone.
- [ ] B goes offline, adds an expense (card shows "Offline · 1 change waiting"), back online → it syncs and appears on A.
- [ ] Sign in as A on a third device/browser → shared groups download automatically.

**Roles and access**
- [ ] B (member) sees no "New code", "Make admin" or "Delete for everyone".
- [ ] A makes B admin → B sees admin controls. A makes B member again.
- [ ] A removes B → on B's next sync the group becomes local-only with a notice.
- [ ] A taps New code → the old code shows "No group with that code".
- [ ] B: Leave → the group disappears from B; A still has it.
- [ ] A: Delete for everyone → gone for A; B keeps a local copy with a notice.

**Push notifications** (production URL, installed app)
- [ ] A and B: Account → Turn on notifications → allow.
- [ ] B adds an expense → A gets "‹Group›: B added ₹… · …"; tapping it opens that group.
- [ ] B records a settlement → A is notified. B gets no notification for their own actions.
- [ ] iPhone Safari tab (not installed) shows "add to Home Screen first" instead of the button.
- [ ] Sign out → this device stops receiving notifications.

---

## 7. Known limits and next steps
- Last-write-wins per row. There's no per-field merge or edit history UI yet (soft-deleted rows are kept server-side, which is a base for an audit trail; ticket MW-165).
- Any member can delete any expense, matching the single-device trust model. To restrict deletes to the creator or admins, add a `with check` on `deleted` in the expenses/settlements update policies.
- `join_group` has no rate limit. Codes are 40-bit random, and admins can rotate them. Add Supabase rate limiting or a CAPTCHA if codes leak publicly.
- Privacy: shared groups now store names, UPI IDs and amounts on Supabase. Publish a privacy notice and offer account deletion before a public launch (see `03-Security-and-Access-Document.md` §8).
