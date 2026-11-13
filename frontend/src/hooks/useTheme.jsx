import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as api from '../api'
import {
  DEFAULT_MODE,
  DEFAULT_PALETTE,
  THEME_MODE_KEY,
  THEME_PALETTE_KEY,
  THEME_PALETTES,
  isValidPalette,
  normalizeMode,
  paletteById,
  resolveAppearanceForUser,
  themeModeKey,
  themePaletteKey,
} from '../utils/themes'

const ThemeContext = createContext(null)

/**
 * Apply appearance to <html>.
 * - Logged-in (userId): portal prefs → user-scoped localStorage only.
 * - Public (no userId): always Clay Gold palette; mode may be light/dark for landing.
 */
function applyAppearance(mode, palette, userId) {
  const nextMode = normalizeMode(mode)
  const nextPalette = userId
    ? isValidPalette(palette)
      ? palette
      : DEFAULT_PALETTE
    : DEFAULT_PALETTE
  document.documentElement.dataset.theme = nextMode
  document.documentElement.dataset.palette = nextPalette
  try {
    if (userId) {
      localStorage.setItem(themeModeKey(userId), nextMode)
      localStorage.setItem(themePaletteKey(userId), nextPalette)
    } else {
      // Public site defaults — never leave a portal colour on landing/sign-in.
      localStorage.setItem(THEME_MODE_KEY, nextMode)
      localStorage.setItem(THEME_PALETTE_KEY, DEFAULT_PALETTE)
    }
  } catch {
    /* ignore */
  }
  return { mode: nextMode, palette: nextPalette }
}

function withViewTransition(fromEl, apply) {
  if (
    !document.startViewTransition ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    apply()
    return
  }
  const r = fromEl
    ? fromEl.getBoundingClientRect()
    : { left: window.innerWidth - 40, top: 30, width: 0, height: 0 }
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const R = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )
  document
    .startViewTransition(apply)
    .ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0 at ${x}px ${y}px)`,
            `circle(${R}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 520,
          easing: 'cubic-bezier(.22,1,.36,1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    })
    .catch(() => {})
}

export function ThemeProvider({ children }) {
  // Public default until a user session hydrates portal prefs.
  const [theme, setThemeState] = useState(DEFAULT_MODE)
  const [palette, setPaletteState] = useState(DEFAULT_PALETTE)
  const userIdRef = useRef(null)
  const persistTimer = useRef(null)

  useEffect(() => {
    applyAppearance(theme, palette, userIdRef.current)
  }, [theme, palette])

  const persistAppearance = useCallback((mode, pal) => {
    if (!userIdRef.current) return
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      api.putAppearance({ theme_mode: mode, theme_palette: pal }).catch(() => {})
    }, 250)
  }, [])

  const hydrateFromUser = useCallback((user) => {
    const uid = user?.id || null
    userIdRef.current = uid
    if (!uid) return
    const { mode, palette: nextPalette } = resolveAppearanceForUser(user)
    applyAppearance(mode, nextPalette, uid)
    setThemeState(mode)
    setPaletteState(nextPalette)
  }, [])

  const clearUserAppearance = useCallback(() => {
    userIdRef.current = null
    applyAppearance(DEFAULT_MODE, DEFAULT_PALETTE, null)
    setThemeState(DEFAULT_MODE)
    setPaletteState(DEFAULT_PALETTE)
  }, [])

  const setTheme = useCallback(
    (t, fromEl) => {
      const next = normalizeMode(t)
      const uid = userIdRef.current
      withViewTransition(fromEl, () => {
        const applied = applyAppearance(next, palette, uid)
        setThemeState(applied.mode)
        setPaletteState(applied.palette)
      })
      if (uid) persistAppearance(next, isValidPalette(palette) ? palette : DEFAULT_PALETTE)
    },
    [palette, persistAppearance],
  )

  const setPalette = useCallback(
    (id, fromEl) => {
      // Colour palettes are portal-only (settings while signed in).
      if (!userIdRef.current) return
      const next = isValidPalette(id) ? id : DEFAULT_PALETTE
      withViewTransition(fromEl, () => {
        applyAppearance(theme, next, userIdRef.current)
        setPaletteState(next)
      })
      persistAppearance(theme, next)
    },
    [theme, persistAppearance],
  )

  const toggleTheme = useCallback(
    (fromEl) => {
      setTheme(theme === 'dark' ? 'light' : 'dark', fromEl)
    },
    [setTheme, theme],
  )

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      isDark: theme === 'dark',
      palette,
      setPalette,
      palettes: THEME_PALETTES,
      paletteMeta: paletteById(palette),
      hydrateFromUser,
      clearUserAppearance,
    }),
    [
      theme,
      setTheme,
      toggleTheme,
      palette,
      setPalette,
      hydrateFromUser,
      clearUserAppearance,
    ],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Theme toggle / palette picker matching v7 setTheme behaviour + palettes. */
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
