'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { fmtMoney, fmtFecha, reconciliarPrestamosVencidos } from '@/lib/prestamos'

interface CuotaMora {
  id: number
  numero: number
  fecha_vencimiento: string
  monto_cuota: number
  monto_pagado: number
  prestamo_id: number
  cliente_nombre: string
}

export default function ReportesPage() {
  const [loading, setLoading] = useState(true)
  const [cartera, setCartera] = useState({ activa: 0, cobrada: 0, prestamosActivos: 0 })
  const [mora, setMora] = useState<CuotaMora[]>([])
  const [cobrosHoy, setCobrosHoy] = useState<CuotaMora[]>([])

  useEffect(() => {
    (async () => {
      const hoy = new Date().toISOString().slice(0, 10)
      await reconciliarPrestamosVencidos(supabase)

      const [prestamosRes, cuotasRes] = await Promise.all([
        supabase.from('prestamos').select('id,monto,estado'),
        supabase.from('cuotas')
          .select('id,numero,fecha_vencimiento,monto_cuota,monto_pagado,estado,prestamo_id,prestamos(cliente_id,clientes(nombre,apellido))')
          .in('estado', ['pendiente', 'atrasada', 'parcial'])
          .order('fecha_vencimiento'),
      ])

      const prestamos = prestamosRes.data || []
      const cuotas = (cuotasRes.data || []) as any[]

      setCartera({
        activa: prestamos.filter((p: any) => p.estado === 'activo' || p.estado === 'en_mora').reduce((s: number, p: any) => s + Number(p.monto), 0),
        cobrada: cuotas.reduce((s, c) => s + Number(c.monto_pagado || 0), 0),
        prestamosActivos: prestamos.filter((p: any) => p.estado === 'activo' || p.estado === 'en_mora').length,
      })

      const toRow = (c: any): CuotaMora => ({
        id: c.id, numero: c.numero, fecha_vencimiento: c.fecha_vencimiento,
        monto_cuota: c.monto_cuota, monto_pagado: c.monto_pagado, prestamo_id: c.prestamo_id,
        cliente_nombre: `${c.prestamos?.clientes?.nombre ?? ''} ${c.prestamos?.clientes?.apellido ?? ''}`.trim(),
      })

      setMora(cuotas.filter(c => c.fecha_vencimiento < hoy).map(toRow))
      setCobrosHoy(cuotas.filter(c => c.fecha_vencimiento === hoy).map(toRow))
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a]">Reportes</h1>
          <p className="text-[14px] text-slate-500 mt-0.5">Cartera, cobros del día y mora</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/dashboard/reportes/cobros" className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold hover:opacity-90 transition-opacity">
            📅 Cobros por Cliente y Fecha
          </Link>
          <Link href="/dashboard/reportes/movimiento" className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold hover:opacity-90 transition-opacity">
            🧾 Movimiento por Cliente
          </Link>
          <Link href="/dashboard/reportes/estado-cuenta" className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold hover:opacity-90 transition-opacity">
            📋 Estado de Cuenta Global
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
          <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Cartera activa</div>
          <div className="text-[22px] font-extrabold text-[#0f172a]">{loading ? '…' : fmtMoney(cartera.activa)}</div>
          <div className="text-[11px] text-slate-400 mt-1">{cartera.prestamosActivos} préstamos activos</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
          <div className="text-[9px] font-bold text-emerald-700 uppercase mb-1">Cobrado (cuotas abiertas)</div>
          <div className="text-[22px] font-extrabold text-emerald-700">{loading ? '…' : fmtMoney(cartera.cobrada)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
          <div className="text-[9px] font-bold text-red-600 uppercase mb-1">Cuotas en mora</div>
          <div className="text-[22px] font-extrabold text-red-600">{loading ? '…' : mora.length}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gradient-to-r from-[#dc2626] to-[#ef4444] text-white font-bold text-[14px]">⚠️ Cuotas en mora</div>
        {mora.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-[13px]">Sin cuotas atrasadas 🎉</div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#f1f5f9] border-b-2 border-[#e2e8f0]">
                <th className="px-4 py-2 text-left text-[11px] font-bold uppercase text-slate-500">Cliente</th>
                <th className="px-4 py-2 text-center text-[11px] font-bold uppercase text-slate-500">Cuota</th>
                <th className="px-4 py-2 text-left text-[11px] font-bold uppercase text-slate-500">Vencía</th>
                <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">Pendiente</th>
                <th className="px-4 py-2 text-center text-[11px] font-bold uppercase text-slate-500"></th>
              </tr>
            </thead>
            <tbody>
              {mora.map(c => (
                <tr key={c.id} className="border-b border-[#f1f5f9]">
                  <td className="px-4 py-2 font-semibold">{c.cliente_nombre}</td>
                  <td className="px-4 py-2 text-center">#{c.numero}</td>
                  <td className="px-4 py-2 text-red-600">{fmtFecha(c.fecha_vencimiento)}</td>
                  <td className="px-4 py-2 text-right font-bold">{fmtMoney(c.monto_cuota - c.monto_pagado)}</td>
                  <td className="px-4 py-2 text-center">
                    <Link href={`/dashboard/prestamos/${c.prestamo_id}`} className="text-[#0369a1] hover:underline text-[12px] font-semibold">Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gradient-to-r from-[#0f172a] to-[#059669] text-white font-bold text-[14px]">📅 Cobros de hoy</div>
        {cobrosHoy.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-[13px]">No hay cuotas que venzan hoy.</div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#f1f5f9] border-b-2 border-[#e2e8f0]">
                <th className="px-4 py-2 text-left text-[11px] font-bold uppercase text-slate-500">Cliente</th>
                <th className="px-4 py-2 text-center text-[11px] font-bold uppercase text-slate-500">Cuota</th>
                <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">Monto</th>
                <th className="px-4 py-2 text-center text-[11px] font-bold uppercase text-slate-500"></th>
              </tr>
            </thead>
            <tbody>
              {cobrosHoy.map(c => (
                <tr key={c.id} className="border-b border-[#f1f5f9]">
                  <td className="px-4 py-2 font-semibold">{c.cliente_nombre}</td>
                  <td className="px-4 py-2 text-center">#{c.numero}</td>
                  <td className="px-4 py-2 text-right font-bold">{fmtMoney(c.monto_cuota - c.monto_pagado)}</td>
                  <td className="px-4 py-2 text-center">
                    <Link href={`/dashboard/prestamos/${c.prestamo_id}`} className="text-[#0369a1] hover:underline text-[12px] font-semibold">Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
