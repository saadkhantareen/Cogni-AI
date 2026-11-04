/**
 * Exam windows are entered and shown in Pakistan time (Asia/Karachi, UTC+5, no daylight
 * saving), whatever the viewer's own clock is set to.
 */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000

/** Server datetimes may come back without an offset; they are always UTC. */
export function parseServerDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const s = String(value)
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(s)
  const d = new Date(hasZone ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Form values (YYYY-MM-DD, HH:MM) in PKT -> ISO string the API accepts. */
export function pktToIso(date, time) {
  if (!date || !time) return ''
  return `${date}T${time}:00+05:00`
}

/** ISO/server date -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in PKT, for form inputs. */
export function isoToPktParts(value) {
  const d = parseServerDate(value)
  if (!d) return { date: '', time: '' }
  const shifted = new Date(d.getTime() + PKT_OFFSET_MS).toISOString()
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) }
}

/** Form defaults: today in PKT, from the start of the current hour, open for `hours`. */
export function defaultPktWindow(hours = 3) {
  const nowPkt = new Date(Date.now() + PKT_OFFSET_MS)
  nowPkt.setUTCMinutes(0, 0, 0)
  const end = new Date(nowPkt.getTime() + hours * 60 * 60 * 1000)
  const sameDay = end.toISOString().slice(0, 10) === nowPkt.toISOString().slice(0, 10)
  return {
    date: nowPkt.toISOString().slice(0, 10),
    start: nowPkt.toISOString().slice(11, 16),
    end: sameDay ? end.toISOString().slice(11, 16) : '23:59',
  }
}

function pktParts(d) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d)
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

/** "Wed 4 Nov 2026, 8:00 PM PKT" */
export function formatPkt(value) {
  const d = parseServerDate(value)
  if (!d) return ''
  const p = pktParts(d)
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod} PKT`
}

/** "Wed 4 Nov 2026, 8:00 PM – 10:00 PM PKT" (date shown once when both ends share a day). */
export function formatPktRange(opens, closes) {
  const a = parseServerDate(opens)
  const b = parseServerDate(closes)
  if (!a || !b) return ''
  const pa = pktParts(a)
  const pb = pktParts(b)
  const sameDay = pa.day === pb.day && pa.month === pb.month && pa.year === pb.year
  const end = sameDay
    ? `${pb.hour}:${pb.minute} ${pb.dayPeriod} PKT`
    : formatPkt(b)
  return `${pa.weekday} ${pa.day} ${pa.month} ${pa.year}, ${pa.hour}:${pa.minute} ${pa.dayPeriod} – ${end}`
}

/** 'none' | 'upcoming' | 'open' | 'closed' relative to `now` (ms). */
export function windowState(opens, closes, now = Date.now()) {
  const a = parseServerDate(opens)
  const b = parseServerDate(closes)
  if (!a || !b) return 'none'
  if (now < a.getTime()) return 'upcoming'
  if (now >= b.getTime()) return 'closed'
  return 'open'
}
