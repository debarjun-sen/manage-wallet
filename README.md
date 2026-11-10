# Manage Wallet

Split shared expenses with friends: add or paste an expense, instantly see who owes whom, settle up with one tap via UPI.

Installable PWA · React + TypeScript + Tailwind · no backend, all data in `localStorage` · works offline.

## Run

```bash
npm install && npm run dev
```

Open the printed URL. `--host` is on, so phones on the same Wi-Fi can open the **Network** URL too.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (balances, settlements, message parser) |
| `npm run typecheck` | TypeScript strict check |
| `npm run build && npm run preview` | Production build with service worker (needed for install / offline) |

> The service worker only registers in the production build. PWA install and offline mode need `localhost` or HTTPS; a plain `http://192.168.x.x` LAN URL works for the app but won't install.

## Demo script (≈60 s)

1. **Load demo** → opens the "Goa Trip" group (4 friends, 8 expenses, 1 settlement).
2. **Balances** tab: who pays whom in plain sentences, **Pay via UPI** and **Mark as settled** buttons, **Share on WhatsApp**.
3. **＋ Add** tab → tap a sample under *Paste SMS / UPI message* → the draft fills in → pick payer → **Add expense**.
4. **History** tab: edit or delete anything.
5. **My month** (bottom nav): monthly budget → *Safe to spend today*.

## Project layout

```
src/lib/        pure logic (unit-tested)
  money.ts      paise <-> ₹ formatting (Indian grouping)
  splits.ts     equal / exact / percent splits + validation
  balances.ts   net balance per member (always sums to 0)
  settle.ts     greedy min-cash-flow settlement
  parser.ts     SMS / UPI message parser
  category.ts   merchant -> category auto-tagging
  share.ts      UPI links, WhatsApp summary, CSV export
src/components/ UI screens
public/sw.js    offline service worker
```

All amounts are stored as integer **paise**.
