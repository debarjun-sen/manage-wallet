export interface Category {
  key: string
  label: string
  emoji: string
}

const RULES: { cat: Category; words: string[] }[] = [
  {
    cat: { key: 'food', label: 'Food', emoji: '🍕' },
    words: ['zomato', 'swiggy', 'canteen', 'cafe', 'café', 'restaurant', 'pizza', 'domino', 'chai', 'tea', 'coffee', 'food', 'dinner', 'lunch', 'breakfast', 'mess', 'juice', 'biryani', 'kfc', 'mcdonald', 'burger', 'shack', 'snack', 'maggi', 'dhaba', 'bakery', 'ice cream', 'fish', 'grocer'],
  },
  {
    cat: { key: 'travel', label: 'Travel', emoji: '🛵' },
    words: ['uber', 'ola', 'rapido', 'irctc', 'train', 'bus', 'flight', 'cab', 'petrol', 'fuel', 'taxi', 'metro', 'redbus', 'makemytrip', 'scooty', 'bike', 'auto', 'toll', 'parking', 'indigo'],
  },
  {
    cat: { key: 'stay', label: 'Stay', emoji: '🏠' },
    words: ['hotel', 'hostel', 'airbnb', 'oyo', 'villa', 'rent', 'room', 'pg ', 'stay'],
  },
  {
    cat: { key: 'fun', label: 'Fun', emoji: '🎉' },
    words: ['movie', 'bookmyshow', 'pvr', 'club', 'party', 'game', 'parasail', 'concert', 'netflix', 'spotify', 'cruise', 'entry', 'ticket'],
  },
  {
    cat: { key: 'shopping', label: 'Shopping', emoji: '🛍️' },
    words: ['amazon', 'flipkart', 'myntra', 'meesho', 'store', 'mart', 'shop', 'blinkit', 'zepto', 'bigbasket', 'mall', 'market', 'stationery', 'xerox'],
  },
]

export const OTHER: Category = { key: 'other', label: 'Other', emoji: '💸' }

/** Auto-tag a category from merchant / description keywords. */
export function categorize(text: string): Category {
  const t = ` ${text.toLowerCase()} `
  // Match at word starts so "cola" doesn't hit "ola" and "business" doesn't hit "bus".
  for (const r of RULES) if (r.words.some((w) => new RegExp(`(^|[^a-z])${w}`).test(t))) return r.cat
  return OTHER
}
