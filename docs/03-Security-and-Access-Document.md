# Manage Wallet — Security & Access Document

| | |
|---|---|
| **Version** | Describes v1.0.0 as built |
| **Date** | 12 Nov 2026 |
| **Scope** | Client-side PWA; static hosting; no backend, no accounts |

---

## 1. Security posture in one paragraph

Manage Wallet has a deliberately small attack surface: no server, no authentication, no third-party scripts, no runtime network calls (CSP `connect-src 'self'`), and only two runtime dependencies (React, React DOM). All data stays in the user's browser. The main risks are therefore **(a) client-side injection/abuse of user-supplied text, (b) physical or browser-level access to the device's stored data, (c) integrity of the static hosting and headers**, and **(d) privacy leaks through user-initiated sharing** (WhatsApp, CSV, UPI links).

## 2. Assets and data classification

| Asset | Sensitivity | Where |
|---|---|---|
| Group, member names | Low–Medium (personal data) | `localStorage` |
| Member UPI IDs (VPAs) | **Medium–High** (financial identifier) | `localStorage`, UPI links, WhatsApp text |
| Expense descriptions, amounts, dates | Medium (spending behaviour) | `localStorage`, CSV |
| Monthly budget, `me` | Medium | `localStorage` |
| Pasted SMS/UPI message text | **High** while in memory (may include account fragments, ref numbers) | Component state only; **not persisted** — only parsed fields are saved |

No passwords, tokens, card numbers or bank credentials are collected or stored.

## 3. Access model

| Aspect | As built |
|---|---|
| Authentication | None. |
| Authorisation / roles | None. Whoever can open the browser profile can read and modify all data. |
| Multi-user | Not supported; "members" are labels, not identities. |
| Session | None. |
| Data scope | Per browser profile and origin (`localStorage`). |
| Reset | Header **Reset** clears state after confirm. |

Implication: **device security is the access control.** Users should rely on device lock, OS user separation, and not use the app in shared/kiosk browsers.

## 4. Threat model (STRIDE-lite)

| # | Threat | Vector | Status |
|---|---|---|---|
| S-1 | **XSS** via expense/group/member names, pasted text | Rendering untrusted strings | Mitigated: React escapes by default; no `dangerouslySetInnerHTML`; strict CSP (`script-src 'self'`) |
| S-2 | **Third-party script / CDN compromise** | External resources | Mitigated: no external scripts/fonts/analytics; CSP `default-src 'self'` |
| S-3 | **CSV/formula injection** | Description or name starting `= + - @ \t \r` exported to Excel/Sheets | Mitigated: values prefixed with `'`; tests cover descriptions and member names |
| S-4 | **UPI link parameter hijacking** | Crafted name/UPI ID containing `&pa=…` | Mitigated: all params `encodeURIComponent`-ed; test asserts single `pa` |
| S-5 | **Mis-payment via wrong UPI ID** | Typo or malicious ID entered by a group member | Partially mitigated: format validation only; no ownership verification; user confirms inside their UPI app |
| S-6 | **ReDoS / UI freeze** via huge or crafted paste | `parseMessage` regexes | Mitigated: 1000-char cap, textarea `maxLength`, perf test (<200 ms on 400 KB input) |
| S-7 | **Tampered / corrupted storage** | Edited `localStorage`, bad JSON | Mitigated: per-group structural validation; invalid groups dropped; safe-integer checks; `me` capped at 40 chars |
| S-8 | **Clickjacking** | Embedding in iframe | Mitigated: `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| S-9 | **Tabnabbing / referrer leak** | `target=_blank` link to WhatsApp | Mitigated: `rel="noopener noreferrer"`; `Referrer-Policy: no-referrer` |
| S-10 | **Demo data pays a real stranger** | Demo UPI IDs | Mitigated: demo uses non-routable `@example` handles; test enforces it |
| S-11 | **Stale/poisoned service-worker cache** | Caching error pages/redirects | Mitigated: only OK, basic, non-redirected GETs cached; same-origin only; `sw.js` is `no-cache` |
| S-12 | **Data theft by local attacker** | Physical access, malicious browser extension, shared profile | **Not mitigated** (plaintext `localStorage`) — see recommendations |
| S-13 | **Privacy leak through sharing** | WhatsApp summary includes receivers' UPI IDs; CSV contains all names/amounts | Accepted by design (user-initiated); should be disclosed in UI |
| S-14 | **Clipboard exposure** | "Paste from clipboard" reads clipboard text | Mitigated: only on explicit tap; failure is silent; text not persisted |
| S-15 | **Integrity of hosting / MITM** | HTTP downgrade | Mitigated: HSTS (1 year, includeSubDomains); HTTPS required for SW/PWA |
| S-16 | **Repudiation / tampering by another member** | No audit trail | Out of scope (single-device); noted for any future shared mode |

## 5. Implemented controls

### 5.1 HTTP security headers
Single source: `security-headers.mjs` → generates `vercel.json` and `public/_headers`; `vite preview` serves the same set.

| Header | Value |
|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `no-referrer` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| Cross-Origin-Opener-Policy | `same-origin` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| `/sw.js` Cache-Control | `no-cache` |

Known weakness: `style-src 'unsafe-inline'` (needed for inline `style` width attributes on progress bars). Risk is low (no script injection path) but it weakens CSS-injection defence.

### 5.2 Input handling
| Input | Controls |
|---|---|
| Group name | max 40 chars, trimmed, required |
| Member name | max 30 chars, unique per group (case-insensitive), ≥2 members, ≤10 |
| UPI ID | max 60 chars; regex `^[\w.-]{2,}@[a-z][a-z0-9]+$`; lowercased |
| Amount | numeric chars only in the field; `toPaise` rejects >2 decimals and non-numeric; must be >0 |
| Description | max 80 chars; required |
| Split values | numeric-only filter; exact must sum to total; percent must total 100 |
| Pasted message | max 1000 chars; truncated before regex; parser never throws |
| Storage on load | type guards on every field; safe-integer amounts; invalid groups discarded |

### 5.3 Output handling
- All dynamic text is rendered via React text nodes.
- URLs are built only with `encodeURIComponent` on a fixed scheme/host (`upi://pay`, `https://wa.me/`).
- CSV values are quoted/escaped and formula-neutralised; filename is sanitised (`[^\w-]+` → `_`).
- Blob URLs are revoked after download.

### 5.4 Supply chain
Runtime dependencies: `react`, `react-dom`. Everything else is build/test-time. Lockfile committed.

### 5.5 Existing automated security tests (`security.test.ts`)
CSV injection (4 payloads + member names), UPI link hijack, WhatsApp URL shape, demo handles, parser ReDoS timing and length cap, storage validation and invalid JSON.

## 6. Privacy

- **No telemetry, no accounts, no cookies, no third-party requests.**
- Data never leaves the device unless the user taps *Share on WhatsApp*, *Export CSV*, or *Pay via UPI*.
- Pasted message text is parsed in memory; only amount, payee text, date and a `source: 'pasted'` flag are saved.
- WhatsApp summary and CSV include other people's names and (for WhatsApp) UPI IDs; the user is the sharer and should have those people's consent.
- Relevant regimes (India's DPDP Act 2023, GDPR if used in the EU) apply mainly to the *user* as a household/personal processor; if a backend or analytics is added, a privacy notice, consent and deletion flows become mandatory.

## 7. Risk register and recommendations

| ID | Risk | Likelihood | Impact | Recommendation | Priority |
|---|---|---|---|---|---|
| R-1 | Plaintext local data readable by anyone with device/profile access | Medium | Medium | Optional app lock (PIN/biometric via WebAuthn) and/or at-rest encryption with a passphrase-derived key (WebCrypto AES-GCM); document limits | P1 |
| R-2 | Data loss (clear site data, new phone) | High | High | JSON export/import with schema version; periodic backup nudge | P0 |
| R-3 | Wrong/malicious UPI ID leads to mis-payment | Low–Med | High | Show receiver name + VPA in a confirm sheet before opening the link; warn on edits to an existing VPA | P1 |
| R-4 | WhatsApp summary discloses UPI IDs to a whole chat | Medium | Medium | Preview + toggle "include UPI IDs" (default off) | P1 |
| R-5 | `style-src 'unsafe-inline'` | Low | Low | Replace inline `style` widths with CSS custom properties/classes, or use CSP nonces/hashes, then drop `'unsafe-inline'` | P2 |
| R-6 | Over-settlement / inconsistent settlement amounts | Medium | Low | Validate settlement ≤ current debt or show a warning | P2 |
| R-7 | No integrity check on imported data (future) | — | Medium | Validate with the same type guards used in `loadState`; cap size | P1 (with import) |
| R-8 | Service worker never exercised in tests | Medium | Medium | E2E offline/update tests | P2 |
| R-9 | `crypto.randomUUID` avoided; IDs use `Math.random` | Low | Low | IDs are not secrets; acceptable. Use `crypto.getRandomValues` where available | P3 |
| R-10 | No Subresource/Dependency monitoring | Low | Medium | Enable Dependabot/`npm audit` in CI; pin versions | P2 |
| R-11 | Hosting header misconfiguration (host ignores files) | Low | Medium | Post-deploy header check (e.g. securityheaders.com) in release checklist | P2 |

## 8. If a backend or shared groups are added (security requirements)

1. **Authentication**: passwordless (email/phone OTP) or passkeys; short-lived sessions; no custom password storage.
2. **Authorisation**: per-group roles (owner, member); server-side checks on every mutation; unguessable group IDs for link sharing plus revocation.
3. **Transport/storage**: TLS only; encryption at rest; consider end-to-end encryption of group content.
4. **Integrity**: server-side re-validation of splits (sum = amount) and settlement rules; append-only audit log with author and timestamp.
5. **Abuse controls**: rate limiting, size limits, input validation mirroring client rules.
6. **Privacy**: privacy notice, consent, data export and account deletion; data minimisation (do not store pasted messages).
7. **CSP**: add the API origin to `connect-src` only; keep everything else `'self'`.

## 9. Security checklist for releases

- [ ] `npm test` passes (including `security.test.ts`)
- [ ] `npm run build` regenerates headers; `vercel.json`/`_headers` unchanged or reviewed
- [ ] Deployed headers verified on production URL
- [ ] `npm audit` reviewed; lockfile diff reviewed
- [ ] No new third-party origins in CSP
- [ ] No `dangerouslySetInnerHTML`, `eval`, or dynamic script injection added
- [ ] Any new user-supplied text that reaches CSV/links/URLs has escaping tests
- [ ] Service worker cache name bumped if caching logic changed
