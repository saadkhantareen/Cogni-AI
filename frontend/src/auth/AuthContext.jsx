import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import * as api from '../api'
import { ApiError, clearToken, getToken, setToken } from '../api/client'

const AuthContext = createContext(null)

export const ROLE_HOME = {
  admin: '/app/admin',
  hod: '/app/hod',
  teacher: '/app/teacher',
  student: '/app/student',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function restore() {
      const token = getToken()
      if (!token) {
        if (!cancelled) {
          setUser(null)
          setLoading(false)
        }
        return
      }
      try {
        const me = await api.getMe()
        if (!cancelled) setUser(me)
      } catch (err) {
        clearToken()
        if (!cancelled) setUser(null)
        // Avoid double-redirect from client 401 handler when already restoring
        if (!(err instanceof ApiError && err.status === 401)) {
          /* ignore other restore failures; user stays logged out */
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    restore()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password)
    setToken(res.access_token)
    // Prefer /me so status and full shape match protected routes
    try {
      const me = await api.getMe()
      setUser(me)
      return me
    } catch {
      setUser(res.user)
      return res.user
    }
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, login, logout, loading, isAuthenticated: !!user }),
    [user, login, logout, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
