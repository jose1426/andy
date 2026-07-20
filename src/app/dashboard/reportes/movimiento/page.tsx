'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { fmtMoney, fmtFecha, FORMA_PAGO_LABEL } from '@/lib/prestamos'
import type { Cliente, Cuota, Desembolso, Pago } from '@/types'

interface PrestamoRow {
  id: number
  monto: number
  fecha_inicio: string
  estado: string
}

interface Movimiento {
  key: string
  fecha: string
  orden: number
  tipo: 'prestamo' | 'adicional' | 'capitalizacion' | 'pago'
  descripcion: string
  prestamoId: number
  prestado: number
  cobrado: number
  interesDelCobro: number
  capitalDelCobro: number
  capitalDelta: number
}

const TIPO_LABEL: Record<Movimiento['tipo'], string> = {
  prestamo: '💵 Préstamo otorgado',
  adicional: '➕ Préstamo adicional',
  capitalizacion: '🔄 Interés capitalizado',
  pago: '💰 Pago',
}
const TIPO_STYLE: Record<Movimiento['tipo'], string> = {
  prestamo: 'text-[#0f172a]',
  adicional: 'text-[#0f172a]',
  capitalizacion: 'text-amber-700',
  pago: 'text-emerald-700',
}

export default function ReporteMovimientoPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400">Cargando…</div>}>
      <ReporteMovimientoContent />
    </Suspense>
  )
}

function ReporteMovimientoContent() {
  const searchParams = useSearchParams()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteId, setClienteId] = useState(searchParams.get('cliente') ?? '')
  const [loading, setLoading] = useState(false)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])

  useEffect(() => {
    supabase.from('clientes').select('*').order('nombre').then(({ data }) => setClientes((data || []) as Cliente[]))
  }, [])

  const load = useCallback(async (cid: string) => {
    if (!cid) { setMovimientos([]); return }
    setLoading(true)
    try {
      const { data: prestamos, error: errP } = await supabase.from('prestamos')
        .select('id,monto,fecha_inicio,estado').eq('cliente_id', parseInt(cid))
      if (errP) throw errP
      const prestamosList = (prestamos || []) as PrestamoRow[]
      if (!prestamosList.length) { setMovimientos([]); return }
      const ids = prestamosList.map(p => p.id)

      const [{ data: cuotas, error: errC }, { data: pagos, error: errPa }, { data: desembolsos, error: errD }] = await Promise.all([
        supabase.from('cuotas').select('*').in('prestamo_id', ids),
        supabase.from('pagos').select('*').in('prestamo_id', ids).order('fecha').order('id'),
        supabase.from('desembolsos').select('*').in('prestamo_id', ids).order('fecha').order('id'),
      ])
      if (errC) throw errC
      if (errPa) throw errPa
      if (errD) throw errD

      const cuotasList = (cuotas || []) as Cuota[]
      const pagosList = (pagos || []) as Pago[]
      const desembolsosList = (desembolsos || []) as Desembolso[]

      const movs: Movimiento[] = []
      let orden = 0

      for (const p of prestamosList) {
        const totalDesemPrestamo = desembolsosList.filter(d => d.prestamo_id === p.id).reduce((s, d) => s + Number(d.monto), 0)
        const capitalInicial = Math.round((Number(p.monto) - totalDesemPrestamo) * 100) / 100
        movs.push({
          key: `prestamo-${p.id}`, fecha: p.fecha_inicio, orden: orden++, tipo: 'prestamo',
          descripcion: 'Préstamo otorgado', prestamoId: p.id,
          prestado: capitalInicial, cobrado: 0, interesDelCobro: 0, capitalDelCobro: 0, capitalDelta: capitalInicial,
        })
      }

      for (const d of desembolsosList) {
        const esCapitalizacion = (d.notas || '').startsWith('Interés capitalizado')
        movs.push({
          key: `desem-${d.id}`, fecha: d.fecha, orden: orden++, tipo: esCapitalizacion ? 'capitalizacion' : 'adicional',
          descripcion: d.notas || 'Préstamo adicional', prestamoId: d.prestamo_id,
          prestado: Number(d.monto), cobrado: 0, interesDelCobro: 0, capitalDelCobro: 0, capitalDelta: Number(d.monto),
        })
      }

      // Para cada pago, reconstruir cuánto fue a capital replicando el orden real
      // de abonos por cuota (misma lógica usada al registrar el pago).
      const cuotaById = new Map(cuotasList.map(c => [c.id, c]))
      const pagosPorCuota = new Map<number, Pago[]>()
      for (const pago of pagosList) {
        if (!pagosPorCuota.has(pago.cuota_id)) pagosPorCuota.set(pago.cuota_id, [])
        pagosPorCuota.get(pago.cuota_id)!.push(pago)
      }
      const capitalPorPago = new Map<number, number>()
      for (const [cuotaId, lista] of pagosPorCuota) {
        const cuota = cuotaById.get(cuotaId)
        if (!cuota) continue
        let acumulado = 0
        for (const pago of lista) {
          const capitalPrevio = Math.max(0, acumulado - cuota.interes)
          acumulado += Number(pago.monto)
          const capitalNuevo = Math.max(0, acumulado - cuota.interes)
          capitalPorPago.set(pago.id, Math.round((capitalNuevo - capitalPrevio) * 100) / 100)
        }
      }

      for (const pago of pagosList) {
        const cuota = cuotaById.get(pago.cuota_id)
        const capitalDelCobro = capitalPorPago.get(pago.id) ?? 0
        const interesDelCobro = Math.round((Number(pago.monto) - capitalDelCobro) * 100) / 100
        movs.push({
          key: `pago-${pago.id}`, fecha: pago.fecha, orden: orden++, tipo: 'pago',
          descripcion: `Pago cuota #${cuota?.numero ?? '?'} · ${pago.tipo} · ${FORMA_PAGO_LABEL[pago.forma_pago]}`,
          prestamoId: pago.prestamo_id, prestado: 0, cobrado: Number(pago.monto),
          interesDelCobro, capitalDelCobro, capitalDelta: -capitalDelCobro,
        })
      }

      movs.sort((a, b) => a.fecha === b.fecha ? a.orden - b.orden : a.fecha.localeCompare(b.fecha))
      setMovimientos(movs)
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(clienteId) }, [clienteId, load])

  const conSaldo = useMemo(() => {
    let saldo = 0
    return movimientos.map(m => { saldo = Math.round((saldo + m.capitalDelta) * 100) / 100; return { ...m, saldo } })
  }, [movimientos])

  const totalPrestado = movimientos.reduce((s, m) => s + m.prestado, 0)
  const totalCobrado = movimientos.reduce((s, m) => s + m.cobrado, 0)
  const totalInteres = movimientos.reduce((s, m) => s + m.interesDelCobro, 0)
  const totalAbonoCapital = movimientos.reduce((s, m) => s + m.capitalDelCobro, 0)
  const saldoActual = conSaldo.length ? conSaldo[conSaldo.length - 1].saldo : 0

  const clienteSel = clientes.find(c => c.id === parseInt(clienteId))

  const csvEscape = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

  const exportarExcel = () => {
    const headers = ['Fecha', 'Movimiento', 'Prestado', 'Cobrado', 'Interés', 'Abono Capital', 'Saldo Capital']
    const filas = conSaldo.map(m => [
      m.fecha,
      `${TIPO_LABEL[m.tipo]} - ${m.descripcion}`,
      m.prestado > 0 ? m.prestado.toFixed(2) : '',
      m.cobrado > 0 ? m.cobrado.toFixed(2) : '',
      m.tipo === 'pago' ? m.interesDelCobro.toFixed(2) : '',
      m.tipo === 'pago' ? m.capitalDelCobro.toFixed(2) : '',
      m.saldo.toFixed(2),
    ])
    const csv = [headers, ...filas].map(fila => fila.map(csvEscape).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `movimiento-${clienteSel?.nombre ?? 'cliente'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <p className="text-[12px] text-slate-500 mb-0.5">Reportes / Movimiento</p>
          <h1 className="text-2xl font-bold text-[#0f172a]">Movimiento por Cliente</h1>
          <p className="text-[14px] text-slate-500 mt-0.5">Estado de cuenta: préstamos, desembolsos y pagos en orden cronológico</p>
        </div>
        {clienteId && movimientos.length > 0 && (
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
      </div>

      {clienteId && movimientos.length > 0 && (
        <div className="hidden print:block">
          <h1 className="text-xl font-bold text-[#0f172a]">Movimiento — {clienteSel?.nombre} {clienteSel?.apellido}</h1>
          <p className="text-[12px] text-slate-500">Estado de cuenta al {fmtFecha(new Date().toISOString().slice(0, 10))}</p>
        </div>
      )}

      {!clienteId ? (
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm py-16 text-center text-slate-400 text-[13px]">
          Selecciona un cliente para ver su movimiento.
        </div>
      ) : loading ? (
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm py-16 text-center text-slate-400 text-[13px]">Cargando…</div>
      ) : movimientos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm py-16 text-center text-slate-400 text-[13px]">
          {clienteSel?.nombre} no tiene préstamos registrados.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
              <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Total prestado</div>
              <div className="text-[20px] font-extrabold text-[#0f172a]">{fmtMoney(totalPrestado)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
              <div className="text-[9px] font-bold text-emerald-700 uppercase mb-1">Total cobrado</div>
              <div className="text-[20px] font-extrabold text-emerald-700">{fmtMoney(totalCobrado)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
              <div className="text-[9px] font-bold text-amber-700 uppercase mb-1">Interés cobrado</div>
              <div className="text-[20px] font-extrabold text-amber-700">{fmtMoney(totalInteres)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
              <div className="text-[9px] font-bold text-sky-700 uppercase mb-1">Abonado a capital</div>
              <div className="text-[20px] font-extrabold text-sky-700">{fmtMoney(totalAbonoCapital)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
              <div className="text-[9px] font-bold text-red-600 uppercase mb-1">Saldo de capital pendiente</div>
              <div className="text-[20px] font-extrabold text-red-600">{fmtMoney(saldoActual)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-[#0f172a] to-[#059669] text-white font-bold text-[14px]">
              🧾 {clienteSel?.nombre} {clienteSel?.apellido}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#f1f5f9] border-b-2 border-[#e2e8f0]">
                    <th className="px-4 py-2 text-left text-[11px] font-bold uppercase text-slate-500">Fecha</th>
                    <th className="px-4 py-2 text-left text-[11px] font-bold uppercase text-slate-500">Movimiento</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">Prestado</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">Cobrado</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">Interés</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">Abono capital</th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase text-slate-500">Saldo capital</th>
                    <th className="px-4 py-2 text-center text-[11px] font-bold uppercase text-slate-500 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {conSaldo.map(m => (
                    <tr key={m.key} className="border-b border-[#f1f5f9]">
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmtFecha(m.fecha)}</td>
                      <td className={`px-4 py-2 font-semibold ${TIPO_STYLE[m.tipo]}`}>
                        {TIPO_LABEL[m.tipo]}
                        {m.tipo !== 'prestamo' && <span className="text-slate-400 font-normal"> — {m.descripcion}</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-[#0f172a]">{m.prestado > 0 ? fmtMoney(m.prestado) : '—'}</td>
                      <td className="px-4 py-2 text-right font-bold text-emerald-700">{m.cobrado > 0 ? fmtMoney(m.cobrado) : '—'}</td>
                      <td className="px-4 py-2 text-right text-amber-700">{m.tipo === 'pago' ? fmtMoney(m.interesDelCobro) : '—'}</td>
                      <td className="px-4 py-2 text-right text-sky-700">{m.tipo === 'pago' ? fmtMoney(m.capitalDelCobro) : '—'}</td>
                      <td className="px-4 py-2 text-right font-bold text-[#0f172a]">{fmtMoney(m.saldo)}</td>
                      <td className="px-4 py-2 text-center print:hidden">
                        <Link href={`/dashboard/prestamos/${m.prestamoId}`} className="text-[#0369a1] hover:underline text-[12px] font-semibold">Ver →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
