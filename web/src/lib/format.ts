// Display helpers. Money arrives from the server as integer cents and is never
// turned into a float for arithmetic — only for rendering.

export function usd(cents: number, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0
  const abs = Math.abs(cents)
  const s = `$${(abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  if (neg) return `−${s}`
  return opts.sign ? `+${s}` : s
}

/** Axis-sized money. The input is integer cents, so $1M is 100,000,000 cents. */
export function usdCompact(cents: number): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '−' : ''
  if (abs >= 100_000_000) return `${sign}$${(abs / 100_000_000).toFixed(1)}M`
  if (abs >= 1_000_000) return `${sign}$${(abs / 100_000).toFixed(abs >= 10_000_000 ? 0 : 1)}k`
  return `${sign}$${Math.round(abs / 100).toLocaleString('en-US')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Parses a date-only string without letting the local timezone shift the day. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

export function shortDate(iso: string): string {
  if (!iso) return ''
  const d = parseDay(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export function longDate(iso: string): string {
  if (!iso) return ''
  const d = parseDay(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000)
}

export function addDays(iso: string, n: number): string {
  const d = parseDay(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const PROVENANCE_LABEL: Record<string, string> = {
  olist_historical: 'Olist record',
  nessie_sandbox: 'Sandbox bank',
  derived: 'Calculated here',
  user_entered: 'You entered',
  demo_assumption: 'Demo assumption',
}

export const CERTAINTY_LABEL: Record<string, string> = {
  recorded: 'Recorded',
  scheduled: 'Scheduled',
  conditional: 'Conditional',
}

export const TONE_WORD: Record<string, string> = {
  risk: 'Risk',
  review: 'Needs review',
  opportunity: 'Opportunity',
}

export const STATUS_LABEL: Record<string, string> = {
  observed: 'Observed',
  inferred: 'Inferred',
  possible: 'Possible',
  action: 'You could',
}
