/**
 * Appearance palettes for Cogni.ai.
 * Mode (light/dark) is separate; each palette has light + dark CSS tokens.
 */

export const THEME_MODE_KEY = 'cogni-theme'
export const THEME_PALETTE_KEY = 'cogni-palette'

export const DEFAULT_PALETTE = 'clay'
export const DEFAULT_MODE = 'light'

export function themeModeKey(userId) {
  return userId ? `${THEME_MODE_KEY}:${userId}` : THEME_MODE_KEY
}

export function themePaletteKey(userId) {
  return userId ? `${THEME_PALETTE_KEY}:${userId}` : THEME_PALETTE_KEY
}

/** @typedef {{ id: string, name: string, blurb: string, swatches: [string, string, string] }} ThemePalette */

/** @type {ThemePalette[]} */
export const THEME_PALETTES = [
  {
    id: 'clay',
    name: 'Clay Gold',
    blurb: 'Warm yellow on beige — the classic Cogni look.',
    swatches: ['#F5CF5B', '#F7F6F1', '#171719'],
  },
  {
    id: 'violet',
    name: 'Violet Bloom',
    blurb: 'Soft purple accents on cool lavender surfaces.',
    swatches: ['#8B7CF7', '#F6F5FB', '#1B1730'],
  },
  {
    id: 'emerald',
    name: 'Forest',
    blurb: 'Fresh green on misted sage backgrounds.',
    swatches: ['#4FAE7A', '#F3F7F4', '#14241B'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    blurb: 'Teal-blue brand on airy coastal neutrals.',
    swatches: ['#3AA6B8', '#F2F7F8', '#102328'],
  },
  {
    id: 'rose',
    name: 'Rosewood',
    blurb: 'Dusty rose accents with warm paper tones.',
    swatches: ['#D4788E', '#F9F4F5', '#2A151C'],
  },
  {
    id: 'slate',
    name: 'Slate',
    blurb: 'Steel blue-gray for a quieter, editorial feel.',
    swatches: ['#6B859E', '#F4F6F8', '#151A20'],
  },
  {
    id: 'coral',
    name: 'Coral',
    blurb: 'Sunset coral with cream surfaces.',
    swatches: ['#E0895C', '#F9F5F1', '#27160F'],
  },
  {
    id: 'indigo',
    name: 'Indigo Night',
    blurb: 'Deep indigo brand for a focused workspace.',
    swatches: ['#5B6CFF', '#F3F4FB', '#121428'],
  },
]

const PALETTE_IDS = new Set(THEME_PALETTES.map((p) => p.id))

export function isValidPalette(id) {
  return typeof id === 'string' && PALETTE_IDS.has(id)
}

export function paletteById(id) {
  return THEME_PALETTES.find((p) => p.id === id) || THEME_PALETTES[0]
}

export function normalizeMode(mode) {
  return mode === 'dark' ? 'dark' : 'light'
}

/** Resolve mode/palette for a logged-in user (account prefs → per-user local → defaults). */
export function resolveAppearanceForUser(user) {
  let mode = normalizeMode(user?.theme_mode)
  let palette = isValidPalette(user?.theme_palette) ? user.theme_palette : null
  const uid = user?.id
  try {
    if (!user?.theme_mode) {
      const saved = localStorage.getItem(themeModeKey(uid)) || localStorage.getItem(THEME_MODE_KEY)
      if (saved === 'light' || saved === 'dark') mode = saved
    }
    if (!palette) {
      const saved =
        localStorage.getItem(themePaletteKey(uid)) || localStorage.getItem(THEME_PALETTE_KEY)
      if (isValidPalette(saved)) palette = saved
    }
  } catch {
    /* ignore */
  }
  return { mode, palette: palette || DEFAULT_PALETTE }
}
