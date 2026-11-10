import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Minimal stroke icon set (lucide-style paths) so UI chrome doesn't depend on emoji rendering.
const ICONS = {
  back: 'M19 12H5M12 19l-7-7 7-7',
  plus: 'M12 5v14M5 12h14',
  scale: 'M12 3v18M7 21h10M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2M2 16l3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1zM16 16l3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  check: 'M20 6L9 17l-5-5',
  message: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  pencil: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  clipboard: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
  sparkles: 'M12 3l1.9 5.8L20 10.5l-6.1 1.7L12 18l-1.9-5.8L4 10.5l6.1-1.7zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  x: 'M18 6L6 18M6 6l12 12',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
} as const
export type IconName = keyof typeof ICONS

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800 ${className}`}>
      {children}
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-violet-600 text-white hover:bg-violet-700 active:bg-violet-800 shadow-sm shadow-violet-600/30',
  secondary: 'bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/25',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/30',
}

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${VARIANTS[variant]} ${className}`}
    />
  )
}

export function Chip({ active, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={`min-h-11 rounded-full px-4 py-2 text-base font-semibold ring-1 transition ${
        active
          ? 'bg-violet-600 text-white ring-violet-600'
          : 'bg-white text-slate-700 ring-slate-300 hover:ring-violet-400 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700'
      } ${className}`}
    />
  )
}

export const inputCls =
  'w-full rounded-2xl border-0 bg-slate-100 px-4 py-3 text-lg text-slate-900 ring-1 ring-transparent placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900'

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</div>
}

export function Empty({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
      <div className="text-5xl" aria-hidden="true">{emoji}</div>
      <div className="text-xl font-bold">{title}</div>
      {children}
    </div>
  )
}

export function Avatar({ name }: { name: string }) {
  const hues = ['bg-violet-500', 'bg-amber-500', 'bg-sky-500', 'bg-pink-500', 'bg-emerald-500', 'bg-orange-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500', 'bg-lime-600']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${hues[h % hues.length]}`}>
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </div>
  )
}
