'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

const TOKEN_KEY = 'portal_session_token'

export default function PortalLoginPage() {
  const router = useRouter()
  const [cedula, setCedula] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (!cedula.trim() || !pin.trim()) {
      setError('Ingresa tu cédula y tu PIN.')
      return
    }
    setLoading(true)
    setError('')
    const { data: token, error: rpcError } = await supabase.rpc('portal_login', {
      p_cedula: cedula.trim(),
      p_pin: pin.trim(),
    })
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message.includes('intentos') ? rpcError.message : 'No se pudo iniciar sesión. Intenta de nuevo.')
      return
    }
    if (!token) {
      setError('Cédula o PIN incorrectos.')
      return
    }
    localStorage.setItem(TOKEN_KEY, token as string)
    router.push('/portal')
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#0f172a] to-[#064e3b] font-sans p-4">
      <div className="bg-white rounded-2xl w-[380px] max-w-full shadow-2xl overflow-hidden animate-slideUp">
        <div className="bg-gradient-to-br from-[#0f172a] to-[#059669] px-8 py-8 text-center">
          <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl">
            💵
          </div>
          <div className="text-lg font-bold text-white tracking-wide">Préstamos Xpress</div>
          <div className="text-xs text-emerald-200/80 mt-1">Portal del Cliente</div>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
          <div className="w-10 h-1 bg-[#059669] rounded mb-2" />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm text-center">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cédula</label>
            <input
              value={cedula}
              onChange={e => setCedula(e.target.value)}
              placeholder="8-123-4567"
              autoComplete="off"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-[14px] outline-none focus:border-emerald-400"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">PIN</label>
            <input
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              type="password"
              inputMode="numeric"
              placeholder="••••"
              autoComplete="off"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-[14px] outline-none focus:border-emerald-400 tracking-[0.3em]"
            />
            <p className="text-[11px] text-slate-400 pt-0.5">¿No tenés PIN todavía? Pedilo por WhatsApp o en la oficina.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[14px] font-bold disabled:opacity-60"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
