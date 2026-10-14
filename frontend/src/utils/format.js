/** Initials helper matching v7 `ini()`. */
export function initials(name) {
  return String(name || '')
    .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Short date like v7 notification stamps ("26 Sep"). */
export function formatShortDate(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function clampPct(v) {
  const n = Number(v) || 0
  return Math.max(0, Math.min(100, n))
}
