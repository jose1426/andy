'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { fmtMoney, fmtFecha } from '@/lib/prestamos'
import type { Cuota } from '@/types'

interface CuotaRow extends Cuota {
  prestamo: { id: number; monto: number; tasa_interes: number; cliente: { nombre: string; apellido: string | null; cedula: string | null } }
}

interface PagoRow {
  id: number
  monto: number
  fecha: string
  tipo: string
  cuota: { numero: number; prestamo: { id: number; cliente: { nombre: string; apellido: string | null } } }
}

const ESTADO_STYLE: Record<string, string> = {
  pendiente: 'bg-slate-100 text-slate-600 border-slate-300',
  parcial: 'bg-amber-100 text-amber-800 border-amber-300',
  atrasada: 'bg-red-100 text-red-800 border-red-300',
}
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', parcial: 'Parcial', atrasada: 'Atrasada',
}

export default function CobrosPage() {
  const [cuotas, setCuotas] = useState<CuotaRow[]>([])
  const [pagos, setPagos] = useState<PagoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [modal, setModal] = useState(false)
  const [cuotaSel, setCuotaSel] = useState<CuotaRow | null>(null)
  const [cuotasPrestamo, setCuotasPrestamo] = useState<Cuota[]>([])
  const [montoPago, setMontoPago] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [cuotasRes, pagosRes] = await Promise.all([
      supabase.from('cuotas')
        .select('*, prestamo:prestamos(id,monto,tasa_interes,cliente:clientes(nombre,apellido,cedula))')
        .in('estado', ['pendiente', 'atrasada', 'parcial'])
        .order('fecha_vencimiento'),
      supabase.from('pagos')
        .select('id,monto,fecha,tipo,cuota:cuotas(numero,prestamo:prestamos(id,cliente:clientes(nombre,apellido)))')
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    setLoading(false)
    if (cuotasRes.error) { toast.error(cuotasRes.error.message); return }
    setCuotas((cuotasRes.data || []) as any)
    setPagos((pagosRes.data || []) as any)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = cuotas.filter(c => {
    const txt = `${c.prestamo.cliente.nombre} ${c.prestamo.cliente.apellido ?? ''} ${c.prestamo.cliente.cedula ?? ''}`.toLowerCase()
    return !search || txt.includes(search.toLowerCase())
  })

  const abrirPago = async (c: CuotaRow) => {
    setCuotaSel(c)
    setMontoPago(String((c.monto_cuota - c.monto_pagado).toFixed(2)))
    const { data } = await supabase.from('cuotas').select('*').eq('prestamo_id', c.prestamo.id).order('numero')
    setCuotasPrestamo((data || []) as Cuota[])
    setModal(true)
  }
  const cerrarModal = () => { setModal(false); setCuotaSel(null); setMontoPago(''); setCuotasPrestamo([]) }

  const registrarPago = async () => {
    if (!cuotaSel) return
    const monto = parseFloat(montoPago)
    if (!monto || monto <= 0) { toast.error('Ingrese un monto válido.'); return }

    setSaving(true)
    try {
      const interesPagadoPrevio = Math.min(cuotaSel.monto_pagado, cuotaSel.interes)
      const capitalPagadoPrevio = Math.max(0, cuotaSel.monto_pagado - cuotaSel.interes)
      const nuevoMontoPagado = cuotaSel.monto_pagado + monto
      const nuevoInteresPagado = Math.min(nuevoMontoPagado, cuotaSel.interes)
      const nuevoCapitalPagado = Math.max(0, nuevoMontoPagado - cuotaSel.interes)
      const abonoCapital = nuevoCapitalPagado - capitalPagadoPrevio
      const abonoInteres = nuevoInteresPagado - interesPagadoPrevio
      const tipo = abonoCapital > 0 && abonoInteres > 0 ? 'mixto' : abonoCapital > 0 ? 'capital' : 'interes'
      const nuevoEstadoCuota = nuevoMontoPagado >= cuotaSel.monto_cuota - 0.001 ? 'pagada' : 'parcial'

      const { error: errPago } = await supabase.from('pagos').insert({
        cuota_id: cuotaSel.id, prestamo_id: cuotaSel.prestamo.id, monto, tipo,
      })
      if (errPago) throw errPago

      const { error: errCuota } = await supabase.from('cuotas')
        .update({ monto_pagado: nuevoMontoPagado, estado: nuevoEstadoCuota })
        .eq('id', cuotaSel.id)
      if (errCuota) throw errCuota

      if (abonoCapital > 0) {
        const capitalPagadoTotal = cuotasPrestamo
          .filter(c => c.id !== cuotaSel.id)
          .reduce((s, c) => s + Math.max(0, c.monto_pagado - c.interes), 0) + nuevoCapitalPagado
        const nuevoSaldo = Math.max(0, Math.round((cuotaSel.prestamo.monto - capitalPagadoTotal) * 100) / 100)
        const tasa = cuotaSel.prestamo.tasa_interes / 100
        const futuras = cuotasPrestamo.filter(c => c.id !== cuotaSel.id && c.numero > cuotaSel.numero && (c.estado === 'pendiente' || c.estado === 'atrasada'))

        for (const c of futuras) {
          const nuevoInteres = Math.round(nuevoSaldo * tasa * 100) / 100
          await supabase.from('cuotas').update({
            interes: nuevoInteres, capital: 0, monto_cuota: nuevoInteres, saldo_capital: nuevoSaldo,
          }).eq('id', c.id)
        }
        if (nuevoSaldo <= 0) {
          await supabase.from('prestamos').update({ estado: 'pagado' }).eq('id', cuotaSel.prestamo.id)
        }
      }

      toast.success('Pago registrado.')
      cerrarModal()
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const saldoCuota = (c: Cuota) => Math.max(0, c.monto_cuota - c.monto_pagado)
  const totalPorCobrar = filtered.reduce((s, c) => s + saldoCuota(c), 0)

  return (
    <div className="space-y-4 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a]">Cobros</h1>
        <p className="text-[14px] text-slate-500 mt-0.5">Cuotas pendientes de todos los préstamos, listas para cobrar</p>
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex items-center gap-4 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por cliente o cédula…"
          className="flex-1 min-w-[200px] px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400"
        />
        <div className="text-right">
          <div className="text-[9px] font-bold text-slate-500 uppercase">Total por cobrar</div>
          <div className="text-[16px] font-extrabold text-emerald-700">{fmtMoney(totalPorCobrar)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#f1f5f9] border-b-2 border-[#e2e8f0]">
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-slate-500">Cliente</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Cuota</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-slate-500">Vencimiento</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Saldo</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Estado</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">Cargando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">Sin cuotas pendientes 🎉</td></tr>
              ) : filtered.map((c, i) => (
                <tr key={c.id} className={`border-b border-[#f1f5f9] ${i % 2 === 0 ? '' : 'bg-[#f8fafc]'}`}>
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard/prestamos/${c.prestamo.id}`} className="font-semibold text-[#0369a1] hover:underline">
                      {c.prestamo.cliente.nombre} {c.prestamo.cliente.apellido}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-slate-500">#{c.numero}</td>
                  <td className="px-4 py-2.5">{fmtFecha(c.fecha_vencimiento)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-[#0f172a]">{fmtMoney(saldoCuota(c))}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${ESTADO_STYLE[c.estado]}`}>
                      {ESTADO_LABEL[c.estado] ?? c.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => abrirPago(c)} className="px-3 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700">
                      💰 Cobrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
        <div className="text-[14px] font-bold text-[#0f172a] mb-3">Pagos recientes</div>
        {pagos.length === 0 ? (
          <div className="text-[13px] text-slate-400 py-4 text-center">Sin pagos registrados aún.</div>
        ) : (
          <div className="space-y-2">
            {pagos.map(p => (
              <div key={p.id} className="flex items-center justify-between text-[13px] border-b border-[#f1f5f9] pb-2 last:border-0">
                <span className="text-slate-500">
                  {fmtFecha(p.fecha)} · <Link href={`/dashboard/prestamos/${p.cuota.prestamo.id}`} className="font-semibold text-[#0369a1] hover:underline">
                    {p.cuota.prestamo.cliente.nombre} {p.cuota.prestamo.cliente.apellido}
                  </Link> · cuota #{p.cuota.numero} · <span className="capitalize">{p.tipo}</span>
                </span>
                <span className="font-bold text-emerald-700">{fmtMoney(p.monto)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && cuotaSel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && cerrarModal()}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-slideUp">
            <div className="bg-gradient-to-r from-[#0f172a] to-[#059669] px-6 py-4 flex items-center justify-between">
              <span className="text-white font-bold text-[15px]">💰 Cobrar — {cuotaSel.prestamo.cliente.nombre} {cuotaSel.prestamo.cliente.apellido}</span>
              <button onClick={cerrarModal} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-[12px] text-slate-600 space-y-1">
                <div className="flex justify-between"><span>Cuota #{cuotaSel.numero} esperada</span><b>{fmtMoney(cuotaSel.monto_cuota)}</b></div>
                <div className="flex justify-between"><span>Ya pagado</span><b>{fmtMoney(cuotaSel.monto_pagado)}</b></div>
                <div className="flex justify-between text-red-600"><span>Saldo de esta cuota</span><b>{fmtMoney(saldoCuota(cuotaSel))}</b></div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Monto a pagar</label>
                <input type="number" step="0.01" min="0" autoFocus value={montoPago} onChange={e => setMontoPago(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[14px] font-bold outline-none focus:border-emerald-400" />
              </div>
              <p className="text-[11px] text-slate-400">Si el monto supera el interés de la cuota, el excedente se abona a capital y reduce el interés de las próximas cuotas.</p>
              <div className="flex justify-end gap-2.5 pt-2">
                <button onClick={cerrarModal} className="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[13px] font-semibold">Cancelar</button>
                <button onClick={registrarPago} disabled={saving} className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold disabled:opacity-60">
                  {saving ? '⏳ Guardando…' : '💾 Registrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
