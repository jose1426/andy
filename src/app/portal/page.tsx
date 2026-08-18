'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { fmtMoney, fmtFecha, FORMA_PAGO_LABEL, FRECUENCIA_LABEL } from '@/lib/prestamos'
import type { EstadoPrestamo, EstadoCuota, Frecuencia, FormaPago } from '@/types'

const TOKEN_KEY = 'portal_session_token'

interface DashCuota {
  numero: number
  fecha_vencimiento: string
  monto_cuota: number
  monto_pagado: number
  saldo_capital: number
  estado: EstadoCuota
}
interface DashPago {
  monto: number
  fecha: string
  forma_pago: FormaPago
}
interface DashPrestamo {
  id: number
  monto: number
  tasa_interes: number
  frecuencia: Frecuencia
  fecha_inicio: string
  estado: EstadoPrestamo
  cuotas: DashCuota[]
  pagos: DashPago[]
}
interface Dashboard {
  cliente: { id: number; nombre: string; apellido: string | null }
  prestamos: DashPrestamo[]
}

const ESTADO_PRESTAMO_STYLE: Record<EstadoPrestamo, string> = {
  activo: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  pagado: 'bg-slate-100 text-slate-600 border-slate-300',
  en_mora: 'bg-red-100 text-red-800 border-red-300',
  cancelado: 'bg-amber-100 text-amber-800 border-amber-300',
}
const ESTADO_PRESTAMO_LABEL: Record<EstadoPrestamo, string> = {
  activo: 'Activo', pagado: 'Pagado', en_mora: 'En Mora', cancelado: 'Cancelado',
}
const ESTADO_CUOTA_STYLE: Record<EstadoCuota, string> = {
  pendiente: 'bg-slate-100 text-slate-600 border-slate-300',
  pagada: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  parcial: 'bg-amber-100 text-amber-800 border-amber-300',
  atrasada: 'bg-red-100 text-red-800 border-red-300',
  capitalizada: 'bg-slate-100 text-slate-500 border-slate-300',
}
const ESTADO_CUOTA_LABEL: Record<EstadoCuota, string> = {
  pendiente: 'Pendiente', pagada: 'Pagada', parcial: 'Abono parcial', atrasada: 'Atrasada', capitalizada: 'Capitalizada',
}

export default function PortalPage() {
  const router = useRouter()
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cerrarSesion = useCallback(async (redirigir = true) => {
    const token = localStorage.getItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
    if (token) await supabase.rpc('portal_logout', { p_token: token })
    if (redirigir) router.replace('/portal/login')
  }, [router])

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem(TOKEN_KEY)
      if (!token) { router.replace('/portal/login'); return }
      const { data: dash, error: rpcError } = await supabase.rpc('portal_get_dashboard', { p_token: token })
      if (rpcError) {
        setError('Tu sesión expiró. Ingresa de nuevo.')
        setLoading(false)
        setTimeout(() => cerrarSesion(), 1500)
        return
      }
      setData(dash as Dashboard)
      setLoading(false)
    })()
  }, [router, cerrarSesion])

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#064e3b]">
        <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#064e3b] text-white text-[14px]">
        {error || 'No se pudo cargar tu información.'}
      </div>
    )
  }

  const prestamosActivos = data.prestamos.filter(p => p.estado === 'activo' || p.estado === 'en_mora')
  const prestamosCerrados = data.prestamos.filter(p => p.estado === 'pagado' || p.estado === 'cancelado')

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="bg-gradient-to-r from-[#0f172a] to-[#059669] px-5 py-5 flex items-center justify-between text-white">
        <div>
          <div className="text-[13px] text-emerald-200/80">Hola,</div>
          <div className="text-lg font-bold">{data.cliente.nombre} {data.cliente.apellido}</div>
        </div>
        <button onClick={() => cerrarSesion()} className="px-3.5 py-2 rounded-lg bg-white/10 border border-white/20 text-[12px] font-bold hover:bg-white/20">
          Salir
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {data.prestamos.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6 text-center text-slate-400 text-[13px]">
            No tenés préstamos registrados todavía.
          </div>
        )}

        {[...prestamosActivos, ...prestamosCerrados].map(p => {
          const proxima = p.cuotas.find(c => c.estado === 'pendiente' || c.estado === 'atrasada')
          const saldo = p.cuotas.length ? p.cuotas[p.cuotas.length - 1].saldo_capital : p.monto
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-[#f1f5f9]">
                <div>
                  <div className="text-[12px] text-slate-500">Préstamo #{p.id} · {FRECUENCIA_LABEL[p.frecuencia]}</div>
                  <div className="text-[18px] font-extrabold text-[#0f172a]">{fmtMoney(p.monto)}</div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${ESTADO_PRESTAMO_STYLE[p.estado]}`}>
                  {ESTADO_PRESTAMO_LABEL[p.estado]}
                </span>
              </div>

              {(p.estado === 'activo' || p.estado === 'en_mora') && (
                <div className="grid grid-cols-2 divide-x divide-[#f1f5f9] border-b border-[#f1f5f9]">
                  <div className="px-5 py-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Saldo pendiente</div>
                    <div className="text-[15px] font-bold text-red-600">{fmtMoney(saldo)}</div>
                  </div>
                  <div className="px-5 py-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Próxima cuota</div>
                    <div className="text-[15px] font-bold text-[#0f172a]">
                      {proxima ? `${fmtMoney(proxima.monto_cuota)} · ${fmtFecha(proxima.fecha_vencimiento)}` : '—'}
                    </div>
                  </div>
                </div>
              )}

              <div className="px-5 py-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase mb-2">Cuotas</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] border-collapse">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="pb-1.5 font-semibold">#</th>
                        <th className="pb-1.5 font-semibold">Vence</th>
                        <th className="pb-1.5 font-semibold text-right">Cuota</th>
                        <th className="pb-1.5 font-semibold text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.cuotas.map(c => (
                        <tr key={c.numero} className="border-t border-[#f1f5f9]">
                          <td className="py-1.5 text-slate-500">{c.numero}</td>
                          <td className="py-1.5 text-slate-500">{fmtFecha(c.fecha_vencimiento)}</td>
                          <td className="py-1.5 text-right font-semibold text-[#0f172a]">{fmtMoney(c.monto_cuota)}</td>
                          <td className="py-1.5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${ESTADO_CUOTA_STYLE[c.estado]}`}>
                              {ESTADO_CUOTA_LABEL[c.estado]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {p.pagos.length > 0 && (
                <div className="px-5 py-3 border-t border-[#f1f5f9]">
                  <div className="text-[11px] font-bold text-slate-500 uppercase mb-2">Historial de pagos</div>
                  <div className="space-y-1.5">
                    {p.pagos.map((pg, i) => (
                      <div key={i} className="flex items-center justify-between text-[12px]">
                        <span className="text-slate-500">{fmtFecha(pg.fecha)} · {FORMA_PAGO_LABEL[pg.forma_pago]}</span>
                        <span className="font-bold text-emerald-700">{fmtMoney(pg.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
