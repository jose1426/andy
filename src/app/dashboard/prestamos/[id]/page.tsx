'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { fmtMoney, fmtFecha, FRECUENCIA_LABEL } from '@/lib/prestamos'
import type { Cliente, Prestamo, Cuota, Pago } from '@/types'

const ESTADO_CUOTA_STYLE: Record<string, string> = {
  pendiente: 'bg-slate-100 text-slate-600 border-slate-300',
  pagada: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  parcial: 'bg-amber-100 text-amber-800 border-amber-300',
  atrasada: 'bg-red-100 text-red-800 border-red-300',
}
const ESTADO_CUOTA_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', pagada: 'Pagada', parcial: 'Parcial', atrasada: 'Atrasada',
}

export default function PrestamoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [prestamo, setPrestamo] = useState<(Prestamo & { cliente: Cliente }) | null>(null)
  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(false)
  const [cuotaSel, setCuotaSel] = useState<Cuota | null>(null)
  const [montoPago, setMontoPago] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [presRes, cuotasRes, pagosRes] = await Promise.all([
      supabase.from('prestamos_prestamos').select('*, cliente:prestamos_clientes(*)').eq('id', id).single(),
      supabase.from('prestamos_cuotas').select('*').eq('prestamo_id', id).order('numero'),
      supabase.from('prestamos_pagos').select('*').eq('prestamo_id', id).order('fecha', { ascending: false }),
    ])
    setLoading(false)
    if (presRes.error) { toast.error('Préstamo no encontrado.'); router.replace('/dashboard/prestamos'); return }
    setPrestamo(presRes.data as any)
    setCuotas((cuotasRes.data || []) as Cuota[])
    setPagos((pagosRes.data || []) as Pago[])

    // Marcar cuotas vencidas como atrasadas (visual, sobre pendientes sin pagar)
    const hoy = new Date().toISOString().slice(0, 10)
    const vencidas = (cuotasRes.data || []).filter((c: any) => c.estado === 'pendiente' && c.fecha_vencimiento < hoy)
    if (vencidas.length) {
      await supabase.from('prestamos_cuotas').update({ estado: 'atrasada' }).in('id', vencidas.map((c: any) => c.id))
      if (presRes.data?.estado === 'activo') {
        await supabase.from('prestamos_prestamos').update({ estado: 'en_mora' }).eq('id', id)
      }
      const { data: cuotasFresh } = await supabase.from('prestamos_cuotas').select('*').eq('prestamo_id', id).order('numero')
      setCuotas((cuotasFresh || []) as Cuota[])
      const { data: presFresh } = await supabase.from('prestamos_prestamos').select('*, cliente:prestamos_clientes(*)').eq('id', id).single()
      setPrestamo(presFresh as any)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  const abrirPago = (c: Cuota) => {
    setCuotaSel(c)
    setMontoPago(String((c.monto_cuota - c.monto_pagado).toFixed(2)))
    setModal(true)
  }
  const cerrarModal = () => { setModal(false); setCuotaSel(null); setMontoPago('') }

  const registrarPago = async () => {
    if (!cuotaSel || !prestamo) return
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

      const { error: errPago } = await supabase.from('prestamos_pagos').insert({
        cuota_id: cuotaSel.id, prestamo_id: prestamo.id, monto, tipo,
      })
      if (errPago) throw errPago

      const { error: errCuota } = await supabase.from('prestamos_cuotas')
        .update({ monto_pagado: nuevoMontoPagado, estado: nuevoEstadoCuota })
        .eq('id', cuotaSel.id)
      if (errCuota) throw errCuota

      // Si hubo abono a capital, recalcular interés de las cuotas futuras pendientes/atrasadas
      // sobre el nuevo saldo, y reducir el capital final que vence en la última cuota.
      if (abonoCapital > 0) {
        const capitalPagadoTotal = cuotas
          .filter(c => c.id !== cuotaSel.id)
          .reduce((s, c) => s + Math.max(0, c.monto_pagado - c.interes), 0) + nuevoCapitalPagado
        const nuevoSaldo = Math.max(0, prestamo.monto - capitalPagadoTotal)
        const tasa = prestamo.tasa_interes / 100
        const futuras = cuotas.filter(c => c.id !== cuotaSel.id && c.numero > cuotaSel.numero && (c.estado === 'pendiente' || c.estado === 'atrasada'))
        const ultima = cuotas.reduce((max, c) => c.numero > max.numero ? c : max, cuotas[0])

        for (const c of futuras) {
          const esUltima = c.id === ultima.id
          const nuevoInteres = Math.round(nuevoSaldo * tasa * 100) / 100
          const nuevoCapitalCuota = esUltima ? nuevoSaldo : 0
          await supabase.from('prestamos_cuotas').update({
            interes: nuevoInteres,
            capital: nuevoCapitalCuota,
            monto_cuota: nuevoInteres + nuevoCapitalCuota,
            saldo_capital: nuevoSaldo,
          }).eq('id', c.id)
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

  useEffect(() => {
    if (!prestamo || !cuotas.length) return
    const todasPagadas = cuotas.every(c => c.estado === 'pagada')
    if (todasPagadas && prestamo.estado !== 'pagado') {
      supabase.from('prestamos_prestamos').update({ estado: 'pagado' }).eq('id', prestamo.id).then(() => {
        setPrestamo(prev => prev ? { ...prev, estado: 'pagado' } : prev)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuotas])

  if (loading || !prestamo) {
    return <div className="py-20 text-center text-slate-400">Cargando…</div>
  }

  const totalCuota = (c: Cuota) => c.monto_cuota
  const saldoCuota = (c: Cuota) => Math.max(0, c.monto_cuota - c.monto_pagado)
  const totalPagado = cuotas.reduce((s, c) => s + c.monto_pagado, 0)
  const totalEsperado = cuotas.reduce((s, c) => s + c.monto_cuota, 0)

  return (
    <div className="space-y-4 animate-fadeIn">
      <button onClick={() => router.push('/dashboard/prestamos')} className="text-[13px] text-slate-500 hover:text-slate-700 flex items-center gap-1">
        ← Volver a Préstamos
      </button>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-[#0f172a] to-[#059669] text-white flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[18px] font-extrabold">{prestamo.cliente.nombre} {prestamo.cliente.apellido}</div>
            <div className="text-[12px] text-emerald-200/80 mt-0.5">
              {prestamo.cliente.cedula || 'Sin cédula'} · {prestamo.cliente.telefono || 'Sin teléfono'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[22px] font-extrabold">{fmtMoney(prestamo.monto)}</div>
            <div className="text-[12px] text-emerald-200/80">{prestamo.tasa_interes}% · {FRECUENCIA_LABEL[prestamo.frecuencia]} · desde {fmtFecha(prestamo.fecha_inicio)}</div>
          </div>
        </div>

        <div className="px-6 py-3 flex items-center gap-8 bg-[#f8fafc] border-b border-[#e2e8f0] flex-wrap">
          <div>
            <div className="text-[9px] font-bold text-slate-500 uppercase">Total esperado</div>
            <div className="text-[14px] font-bold text-[#0f172a]">{fmtMoney(totalEsperado)}</div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-emerald-700 uppercase">Total cobrado</div>
            <div className="text-[14px] font-bold text-emerald-700">{fmtMoney(totalPagado)}</div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-red-600 uppercase">Saldo pendiente</div>
            <div className="text-[14px] font-bold text-red-600">{fmtMoney(totalEsperado - totalPagado)}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#f1f5f9] border-b-2 border-[#e2e8f0]">
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">#</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-slate-500">Vencimiento</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Interés</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Capital</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Cuota</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Pagado</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Estado</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Acción</th>
              </tr>
            </thead>
            <tbody>
              {cuotas.map((c, i) => (
                <tr key={c.id} className={`border-b border-[#f1f5f9] ${i % 2 === 0 ? '' : 'bg-[#f8fafc]'}`}>
                  <td className="px-4 py-2.5 text-center font-mono text-slate-500">{c.numero}</td>
                  <td className="px-4 py-2.5">{fmtFecha(c.fecha_vencimiento)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(c.interes)}</td>
                  <td className="px-4 py-2.5 text-right">{c.capital > 0 ? fmtMoney(c.capital) : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-[#0f172a]">{fmtMoney(totalCuota(c))}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-700">{c.monto_pagado > 0 ? fmtMoney(c.monto_pagado) : '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${ESTADO_CUOTA_STYLE[c.estado]}`}>
                      {ESTADO_CUOTA_LABEL[c.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {c.estado !== 'pagada' && (
                      <button onClick={() => abrirPago(c)} className="px-3 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700">
                        💰 Cobrar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
        <div className="text-[14px] font-bold text-[#0f172a] mb-3">Historial de pagos</div>
        {pagos.length === 0 ? (
          <div className="text-[13px] text-slate-400 py-4 text-center">Sin pagos registrados aún.</div>
        ) : (
          <div className="space-y-2">
            {pagos.map(p => (
              <div key={p.id} className="flex items-center justify-between text-[13px] border-b border-[#f1f5f9] pb-2 last:border-0">
                <span className="text-slate-500">{fmtFecha(p.fecha)} · <span className="capitalize">{p.tipo}</span></span>
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
              <span className="text-white font-bold text-[15px]">💰 Registrar Pago — Cuota {cuotaSel.numero}</span>
              <button onClick={cerrarModal} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-[12px] text-slate-600 space-y-1">
                <div className="flex justify-between"><span>Cuota esperada</span><b>{fmtMoney(cuotaSel.monto_cuota)}</b></div>
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
