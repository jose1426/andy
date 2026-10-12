'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { fmtMoney, fmtFecha } from '@/lib/prestamos'
import type { Cliente } from '@/types'

interface FilaPrestamo {
  id: number
  fecha: string
  estado: string
  capitalInicial: number
  adicionales: number
  cobrado: number
  interes: number
  abonoCapital: number
  saldo: number
}

const redondear = (n: number) => Math.round(n * 100) / 100

const ESTADO_STYLE: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  pagado: 'bg-slate-100 text-slate-600 border-slate-300',
  en_mora: 'bg-red-100 text-red-800 border-red-300',
  cancelado: 'bg-amber-100 text-amber-800 border-amber-300',
}
const ESTADO_LABEL: Record<string, string> = {
  activo: 'Activo', pagado: 'Pagado', en_mora: 'En Mora', cancelado: 'Cancelado',
}

export default function EstadoCuentaClientePage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400">Cargando…</div>}>
      <EstadoCuentaClienteContent />
    </Suspense>
  )
}

function EstadoCuentaClienteContent() {
  const searchParams = useSearchParams()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteId, setClienteId] = useState(searchParams.get('cliente') ?? '')
  const [loading, setLoading] = useState(false)
  const [filas, setFilas] = useState<FilaPrestamo[]>([])
  const [soloActivos, setSoloActivos] = useState(false)

  useEffect(() => {
    supabase.from('clientes').select('*').order('nombre').then(({ data }) => setClientes((data || []) as Cliente[]))
  }, [])

  const load = useCallback(async (cid: string) => {
    if (!cid) { setFilas([]); return }
    setLoading(true)
    try {
      const { data: prestamos, error: errP } = await supabase.from('prestamos')
        .select('id,monto,fecha_inicio,estado').eq('cliente_id', parseInt(cid)).order('fecha_inicio').order('id')
      if (errP) throw errP
      const lista = (prestamos || []) as { id: number; monto: number; fecha_inicio: string; estado: string }[]
      if (!lista.length) { setFilas([]); return }
      const ids = lista.map(p => p.id)

      const [{ data: cuotas, error: errC }, { data: desembolsos, error: errD }] = await Promise.all([
        supabase.from('cuotas').select('prestamo_id,monto_pagado,interes').in('prestamo_id', ids),
        supabase.from('desembolsos').select('prestamo_id,monto').in('prestamo_id', ids),
      ])
      if (errC) throw errC
      if (errD) throw errD

      setFilas(lista.map(p => {
        const cs = ((cuotas || []) as { prestamo_id: number; monto_pagado: number; interes: number }[]).filter(c => c.prestamo_id === p.id)
        const adicionales = ((desembolsos || []) as { prestamo_id: number; monto: number }[])
          .filter(d => d.prestamo_id === p.id).reduce((s, d) => s + Number(d.monto), 0)
        const cobrado = cs.reduce((s, c) => s + Number(c.monto_pagado), 0)
        const abonoCapital = cs.reduce((s, c) => s + Math.max(0, Number(c.monto_pagado) - Number(c.interes)), 0)
        const capitalInicial = redondear(Number(p.monto) - adicionales)
        return {
          id: p.id, fecha: p.fecha_inicio, estado: p.estado,
          capitalInicial, adicionales: redondear(adicionales),
          cobrado: redondear(cobrado), interes: redondear(cobrado - abonoCapital), abonoCapital: redondear(abonoCapital),
          saldo: Math.max(0, redondear(Number(p.monto) - abonoCapital)),
        }
      }))
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(clienteId) }, [clienteId, load])

  const visibles = useMemo(
    () => filas.filter(f => !soloActivos || f.estado === 'activo' || f.estado === 'en_mora'),
    [filas, soloActivos],
  )
  const total = useMemo(() => visibles.reduce((s, f) => ({
    capitalInicial: s.capitalInicial + f.capitalInicial, adicionales: s.adicionales + f.adicionales,
    cobrado: s.cobrado + f.cobrado, interes: s.interes + f.interes,
    abonoCapital: s.abonoCapital + f.abonoCapital, saldo: s.saldo + f.saldo,
  }), { capitalInicial: 0, adicionales: 0, cobrado: 0, interes: 0, abonoCapital: 0, saldo: 0 }), [visibles])

  const clienteSel = clientes.find(c => c.id === parseInt(clienteId))
  const nombreCliente = `${clienteSel?.nombre ?? ''} ${clienteSel?.apellido ?? ''}`.trim()

  const csvEscape = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const exportarExcel = () => {
    const headers = ['Fecha', 'Préstamo', 'Estado', 'Capital inicial', 'Adicionales', 'Cobrado', 'Interés', 'Abono Capital', 'Saldo Capital']
    const rows = visibles.map(f => [
      f.fecha, `#${f.id}`, ESTADO_LABEL[f.estado] ?? f.estado,
      f.capitalInicial.toFixed(2), f.adicionales.toFixed(2), f.cobrado.toFixed(2),
      f.interes.toFixed(2), f.abonoCapital.toFixed(2), f.saldo.toFixed(2),
    ])
    rows.push(['', 'TOTAL', '', total.capitalInicial.toFixed(2), total.adicionales.toFixed(2), total.cobrado.toFixed(2),
      total.interes.toFixed(2), total.abonoCapital.toFixed(2), total.saldo.toFixed(2)])
    const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `estado-de-cuenta-${nombreCliente || 'cliente'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <p className="text-[12px] text-slate-500 mb-0.5">Reportes / Estado de cuenta del cliente</p>
          <h1 className="text-2xl font-bold text-[#0f172a]">Estado de Cuenta del Cliente</h1>
          <p className="text-[14px] text-slate-500 mt-0.5">Un renglón por préstamo: lo prestado, lo cobrado y lo que queda por pagar</p>
        </div>
        {clienteId && filas.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[12px] font-bold">
              🖨️ Imprimir / PDF
            </button>
            <button onClick={exportarExcel} className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold">
              📊 Exportar Excel
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 print:hidden">
        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cliente</label>
        <select value={clienteId} onChange={e => setClienteId(e.target.value)}
          className="w-full sm:w-96 px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400 bg-white">
          <option value="">— Seleccionar cliente —</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido}</option>)}
        </select>
        <label className="ml-4 inline-flex items-center gap-2 text-[12px] font-bold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)} className="accent-emerald-600" />
          Solo préstamos activos
        </label>
      </div>

      {clienteId && filas.length > 0 && (
        <div className="hidden print:block">
          <h1 className="text-xl font-bold text-[#0f172a]">Estado de cuenta — {nombreCliente}</h1>
          <p className="text-[12px] text-slate-500">Al {fmtFecha(new Date().toISOString().slice(0, 10))}</p>
        </div>
      )}

      {!clienteId ? (
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm py-16 text-center text-slate-400 text-[13px]">
          Selecciona un cliente para ver su estado de cuenta.
        </div>
      ) : loading ? (
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm py-16 text-center text-slate-400 text-[13px]">Cargando…</div>
      ) : filas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm py-16 text-center text-slate-400 text-[13px]">
          {clienteSel?.nombre} no tiene préstamos registrados.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
              <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Total prestado (capital)</div>
              <div className="text-[20px] font-extrabold text-[#0f172a]">{fmtMoney(total.capitalInicial + total.adicionales)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
              <div className="text-[9px] font-bold text-emerald-700 uppercase mb-1">Total cobrado</div>
              <div className="text-[20px] font-extrabold text-emerald-700">{fmtMoney(total.cobrado)}</div>
              <div className="text-[11px] text-slate-500 mt-1">{fmtMoney(total.interes)} interés + {fmtMoney(total.abonoCapital)} a capital</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
              <div className="text-[9px] font-bold text-red-600 uppercase mb-1">Saldo de capital pendiente</div>
              <div className="text-[20px] font-extrabold text-red-600">{fmtMoney(total.saldo)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-[#0f172a] to-[#059669] text-white font-bold text-[14px]">
              📋 {nombreCliente}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#f1f5f9] border-b-2 border-[#e2e8f0]">
                    <th className="px-4 py-2 text-left text-[11px] font-bold uppercase text-slate-500">Fecha</th>
                    <th className="px-4 py-2 text-left text-[11px] font-bold uppercase text-slate-500">Préstamo</th>
                    <th className="px-4 py-2 text-center text-[11px] font-bold uppercase text-slate-500">Estado</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">Capital inicial</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">+ Adicionales</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">Cobrado</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">= Interés</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">+ Abono capital</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">Saldo capital</th>
                    <th className="px-4 py-2 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(f => (
                    <tr key={f.id} className="border-b border-[#f1f5f9]">
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmtFecha(f.fecha)}</td>
                      <td className="px-4 py-2 font-semibold text-[#0f172a]">#{f.id}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${ESTADO_STYLE[f.estado] ?? ESTADO_STYLE.pagado}`}>
                          {ESTADO_LABEL[f.estado] ?? f.estado}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-[#0f172a]">{fmtMoney(f.capitalInicial)}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{f.adicionales > 0 ? fmtMoney(f.adicionales) : '—'}</td>
                      <td className="px-4 py-2 text-right font-bold text-emerald-700">{fmtMoney(f.cobrado)}</td>
                      <td className="px-4 py-2 text-right text-amber-700">{fmtMoney(f.interes)}</td>
                      <td className="px-4 py-2 text-right text-sky-700">{fmtMoney(f.abonoCapital)}</td>
                      <td className="px-4 py-2 text-right font-bold text-red-600">{fmtMoney(f.saldo)}</td>
                      <td className="px-4 py-2 text-center print:hidden">
                        <Link href={`/dashboard/prestamos/${f.id}`} className="text-[#0369a1] hover:underline text-[12px] font-semibold">Ver →</Link>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#f8fafc] border-t-2 border-[#e2e8f0] font-extrabold">
                    <td className="px-4 py-2.5 text-[#0f172a]" colSpan={3}>TOTAL</td>
                    <td className="px-4 py-2.5 text-right text-[#0f172a]">{fmtMoney(total.capitalInicial)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtMoney(total.adicionales)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-700">{fmtMoney(total.cobrado)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-700">{fmtMoney(total.interes)}</td>
                    <td className="px-4 py-2.5 text-right text-sky-700">{fmtMoney(total.abonoCapital)}</td>
                    <td className="px-4 py-2.5 text-right text-red-600">{fmtMoney(total.saldo)}</td>
                    <td className="print:hidden"></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-[11px] text-slate-500 border-t border-[#f1f5f9]">
              Cuadre: Capital inicial + Adicionales − Abono capital = Saldo capital. Cobrado = Interés + Abono capital.
              «Adicionales» incluye préstamos extra e interés capitalizado por mora.
            </p>
          </div>

          <div className="print:hidden">
            <Link href={`/dashboard/reportes/movimiento?cliente=${clienteId}`} className="text-[#0369a1] hover:underline text-[13px] font-semibold">
              Ver movimiento detallado de {clienteSel?.nombre} →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
