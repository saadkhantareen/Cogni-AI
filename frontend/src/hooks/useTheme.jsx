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

function readMode() {
  try {
    const t = localStorage.getItem(THEME_MODE_KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  }
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function readPalette() {
  try {
    const p = localStorage.getItem(THEME_PALETTE_KEY)
    if (isValidPalette(p)) return p
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined' && document.documentElement.dataset.palette) {
    const p = document.documentElement.dataset.palette
    if (isValidPalette(p)) return p
  }
  return DEFAULT_PALETTE
}

function applyAppearance(mode, palette, userId) {
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.palette = palette
  try {
    localStorage.setItem(THEME_MODE_KEY, mode)
    localStorage.setItem(THEME_PALETTE_KEY, palette)
    if (userId) {
      localStorage.setItem(themeModeKey(userId), mode)
      localStorage.setItem(themePaletteKey(userId), palette)
    }
  } catch {
    /* ignore */
  }
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
  const [theme, setThemeState] = useState(readMode)
  const [palette, setPaletteState] = useState(readPalette)
  const userIdRef = useRef(null)
  const persistTimer = useRef(null)

  useEffect(() => {
    applyAppearance(theme, palette, userIdRef.current)
  }, [theme, palette])

  useEffect(() => {
    let mq
    try {
      mq = matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return undefined
    }
    const onChange = (e) => {
      if (userIdRef.current) return
      let saved = null
      try {
        saved = localStorage.getItem(THEME_MODE_KEY)
      } catch {
        /* ignore */
      }
      if (!saved) {
        const next = e.matches ? 'dark' : 'light'
        document.documentElement.dataset.theme = next
        setThemeState(next)
      }
    }
    try {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    } catch {
      return undefined
    }
  }, [])

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
  }, [])

  const setTheme = useCallback(
    (t, fromEl) => {
      const next = normalizeMode(t)
      withViewTransition(fromEl, () => {
        applyAppearance(next, palette, userIdRef.current)
        setThemeState(next)
      })
      persistAppearance(next, palette)
    },
    [palette, persistAppearance],
  )

  const setPalette = useCallback(
    (id, fromEl) => {
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
