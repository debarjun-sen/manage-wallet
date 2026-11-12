# Manage Wallet — Frontend Specification Document

| | |
|---|---|
| **Version** | Describes v1.0.0 as built |
| **Date** | 12 Nov 2026 |
| **Stack** | React 19 · TypeScript · Tailwind CSS 4 · Vite 6 |

---

## 1. Design principles

1. **Mobile-first, one column**: content max width `max-w-2xl` (672 px), centred; designed for a phone held in one hand.
2. **Big, friendly, legible**: base 16 px (18 px at ≥1024 px for laptops/projectors), large rounded cards (`rounded-3xl`), bold headings (`font-black`), tabular numerals for money.
3. **Money is always plain language**: "Kabir pays Aman ₹3,400", "gets back ₹X", "owes ₹X".
4. **Fast entry**: autofocus on amount, live split feedback, paste-to-fill.
5. **Accessible by default**: 44 px minimum touch targets, visible focus, live regions, reduced motion, light/dark.
6. **No chrome dependency on emoji**: UI icons are inline SVG; emoji are used only as decoration (`aria-hidden`).

## 2. Information architecture and routing

Hash routing (`window.location.hash`); `history.pushState` for forward navigation and `replaceState` where Back should skip a screen (after create/delete).

| Route | Hash | Screen | Bottom nav |
|---|---|---|---|
| Home | `#/` | Groups list or empty-state onboarding | Yes |
| My month | `#/personal` | Budget and safe-to-spend | Yes |
| New group | `#/new` | Create-group form | No |
| Group | `#/group/<id>` | Tabs: Balances · Add · History | No |
| Unknown group | `#/group/<missing>` | "Group not found" empty state | No |

```
Home ─┬─ New group ─► Group (Balances | Add | History)
      └─ Group ──────► Group
My month (peer of Home via bottom nav)
```

## 3. Global layout

| Region | Spec |
|---|---|
| **Header** | Logo (icon.svg 40 px) + "Manage Wallet" (button → Home); right: **Demo** (ghost) and **Reset** (danger, native confirm). Top padding respects `env(safe-area-inset-top)`. |
| **Main** | `max-w-2xl px-4 pt-3`; bottom padding 128 px with nav, 64 px without. Scrolls to top on route change. |
| **Bottom nav** | Fixed; 2 equal items (Groups, My month); `aria-current="page"`; active = violet; respects safe-area inset; translucent blur. |
| **Toast** | Persistent `role="status" aria-live="polite"` container, bottom 96 px; pill with check icon; auto-dismiss 2.5 s; `pop` animation. |

## 4. Design tokens

### Colour (Tailwind palette)
| Role | Light | Dark |
|---|---|---|
| Page background | `slate-50` | `slate-950` |
| Text | `slate-900` | `slate-100` |
| Surface (card) | `white` + `ring-slate-200/80` | `slate-900` + `ring-slate-800` |
| Primary | `violet-600` (hover 700, active 800) | same; secondary text `violet-200` |
| Secondary button | `violet-100` / text `violet-800` | `violet-500/15` / `violet-200` |
| Success / "gets back" | `emerald-600` | `emerald-400` |
| Danger / "owes" | `rose-600` | `rose-400` |
| Warning | `amber-600/700` | `amber-400` |
| Hero gradient | `violet-600 → fuchsia-600` | `violet-700 → fuchsia-700` |
| WhatsApp button | `#128C7E` | — |
| PWA | `theme_color #7c3aed`, `background_color #0f172a` | |

### Typography
- Font stack: `ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (no web fonts).
- Scale used: page title `text-3xl font-black`; section `text-2xl font-extrabold`; card title `text-xl/2xl`; body `text-base/lg`; label `text-sm font-bold uppercase tracking-wide`; big figure `text-6xl font-black` ("Safe to spend today").
- Money uses `tabular-nums`.

### Shape and spacing
Cards `rounded-3xl p-5` (compact `!p-4`); controls `rounded-2xl`; chips `rounded-full`; page gap `gap-4/5`.

### Motion
Single `pop` keyframe (translateY 8px, scale .96 → none) for toast. `prefers-reduced-motion` clamps all animation/transition to ~0.

### Focus
`:focus-visible` → 3 px `#8b5cf6` outline, 2 px offset. Inputs use `focus:ring-2 ring-violet-500`.

## 5. Shared components (`components/ui.tsx`)

| Component | Props | Notes |
|---|---|---|
| `Icon` | `name: IconName`, `className` | Inline stroke SVG (24 viewBox), `aria-hidden`. Names: back, plus, scale, clock, users, target, zap, check, message, download, pencil, trash, clipboard, sparkles, x, alert, reset |
| `Card` | `className` | White surface, ring, shadow-sm |
| `Button` | `variant: primary\|secondary\|ghost\|danger\|success`, native button props | `min-h-11`, default `type="button"`, disabled style |
| `Chip` | `active` + button props | Toggle with `aria-pressed`; used for "Who paid?" |
| `inputCls` | string | Shared input style (filled slate, large text, violet ring) |
| `Label` | children | Uppercase caption |
| `Empty` | `emoji`, `title`, children | Dashed-border empty state |
| `Avatar` | `name` | Initial in coloured circle; colour = hash of name over 10 hues |

## 6. Screens

### 6.1 Home (`App.tsx › Home`)
- **Empty**: 💸 hero, headline "Split bills, not friendships.", subcopy, primary **Create a group**, secondary **Load demo data (Goa Trip)**, note "No sign-up. Everything stays on this device."
- **With groups**: title "Your groups" + **New group**; each group is a full-width card button: name (truncate), "N people · N expenses", total (`formatINR`), status line coloured amber ("N to settle") / emerald ("All settled") / "No expenses yet".

### 6.2 New group (`NewGroup`)
- Fields: Group name (max 40, autofocus); 3 default member rows (name ≤30 + UPI ID ≤60, `autoCapitalize=off`); up to 10 rows; remove button when >2; **Add person**.
- Inline `role="alert"` error banner with alert icon. Errors: missing name; <2 members; duplicate names; invalid UPI format.
- Submit **Create group** → group created, navigate with `replace`, toast `"<name>" created`.

### 6.3 Group view (`GroupView`)
- Header row: back (44 px circle), title (truncate) + member names (truncate), **Delete** (rose, confirm).
- Sticky `role="tablist"` segmented control: Balances / Add / History with icons; `aria-selected`.
- Initial tab: *Add* if no expenses else *Balances*.

### 6.4 Balances tab
1. Two stat cards: **Total spent**, **Per person**.
2. **Who pays whom**: per transfer card with "A pays B", amount in violet, and two actions: **Pay via UPI** (anchor with `upi://` link, or grey "No UPI ID for X") and **Mark as settled**. When none: 🎉 "All settled up!".
3. **Balances**: card listing members — avatar, name, status text (emerald/rose/grey), proportional bar scaled to the largest absolute balance.
4. Footer actions (2-col): **Share on WhatsApp** (opens `wa.me`, new tab, `noopener noreferrer`) and **Export CSV**.
5. Empty group: 🧾 "No expenses yet" with **Add first expense**.

### 6.5 Add tab (`AddExpense`)
- **Paste card** (violet→fuchsia gradient): title "Paste SMS / UPI message"; textarea (3 rows, `maxLength` 1000); buttons **Read message** (disabled when empty), **Paste from clipboard**, **Clear** (when content); "Try a sample" chips (Bank SMS · Zomato, Google Pay, PhonePe). Pasting into the textarea auto-parses.
- **Result banner** (`role="status"`): green "Got it!" with `₹amount · to payee · date · via method` and hint; amber "Couldn't read everything — fill in the rest below." or "Nothing recognised".
- **Form card**: heading "Or add manually" / "Review & save". The form is remounted (`key`) on each parse so the draft prefill applies.

### 6.6 Expense form (`ExpenseForm`)
| Field | Spec |
|---|---|
| Amount | ₹ prefix, `inputMode=decimal`, `text-3xl`, filters to `[0-9.,]`, autofocus when new |
| Date | native `type=date`, default today |
| What for? | max 80; auto-category pill (emoji + label) shown at right when text present; inline error "Add a short description…" with `aria-invalid`/`aria-describedby` after submit |
| Who paid? | `Chip` per member (single select) |
| Split between | "Everyone/Clear" toggle; mode switch Equal · ₹ Exact · % Percent; per-member checkbox rows (dimmed when off); numeric input (w-32) for Exact/Percent; live status text (green ✓ / amber remainder) |
| Submit | Primary "Add expense" (or custom label); optional Cancel |
| Errors | After first submit, `role="alert"` banner with the validation message |

Behaviours: switching to Exact/Percent pre-fills an even split; participants default to everyone; editing reopens the original mode and values (percent derived from shares).

### 6.7 History tab (`History`)
- Combined list of expenses and settlements, newest date first (ties: later-added first).
- **Expense card**: category emoji tile, description (truncate), amount, "X paid · split N ways (exact/%)", date, "from message" badge if pasted; **Edit** / **Delete** (confirm).
- **Settlement card** (emerald tint): check tile, "A paid B", "Settle-up · date", amount; **Edit** reveals an inline amount input with Cancel/Save; **Delete** (confirm).
- Editing an expense replaces the list with an "Edit expense" card containing the form.
- Empty: 🕰️ "Nothing here yet".

### 6.8 My month (`Personal`)
- Hero card: "Safe to spend today" (`text-6xl`) or "—" when no budget; sub-line with remaining and days left, or "Over budget by ₹X 😬".
- Settings card: **Monthly budget** (₹ input, writes through on each keystroke), **Who are you?** (select of distinct member names across groups; helper text if none), usage bar (`emerald <75%`, `amber 75–100%`, `rose ≥100%`).
- **Where it went**: category rows with emoji, label, amount, proportional violet bar.

## 7. State management

- Single `AppState` in `App` (`useState`), persisted by effect. Setters passed down as props (`update(fn)`, `setBudget`, `setMe`, `notify`, `go`).
- Local component state for forms/tabs; `useMemo` for derived values.
- No context or external store; revisit if prop drilling grows or sync is added.

## 8. Responsive behaviour

| Breakpoint | Change |
|---|---|
| < 420 px | Amount and date stack vertically |
| ≥ 420 px (`min-[420px]`) | Amount + date side by side (date w-44) |
| ≥ 640 (`sm`) | Larger transfer text/amount, larger tab labels |
| ≥ 1024 | Root font 18 px |
| All | Content capped at 672 px; safe-area insets for notched devices |

## 9. Accessibility

| Area | Implementation |
|---|---|
| Targets | `min-h-11` (44 px) on buttons, chips, nav (56 px), icon buttons 44 px |
| Semantics | `nav aria-label="Main"`, `aria-current`, `role=tablist/tab` + `aria-selected`, `aria-pressed` on chips, labelled inputs (`aria-label`), `aria-hidden` on decorative icons/emoji |
| Feedback | Toast live region always mounted; banners use `role=status/alert` |
| Focus | Global visible focus ring |
| Motion | Reduced-motion media query |
| Colour | Dual-theme; status never relies on colour alone (text states "owes"/"gets back") |
| Zoom | Viewport allows scaling; `viewport-fit=cover` |

Known a11y gaps: tabs lack `aria-controls`/roving-tabindex arrow-key support; native `confirm()` dialogs; progress bars are not exposed as `role="progressbar"`; heading levels inside group tabs jump straight to `h2`; coloured-text contrast on `amber-600` in light mode should be re-checked.

## 10. Content and copy

- Tone: casual, plain English; Indian context (₹, lakh grouping, UPI, WhatsApp).
- Currency formatting: `formatINR` → `₹1,20,000`; whole rupees omit decimals.
- Dates: `prettyDate` → `10 Nov 2026` (en-IN); inputs use ISO `YYYY-MM-DD`.
- Errors are specific and actionable ("₹200 still to assign", "need to total exactly 100%").

## 11. PWA front-end requirements

Manifest: name "Manage Wallet", short "Wallet", standalone, portrait, 192/512 PNG (512 maskable) + SVG icon. `apple-touch-icon` set. Service worker registered in production only. Install and offline need HTTPS or `localhost`.

## 12. Performance

- Bundle: React + app code only; no images beyond icons; no web fonts.
- Derived data memoised; expected data sizes (hundreds of expenses) need no virtualisation. Add list virtualisation or pagination if a group exceeds ~1,000 items.
- Whole-state serialisation on each change is the main scaling cost.

## 13. Front-end testing recommendations

- Component tests: `ExpenseForm` (mode switching, validation messages), `NewGroup` rules, `Balances` empty/settled/pending states.
- E2E: J1–J5 on a 375×667 viewport, dark mode, offline reload, install prompt criteria.
- Visual regression on key screens in light/dark.
- Automated a11y (axe) on each route.
