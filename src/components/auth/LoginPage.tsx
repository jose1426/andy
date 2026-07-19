'use client'

import { useState, FormEvent } from 'react'
import { useAuth } from '@/context/AuthContext'

export function LoginPage() {
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (!email.trim() || !password) {
      setError('Ingresa correo y contraseña.')
      return
    }
    setLoading(true)
    setError('')
    const result = await login(email, password)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#0f172a] to-[#064e3b] font-sans">
      <div className="bg-white rounded-2xl w-[380px] max-w-[95vw] shadow-2xl overflow-hidden animate-slideUp">

        {/* Header */}
        <div className="bg-gradient-to-br from-[#0f172a] to-[#059669] px-8 py-8 text-center">
          <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl">
            💵
          </div>
          <div className="text-lg font-bold text-white tracking-wide">Préstamos Xpress</div>
          <div className="text-xs text-emerald-200/80 mt-1">Clientes · Cuotas · Cobros</div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
          <div className="w-10 h-1 bg-[#059669] rounded mb-2" />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm text-center">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Correo
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && document.getElementById('passInput')?.focus()}
              placeholder="admin@prestamos.local"
              autoComplete="username"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm outline-none
                         transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="passInput"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 pr-11 border border-slate-200 rounded-lg text-sm outline-none
                           transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600
                           transition-colors w-6 h-6 flex items-center justify-center"
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPass ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#059669] hover:bg-[#047857] disabled:opacity-60 disabled:cursor-not-allowed
                       text-white font-bold rounded-lg text-sm transition-colors mt-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Ingresando…
              </>
            ) : 'Ingresar'}
          </button>
        </form>

        <div className="px-8 pb-5 text-center text-[11px] text-slate-400">
          Préstamos Xpress · Acceso restringido
        </div>
      </div>
    </div>
  )
}
