'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'

interface AppUser {
  email: string
  nombre: string
}

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          email: session.user.email ?? '',
          nombre: (session.user.user_metadata?.nombre as string) || session.user.email || 'Usuario',
        })
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<{ error?: string }> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error || !data?.user) {
      return { error: 'Correo o contraseña incorrectos.' }
    }
    return {}
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
