const fmt0 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const fmt2 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Format paise as ₹ with Indian grouping, e.g. 12000000 -> "₹1,20,000". */
export function formatINR(paise: number): string {
  const abs = Math.abs(paise)
  const s = (abs % 100 === 0 ? fmt0 : fmt2).format(abs / 100)
  return paise < 0 ? `-${s}` : s
}

/** Parse user/SMS rupee text ("1,200", "₹450.50", "Rs. 80") into paise. Returns null if invalid. */
export function toPaise(input: string | number): number | null {
  const s = String(input)
    .trim()
    .replace(/^(₹|rs\.?|inr)\s*/i, '')
    .replace(/[,\s]/g, '')
  if (s === '' || s === '.' || !/^\d*(\.\d{0,2})?$/.test(s)) return null
  return Math.round(parseFloat(s) * 100)
}

/** Paise -> plain input string, e.g. 45000 -> "450", 45050 -> "450.50". */
export function paiseToInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2)
}
