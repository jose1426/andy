'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { soloDecimal } from '@/lib/prestamos'

function emptyForm() {
  return { nombre: '', apellido: '', cedula: '', telefono: '', monto_solicitado: '', referencia: '' }
}

export default function SolicitarPage() {
  const [form, setForm] = useState(emptyForm())
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  const f = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) { setError('Ingresa tu nombre.'); return }
    if (!form.telefono.trim()) { setError('Ingresa tu teléfono.'); return }

    setEnviando(true)
    setError('')
    const { error: errIns } = await supabase.from('solicitudes').insert({
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim() || null,
      cedula: form.cedula.trim() || null,
      telefono: form.telefono.trim(),
      monto_solicitado: form.monto_solicitado ? parseFloat(form.monto_solicitado) : null,
      referencia: form.referencia.trim() || null,
    })
    setEnviando(false)
    if (errIns) { setError('No se pudo enviar la solicitud. Intenta de nuevo.'); return }
    setEnviado(true)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#0f172a] to-[#064e3b] font-sans p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-[420px] max-w-full shadow-2xl overflow-hidden animate-slideUp my-8">
        <div className="bg-gradient-to-br from-[#0f172a] to-[#059669] px-8 py-8 text-center">
          <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl">
            💵
          </div>
          <div className="text-lg font-bold text-white tracking-wide">Préstamos Xpress</div>
          <div className="text-xs text-emerald-200/80 mt-1">Solicita tu préstamo</div>
        </div>

        {enviado ? (
          <div className="px-8 py-10 text-center space-y-4">
            <div className="text-4xl">✅</div>
            <div>
              <div className="text-[15px] font-bold text-[#0f172a]">¡Solicitud enviada!</div>
              <p className="text-[13px] text-slate-500 mt-1">Pronto nos pondremos en contacto contigo para continuar.</p>
            </div>
            <div className="bg-emerald-50 rounded-xl px-5 py-4">
              <div className="text-2xl mb-1.5">📸</div>
              <p className="text-[13px] font-bold text-emerald-800">Un último paso</p>
              <p className="text-[12px] text-emerald-700 mt-1 leading-relaxed">
                Envíanos por WhatsApp una foto de tu cédula (frente y reverso) para agilizar tu solicitud.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-8 py-7 space-y-3">
            <div className="w-10 h-1 bg-[#059669] rounded mb-1" />

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm text-center">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Nombre</label>
                <input value={form.nombre} onChange={e => f('nombre', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Apellido</label>
                <input value={form.apellido} onChange={e => f('apellido', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Cédula</label>
                <input value={form.cedula} onChange={e => f('cedula', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Teléfono</label>
                <input value={form.telefono} onChange={e => f('telefono', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Monto que necesitas</label>
              <input type="text" inputMode="decimal" value={form.monto_solicitado} onChange={e => f('monto_solicitado', soloDecimal(e.target.value))}
                placeholder="B/. 0.00"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Referencia (nombre y teléfono de alguien que te recomiende)</label>
              <input value={form.referencia} onChange={e => f('referencia', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="w-full py-3 bg-[#059669] hover:bg-[#047857] disabled:opacity-60 disabled:cursor-not-allowed
                         text-white font-bold rounded-lg text-sm transition-colors mt-2 flex items-center justify-center gap-2"
            >
              {enviando ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enviando…
                </>
              ) : 'Enviar solicitud'}
            </button>
          </form>
        )}

        <div className="px-8 pb-5 text-center text-[11px] text-slate-400 space-y-1.5">
          <div>
            ¿Eres cliente nuestro?{' '}
            <Link href="/portal/login" className="text-emerald-700 font-semibold hover:underline">
              Entrá a tu portal
            </Link>
          </div>
          <div>Préstamos Xpress</div>
        </div>
      </div>
    </div>
  )
}
