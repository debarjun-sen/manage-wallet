let counter = 0
/** Works on insecure origins (LAN IP on phones) where crypto.randomUUID is unavailable. */
export function uid(): string {
  counter = (counter + 1) % 1e6
  return Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 7)
}

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return todayISO(d)
}

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
