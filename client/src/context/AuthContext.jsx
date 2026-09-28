import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
    const onUnauthorized = () => setUser(null)
    window.addEventListener('pravi:unauthorized', onUnauthorized)
    return () => window.removeEventListener('pravi:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (email, password) => {
    const d = await api.post('/auth/login', { email, password })
    setUser(d.user)
    return d.user
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {})
    setUser(null)
  }, [])

  const canEdit = user?.role === 'ADMIN' || user?.role === 'ENGINEER'

  return <AuthContext.Provider value={{ user, loading, login, logout, canEdit }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
