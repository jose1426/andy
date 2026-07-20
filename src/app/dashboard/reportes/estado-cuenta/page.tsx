'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { fmtMoney } from '@/lib/prestamos'
import type { Cliente, EstadoPrestamo } from '@/types'

interface ResumenCliente {
  clienteId: number
  nombre: string
  cedula: string | null
  prestamosCount: number
  estados: Set<EstadoPrestamo>
  totalPrestado: number
  totalCobrado: number
  totalAbonoCapital: number
}

const ESTADO_STYLE: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  pagado: 'bg-slate-100 text-slate-600 border-slate-300',
  en_mora: 'bg-red-100 text-red-800 border-red-300',
  cancelado: 'bg-amber-100 text-amber-800 border-amber-300',
}
const ESTADO_LABEL: Record<string, string> = {
  activo: 'Activo', pagado: 'Pagado', en_mora: 'En Mora', cancelado: 'Cancelado',
}

function estadoResumen(estados: Set<EstadoPrestamo>): EstadoPrestamo {
  if (estados.has('en_mora')) return 'en_mora'
  if (estados.has('activo')) return 'activo'
  if (estados.has('cancelado')) return 'cancelado'
  return 'pagado'
}

export default function ReporteEstadoCuentaPage() {
  const [loading, setLoading] = useState(true)
  const [filas, setFilas] = useState<ResumenCliente[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [{ data: clientes, error: errCli }, { data: prestamos, error: errPre }] = await Promise.all([
          supabase.from('clientes').select('*').order('nombre'),
          supabase.from('prestamos').select('id,cliente_id,monto,estado'),
        ])
        if (errCli) throw errCli
        if (errPre) throw errPre

        const clientesList = (clientes || []) as Cliente[]
        const prestamosList = (prestamos || []) as { id: number; cliente_id: number; monto: number; estado: EstadoPrestamo }[]
        const prestamoIds = prestamosList.map(p => p.id)
        const prestamoCliente = new Map(prestamosList.map(p => [p.id, p.cliente_id]))

        const { data: cuotas, error: errCuo } = prestamoIds.length
          ? await supabase.from('cuotas').select('prestamo_id,monto_pagado,interes').in('prestamo_id', prestamoIds)
          : { data: [], error: null }
        if (errCuo) throw errCuo

        const mapa = new Map<number, ResumenCliente>()
        for (const c of clientesList) {
          mapa.set(c.id, {
            clienteId: c.id, nombre: `${c.nombre} ${c.apellido ?? ''}`.trim(), cedula: c.cedula,
            prestamosCount: 0, estados: new Set(), totalPrestado: 0, totalCobrado: 0, totalAbonoCapital: 0,
          })
        }
        for (const p of prestamosList) {
          const r = mapa.get(p.cliente_id)
          if (!r) continue
          r.prestamosCount += 1
          r.estados.add(p.estado)
          r.totalPrestado += Number(p.monto)
        }
        for (const c of (cuotas || []) as { prestamo_id: number; monto_pagado: number; interes: number }[]) {
          const clienteId = prestamoCliente.get(c.prestamo_id)
          const r = clienteId != null ? mapa.get(clienteId) : undefined
          if (!r) continue
          r.totalCobrado += Number(c.monto_pagado)
          r.totalAbonoCapital += Math.max(0, Number(c.monto_pagado) - Number(c.interes))
        }

        setFilas([...mapa.values()].filter(r => r.prestamosCount > 0))
      } catch (e: any) {
        toast.error('Error: ' + e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const filtradas = useMemo(
    () => filas.filter(r => !search || `${r.nombre} ${r.cedula ?? ''}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [filas, search],
  )

  const totales = filtradas.reduce((s, r) => ({
    prestado: s.prestado + r.totalPrestado,
    cobrado: s.cobrado + r.totalCobrado,
    abonado: s.abonado + r.totalAbonoCapital,
    interes: s.interes + (r.totalCobrado - r.totalAbonoCapital),
    saldo: s.saldo + (r.totalPrestado - r.totalAbonoCapital),
  }), { prestado: 0, cobrado: 0, abonado: 0, interes: 0, saldo: 0 })

  return (
    <div className="space-y-4 animate-fadeIn">
      <div>
        <p className="text-[12px] text-slate-500 mb-0.5">Reportes / Estado de cuenta</p>
        <h1 className="text-2xl font-bold text-[#0f172a]">Estado de Cuenta Global</h1>
        <p className="text-[14px] text-slate-500 mt-0.5">Resumen de prestado, cobrado y saldo pendiente por cliente</p>
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por cliente o cédula…"
          className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
          <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Total prestado</div>
          <div className="text-[18px] font-extrabold text-[#0f172a]">{loading ? '…' : fmtMoney(totales.prestado)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
          <div className="text-[9px] font-bold text-emerald-700 uppercase mb-1">Total cobrado</div>
          <div className="text-[18px] font-extrabold text-emerald-700">{loading ? '…' : fmtMoney(totales.cobrado)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
          <div className="text-[9px] font-bold text-amber-700 uppercase mb-1">Interés cobrado</div>
          <div className="text-[18px] font-extrabold text-amber-700">{loading ? '…' : fmtMoney(totales.interes)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
          <div className="text-[9px] font-bold text-sky-700 uppercase mb-1">Abonado a capital</div>
          <div className="text-[18px] font-extrabold text-sky-700">{loading ? '…' : fmtMoney(totales.abonado)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
          <div className="text-[9px] font-bold text-red-600 uppercase mb-1">Saldo pendiente</div>
          <div className="text-[18px] font-extrabold text-red-600">{loading ? '…' : fmtMoney(totales.saldo)}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#f1f5f9] border-b-2 border-[#e2e8f0]">
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-slate-500">Cliente</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Préstamos</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Estado</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Prestado</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Cobrado</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Interés cobrado</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Abonado a capital</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Saldo pendiente</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400">Cargando…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400">Sin clientes con préstamos.</td></tr>
              ) : filtradas.map(r => {
                const estado = estadoResumen(r.estados)
                const saldo = r.totalPrestado - r.totalAbonoCapital
                const interesCobrado = r.totalCobrado - r.totalAbonoCapital
                return (
                  <tr key={r.clienteId} className="border-b border-[#f1f5f9]">
                    <td className="px-4 py-2.5 font-semibold text-[#0f172a]">{r.nombre}</td>
                    <td className="px-4 py-2.5 text-center text-slate-500">{r.prestamosCount}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${ESTADO_STYLE[estado]}`}>
                        {ESTADO_LABEL[estado]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-[#0f172a]">{fmtMoney(r.totalPrestado)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{fmtMoney(r.totalCobrado)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-700">{fmtMoney(interesCobrado)}</td>
                    <td className="px-4 py-2.5 text-right text-sky-700">{fmtMoney(r.totalAbonoCapital)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmtMoney(saldo)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Link href={`/dashboard/reportes/movimiento?cliente=${r.clienteId}`} className="text-[#0369a1] hover:underline text-[12px] font-semibold">
                        Ver movimiento →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
