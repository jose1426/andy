'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import CuotasAPagar from '@/components/CuotasAPagar'
import { agruparCuotasCapitalizadas, fmtMoney, fmtFecha, FRECUENCIA_LABEL, FORMA_PAGO_LABEL, reconciliarPrestamosVencidos, hoyPanama, repartirPagoPorAntiguedad, registrarPagoPorAntiguedad, soloDecimal, anteriorVencimiento, diasEntre, interesProrrateado } from '@/lib/prestamos'
import type { Cliente, Prestamo, Cuota, Pago, Desembolso, Frecuencia, FormaPago } from '@/types'

const ESTADO_CUOTA_STYLE: Record<string, string> = {
  pendiente: 'bg-slate-100 text-slate-600 border-slate-300',
  pagada: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  parcial: 'bg-amber-100 text-amber-800 border-amber-300',
  atrasada: 'bg-red-100 text-red-800 border-red-300',
  capitalizada: 'bg-purple-100 text-purple-800 border-purple-300',
}
const ESTADO_CUOTA_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', pagada: 'Pagada', parcial: 'Parcial', atrasada: 'Atrasada', capitalizada: 'Capitalizada',
}

export default function PrestamoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [prestamo, setPrestamo] = useState<(Prestamo & { cliente: Cliente }) | null>(null)
  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [desembolsos, setDesembolsos] = useState<Desembolso[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(false)
  const [cuotaSel, setCuotaSel] = useState<Cuota | null>(null)
  const [montoPago, setMontoPago] = useState('')
  const [fechaPago, setFechaPago] = useState('')
  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo')
  const [saving, setSaving] = useState(false)

  const [modalDesem, setModalDesem] = useState(false)
  const [montoDesem, setMontoDesem] = useState('')
  const [notasDesem, setNotasDesem] = useState('')
  const [fechaDesem, setFechaDesem] = useState('')
  const [savingDesem, setSavingDesem] = useState(false)

  const [modalEdit, setModalEdit] = useState(false)
  const [editForm, setEditForm] = useState({ monto: '', tasa_interes: '', frecuencia: 'quincenal' as Frecuencia, fecha_inicio: '', notas: '', carga_historica: false, sin_prorrateo: false })
  const [savingEdit, setSavingEdit] = useState(false)
  const [finalizando, setFinalizando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    await reconciliarPrestamosVencidos(supabase, Number(id))

    const [presRes, cuotasRes, pagosRes, desemRes] = await Promise.all([
      supabase.from('prestamos').select('*, cliente:clientes(*)').eq('id', id).single(),
      supabase.from('cuotas').select('*').eq('prestamo_id', id).order('numero'),
      supabase.from('pagos').select('*').eq('prestamo_id', id).order('fecha', { ascending: false }),
      supabase.from('desembolsos').select('*').eq('prestamo_id', id).order('fecha', { ascending: false }),
    ])
    setLoading(false)
    if (presRes.error) { toast.error('Préstamo no encontrado.'); router.replace('/dashboard/prestamos'); return }

    setPrestamo(presRes.data as any)
    setCuotas((cuotasRes.data || []) as Cuota[])
    setPagos((pagosRes.data || []) as Pago[])
    setDesembolsos((desemRes.data || []) as Desembolso[])
  }, [id, router])

  useEffect(() => { load() }, [load])

  const hoyISO = hoyPanama()
  const pendienteCuota = (c: Cuota) => Math.round((c.monto_cuota - c.monto_pagado) * 100) / 100
  const puedeCapitalizar = (c: Cuota) =>
    !prestamo?.carga_historica && c.fecha_vencimiento < hoyISO && c.estado !== 'pagada' && c.estado !== 'capitalizada' && pendienteCuota(c) > 0

  const capitalizar = async (c: Cuota) => {
    const monto = pendienteCuota(c)
    if (!window.confirm(`¿Capitalizar ${fmtMoney(monto)} de interés pendiente de la cuota #${c.numero}? Se sumará al capital del préstamo.`)) return
    const { data, error } = await supabase.rpc('fn_capitalizar_cuota', { p_cuota_id: c.id })
    if (error) { toast.error('Error: ' + error.message); return }
    if (!data) { toast.error('No se pudo capitalizar: la cuota ya no tiene saldo pendiente.'); return }
    toast.success(`Interés de ${fmtMoney(monto)} capitalizado.`)
    load()
  }

  const esCapitalizacion = (d: Desembolso) => (d.notas || '').startsWith('Interés capitalizado')

  // Deshace una capitalización: borra el desembolso, baja el capital del préstamo y
  // devuelve la cuota a "pendiente" (si ya se pagó después, la cuota no se toca).
  const deshacerCapitalizacion = async (d: Desembolso) => {
    const numero = Number((d.notas || '').match(/cuota #(\d+)/)?.[1])
    if (!window.confirm(`¿Deshacer la capitalización de ${fmtMoney(d.monto)}? Se resta del capital del préstamo${numero ? ` y la cuota #${numero} vuelve a Pendiente` : ''}.`)) return

    const { data: borrados, error: errDel } = await supabase.from('desembolsos').delete().eq('id', d.id).select('id')
    if (errDel) { toast.error('Error: ' + errDel.message); return }
    if (!borrados?.length) { toast.error('No se pudo deshacer: no se borró el registro.'); return }

    const { data: fresco, error: errP } = await supabase.from('prestamos').select('monto').eq('id', id).single()
    if (errP || !fresco) { toast.error('Se borró el registro pero no se pudo actualizar el capital. Avísame.'); return }
    const { error: errUp } = await supabase.from('prestamos')
      .update({ monto: Math.round((Number(fresco.monto) - Number(d.monto)) * 100) / 100 }).eq('id', id)
    if (errUp) { toast.error('Se borró el registro pero no se pudo actualizar el capital. Avísame.'); return }

    if (numero) {
      await supabase.from('cuotas').update({ estado: 'pendiente' })
        .eq('prestamo_id', id).eq('numero', numero).eq('estado', 'capitalizada')
    }
    toast.success('Capitalización deshecha.')
    load()
  }

  const capitalizarVencido = async () => {
    const vencidas = cuotas.filter(puedeCapitalizar)
    const total = Math.round(vencidas.reduce((s, c) => s + pendienteCuota(c), 0) * 100) / 100
    if (!vencidas.length || !window.confirm(`¿Capitalizar ${fmtMoney(total)} de interés vencido (${vencidas.length} cuota${vencidas.length > 1 ? 's' : ''}) de este préstamo? Se sumará al capital.`)) return
    for (const c of vencidas) {
      const { error } = await supabase.rpc('fn_capitalizar_cuota', { p_cuota_id: c.id })
      if (error) { toast.error('Error: ' + error.message); break }
    }
    toast.success(`Interés de ${fmtMoney(total)} capitalizado.`)
    load()
  }

  const abrirPago = (c: Cuota) => {
    setCuotaSel(c)
    // Por defecto se propone pagar todo lo abierto hasta esta cuota (de la más antigua a ella).
    const grupos = agruparCuotasCapitalizadas(cuotas)
    const hastaEsta = repartirPagoPorAntiguedad(cuotas, x => grupos.get(x.numero)?.recargo ?? 0, 0)
      .filter(a => a.cuota.numero <= c.numero)
    setMontoPago(String(hastaEsta.reduce((s, a) => s + a.capacidad, 0).toFixed(2)))
    setFechaPago(hoyPanama())
    setFormaPago('efectivo')
    setModal(true)
  }
  const cerrarModal = () => { setModal(false); setCuotaSel(null); setMontoPago(''); setFechaPago('') }

  const registrarPago = async () => {
    if (!cuotaSel || !prestamo) return
    const monto = parseFloat(montoPago)
    if (!monto || monto <= 0) { toast.error('Ingrese un monto válido.'); return }

    setSaving(true)
    try {
      // El monto se reparte desde la cuota abierta más antigua hacia adelante.
      const grupos = agruparCuotasCapitalizadas(cuotas)
      const asignaciones = repartirPagoPorAntiguedad(cuotas, x => grupos.get(x.numero)?.recargo ?? 0, monto)
      await registrarPagoPorAntiguedad(supabase, { asignaciones, cuotasPrestamo: cuotas, prestamo, fecha: fechaPago, formaPago })

      toast.success('Pago registrado.')
      cerrarModal()
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const abrirDesembolso = () => { setMontoDesem(''); setNotasDesem(''); setFechaDesem(hoyPanama()); setModalDesem(true) }
  const cerrarDesembolso = () => setModalDesem(false)

  const abrirEditar = () => {
    if (!prestamo) return
    setEditForm({
      monto: String(prestamo.monto),
      tasa_interes: String(prestamo.tasa_interes),
      frecuencia: prestamo.frecuencia,
      fecha_inicio: prestamo.fecha_inicio,
      notas: prestamo.notas ?? '',
      carga_historica: prestamo.carga_historica,
      sin_prorrateo: prestamo.sin_prorrateo ?? false,
    })
    setModalEdit(true)
  }
  const cerrarEditar = () => setModalEdit(false)

  const guardarEdicion = async () => {
    if (!prestamo) return
    const monto = parseFloat(editForm.monto)
    const tasa = parseFloat(editForm.tasa_interes)
    if (!monto || monto <= 0) { toast.error('Ingrese un monto válido.'); return }
    if (!tasa || tasa <= 0) { toast.error('Ingrese una tasa válida.'); return }
    if (!editForm.fecha_inicio) { toast.error('Ingrese la fecha de inicio.'); return }

    setSavingEdit(true)
    try {
      const { error } = await supabase.from('prestamos').update({
        monto, tasa_interes: tasa, frecuencia: editForm.frecuencia,
        fecha_inicio: editForm.fecha_inicio, notas: editForm.notas || null,
        carga_historica: editForm.carga_historica, sin_prorrateo: editForm.sin_prorrateo,
      }).eq('id', prestamo.id)
      if (error) throw error

      toast.success('Préstamo actualizado.')
      cerrarEditar()
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const finalizarCargaHistorica = async () => {
    if (!prestamo) return
    setFinalizando(true)
    try {
      const { error } = await supabase.from('prestamos').update({ carga_historica: false }).eq('id', prestamo.id)
      if (error) throw error
      toast.success('Carga histórica finalizada. Desde ahora se calcula mora normalmente.')
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setFinalizando(false)
    }
  }

  const registrarDesembolso = async () => {
    if (!prestamo) return
    const monto = parseFloat(montoDesem)
    if (!monto || monto <= 0) { toast.error('Ingrese un monto válido.'); return }

    setSavingDesem(true)
    try {
      const { error: errDesem } = await supabase.from('desembolsos').insert({
        prestamo_id: prestamo.id, monto, notas: notasDesem || null, fecha: fechaDesem,
      })
      if (errDesem) throw errDesem

      const nuevoMontoTotal = Math.round((prestamo.monto + monto) * 100) / 100
      const { error: errMonto } = await supabase.from('prestamos')
        .update({ monto: nuevoMontoTotal, estado: prestamo.estado === 'pagado' ? 'activo' : prestamo.estado })
        .eq('id', prestamo.id)
      if (errMonto) throw errMonto

      // El interes de las cuotas abiertas se recalcula en reconciliarPrestamosVencidos
      // (prorrateando por dias el capital recien desembolsado), que se ejecuta al
      // recargar mas abajo — no hace falta duplicar ese calculo aqui.

      toast.success('Desembolso registrado y sumado al préstamo.')
      cerrarDesembolso()
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setSavingDesem(false)
    }
  }

  if (loading || !prestamo) {
    return <div className="py-20 text-center text-slate-400">Cargando…</div>
  }

  const grupos = agruparCuotasCapitalizadas(cuotas)
  const recargoCuota = (c: Cuota) => grupos.get(c.numero)?.recargo ?? 0
  const etiquetaCuota = (c: Cuota) => grupos.get(c.numero)?.etiqueta ?? String(c.numero)
  const totalCuota = (c: Cuota) => Math.round((c.monto_cuota + recargoCuota(c)) * 100) / 100
  // c.capital es el capital programado (siempre 0 en préstamos de solo interés); el abono real
  // a capital es el excedente pagado por encima del interés de esa cuota — igual que abonoCapital
  // en registrarPago(). Antes la columna mostraba c.capital y nunca reflejaba el abono real.
  const capitalPagado = (c: Cuota) => Math.max(0, c.monto_pagado - c.interes)
  // Las cuotas capitalizadas se excluyen: su saldo ya se sumó al capital y quedó
  // reflejado en el interés de las cuotas siguientes, contarlas aparte duplicaría el monto.
  const cuotasVigentes = cuotas.filter(c => c.estado !== 'capitalizada')
  const totalPagado = cuotasVigentes.reduce((s, c) => s + c.monto_pagado, 0)
  const totalAbonoCapital = cuotas.reduce((s, c) => s + Math.max(0, c.monto_pagado - c.interes), 0)
  const saldoCapital = prestamo.monto - totalAbonoCapital
  const totalDesembolsado = desembolsos.reduce((s, d) => s + Number(d.monto), 0)
  const totalAdicional = desembolsos.filter(d => !(d.notas || '').startsWith('Interés capitalizado')).reduce((s, d) => s + Number(d.monto), 0)
  const montoInicial = Math.round((prestamo.monto - totalDesembolsado) * 100) / 100

  // Si el desembolso cayó a mitad del período de alguna cuota, muestra cómo se
  // prorrateó su interés por días (mismo cálculo que aplica reconciliarPrestamosVencidos).
  const prorrateoDesembolso = (d: Desembolso) => {
    const cuotaPeriodo = cuotas.find(c => d.fecha > anteriorVencimiento(prestamo.frecuencia, c.fecha_vencimiento) && d.fecha <= c.fecha_vencimiento)
    if (!cuotaPeriodo) return null
    const diasPeriodo = diasEntre(anteriorVencimiento(prestamo.frecuencia, cuotaPeriodo.fecha_vencimiento), cuotaPeriodo.fecha_vencimiento)
    const diasStub = diasEntre(d.fecha, cuotaPeriodo.fecha_vencimiento)
    if (diasStub <= 0 || diasStub >= diasPeriodo) return null
    return { diasStub, diasPeriodo, interes: interesProrrateado(Number(d.monto), prestamo.tasa_interes, diasStub, diasPeriodo) }
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push('/dashboard/prestamos')} className="text-[13px] text-slate-500 hover:text-slate-700 flex items-center gap-1">
          ← Volver a Préstamos
        </button>
        <div className="flex items-center gap-2">
          <button onClick={abrirEditar} className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[12px] font-bold">
            ✏️ Editar Préstamo
          </button>
          <button onClick={abrirDesembolso} className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold">
            ➕ Prestar más (sumar a este préstamo)
          </button>
        </div>
      </div>

      {prestamo.carga_historica && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-3.5 flex items-center justify-between flex-wrap gap-3">
          <div className="text-[12px] text-amber-800">
            📋 <b>Modo carga histórica activo.</b> No se calcula mora ni capitalización de interés en este préstamo.
            Registra todos los pagos pasados y luego finaliza este modo.
          </div>
          <button onClick={finalizarCargaHistorica} disabled={finalizando}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-bold disabled:opacity-60 whitespace-nowrap">
            {finalizando ? '⏳ Guardando…' : '✅ Finalizar carga histórica'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-[#0f172a] to-[#059669] text-white flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[18px] font-extrabold">{prestamo.cliente.nombre} {prestamo.cliente.apellido}</div>
            <div className="text-[12px] text-emerald-200/80 mt-0.5">
              {prestamo.cliente.cedula || 'Sin cédula'} · {prestamo.cliente.telefono || 'Sin teléfono'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[22px] font-extrabold">{fmtMoney(saldoCapital)}</div>
            <div className="text-[12px] text-emerald-200/80">
              Saldo pendiente · inicial {fmtMoney(montoInicial)}
              {totalAdicional > 0 && <> + adicional {fmtMoney(totalAdicional)}</>}
              {' '}· {prestamo.tasa_interes}% · {FRECUENCIA_LABEL[prestamo.frecuencia]} · desde {fmtFecha(prestamo.fecha_inicio)}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 flex items-center gap-8 bg-[#f8fafc] border-b border-[#e2e8f0] flex-wrap">
          <div>
            <div className="text-[9px] font-bold text-slate-500 uppercase">Monto inicial</div>
            <div className="text-[14px] font-bold text-[#0f172a]">{fmtMoney(montoInicial)}</div>
          </div>
          {totalAdicional > 0 && (
            <div>
              <div className="text-[9px] font-bold text-purple-700 uppercase">Adicional</div>
              <div className="text-[14px] font-bold text-purple-700">{fmtMoney(totalAdicional)}</div>
            </div>
          )}
          <div>
            <div className="text-[9px] font-bold text-emerald-700 uppercase">Total cobrado</div>
            <div className="text-[14px] font-bold text-emerald-700">{fmtMoney(totalPagado)}</div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-sky-700 uppercase">Abonado a capital</div>
            <div className="text-[14px] font-bold text-sky-700">{fmtMoney(totalAbonoCapital)}</div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-red-600 uppercase">Saldo pendiente (capital)</div>
            <div className="text-[14px] font-bold text-red-600">{fmtMoney(saldoCapital)}</div>
          </div>
        </div>

        {cuotas.some(puedeCapitalizar) && (
          <div className="px-5 py-3 bg-purple-50 border-y border-purple-200 flex items-center justify-between flex-wrap gap-2">
            <span className="text-[12px] text-purple-900">
              Hay interés vencido sin pagar. Tú decides si se suma al capital.
            </span>
            <button onClick={capitalizarVencido} className="px-3 py-1.5 rounded-md bg-purple-600 text-white text-[12px] font-bold hover:bg-purple-700">
              🔄 Capitalizar interés vencido
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#f1f5f9] border-b-2 border-[#e2e8f0]">
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">#</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-slate-500">Vencimiento</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Saldo</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Interés</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Capital</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Cuota</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Pagado</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Estado</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Acción</th>
              </tr>
            </thead>
            <tbody>
              {[...cuotas].reverse().map((c, i) => (
                <tr key={c.id} className={`border-b border-[#f1f5f9] ${i % 2 === 0 ? '' : 'bg-[#f8fafc]'}`}>
                  <td className="px-4 py-2.5 text-center font-mono text-slate-500 whitespace-nowrap">{etiquetaCuota(c)}</td>
                  <td className="px-4 py-2.5">{fmtFecha(c.fecha_vencimiento)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(c.saldo_capital)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(c.interes)}</td>
                  <td className="px-4 py-2.5 text-right">{capitalPagado(c) > 0 ? fmtMoney(capitalPagado(c)) : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-[#0f172a]">
                    {fmtMoney(totalCuota(c))}
                    {recargoCuota(c) > 0 && <span className="block text-[10px] font-semibold text-purple-700">incl. recargo {fmtMoney(recargoCuota(c))}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-700">{c.monto_pagado > 0 ? fmtMoney(c.monto_pagado) : '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${ESTADO_CUOTA_STYLE[c.estado]}`}>
                      {ESTADO_CUOTA_LABEL[c.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {c.estado !== 'pagada' && c.estado !== 'capitalizada' && (
                      <button onClick={() => abrirPago(c)} className="px-3 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700">
                        💰 Cobrar
                      </button>
                    )}
                    {puedeCapitalizar(c) && (
                      <button onClick={() => capitalizar(c)} className="ml-1.5 px-3 py-1 rounded-md bg-purple-600 text-white text-[11px] font-bold hover:bg-purple-700">
                        🔄 Capitalizar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#f8fafc] border-t-2 border-[#e2e8f0] font-extrabold">
                <td className="px-4 py-2.5 text-[#0f172a]" colSpan={3}>TOTAL</td>
                <td className="px-4 py-2.5 text-right text-amber-700">{fmtMoney(cuotasVigentes.reduce((s, c) => s + Number(c.interes), 0))}</td>
                <td className="px-4 py-2.5 text-right text-sky-700">{fmtMoney(totalAbonoCapital)}</td>
                <td className="px-4 py-2.5 text-right text-[#0f172a]">{fmtMoney(cuotasVigentes.reduce((s, c) => s + totalCuota(c), 0))}</td>
                <td className="px-4 py-2.5 text-right text-emerald-700">{fmtMoney(totalPagado)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
        <div className="text-[14px] font-bold text-[#0f172a] mb-3">Historial de desembolsos (préstamos sumados)</div>
        {desembolsos.length === 0 ? (
          <div className="text-[13px] text-slate-400 py-4 text-center">Sin desembolsos registrados.</div>
        ) : (
          <div className="space-y-2">
            {desembolsos.map(d => {
              const prorrateo = prorrateoDesembolso(d)
              return (
              <div key={d.id} className="flex items-center justify-between text-[13px] border-b border-[#f1f5f9] pb-2 last:border-0">
                <span className="text-slate-500">
                  {fmtFecha(d.fecha)}{d.notas ? ` · ${d.notas}` : ''}
                  {prorrateo && (
                    <span className="block text-[11px] text-emerald-700">
                      Prorrateado {prorrateo.diasStub}/{prorrateo.diasPeriodo} días · interés {fmtMoney(prorrateo.interes)}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  {esCapitalizacion(d) && (
                    <button onClick={() => deshacerCapitalizacion(d)} className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-red-50 border border-slate-200 text-slate-600 hover:text-red-700 text-[11px] font-bold">
                      ↩ Deshacer
                    </button>
                  )}
                  <span className="font-bold text-[#0f172a]">{fmtMoney(d.monto)}</span>
                </span>
              </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-5">
        <div className="text-[14px] font-bold text-[#0f172a] mb-3">Historial de pagos</div>
        {pagos.length === 0 ? (
          <div className="text-[13px] text-slate-400 py-4 text-center">Sin pagos registrados aún.</div>
        ) : (
          <div className="space-y-2">
            {pagos.map(p => (
              <div key={p.id} className="flex items-center justify-between text-[13px] border-b border-[#f1f5f9] pb-2 last:border-0">
                <span className="text-slate-500">{fmtFecha(p.fecha)} · <span className="capitalize">{p.tipo}</span> · {FORMA_PAGO_LABEL[p.forma_pago]}</span>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-emerald-700">{fmtMoney(p.monto)}</span>
                  <Link href={`/dashboard/recibo/${p.id}`} className="text-[#0369a1] hover:underline text-[12px] font-semibold">🧾 Recibo</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && cuotaSel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && cerrarModal()}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-slideUp">
            <div className="bg-gradient-to-r from-[#0f172a] to-[#059669] px-6 py-4 flex items-center justify-between">
              <span className="text-white font-bold text-[15px]">💰 Registrar Pago — Cuota {etiquetaCuota(cuotaSel)}</span>
              <button onClick={cerrarModal} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <CuotasAPagar cuotas={cuotas} monto={parseFloat(montoPago) || 0} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Monto a pagar</label>
                  <input type="text" inputMode="decimal" autoFocus value={montoPago} onChange={e => setMontoPago(soloDecimal(e.target.value))}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[14px] font-bold outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Fecha</label>
                  <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Forma de cobro</label>
                <select value={formaPago} onChange={e => setFormaPago(e.target.value as FormaPago)}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400 bg-white">
                  <option value="yappy">Yappy</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>
              <p className="text-[11px] text-slate-400">El monto se reparte desde la cuota más antigua. Si sobra después de la última, el excedente se abona a capital y reduce el interés de las próximas cuotas.</p>
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

      {modalEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={e => e.target === e.currentTarget && cerrarEditar()}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slideUp">
            <div className="bg-gradient-to-r from-[#0f172a] to-[#059669] px-6 py-4 flex items-center justify-between">
              <span className="text-white font-bold text-[15px]">✏️ Editar Préstamo — {prestamo.cliente.nombre} {prestamo.cliente.apellido}</span>
              <button onClick={cerrarEditar} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Monto</label>
                  <input type="text" inputMode="decimal" value={editForm.monto} onChange={e => setEditForm(prev => ({ ...prev, monto: soloDecimal(e.target.value) }))}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Tasa de interés (%)</label>
                  <input type="text" inputMode="decimal" value={editForm.tasa_interes} onChange={e => setEditForm(prev => ({ ...prev, tasa_interes: soloDecimal(e.target.value) }))}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Frecuencia</label>
                  <select value={editForm.frecuencia} onChange={e => setEditForm(prev => ({ ...prev, frecuencia: e.target.value as Frecuencia }))}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400">
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Fecha de inicio</label>
                  <input type="date" value={editForm.fecha_inicio} onChange={e => setEditForm(prev => ({ ...prev, fecha_inicio: e.target.value }))}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Nota (opcional)</label>
                <input value={editForm.notas} onChange={e => setEditForm(prev => ({ ...prev, notas: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
              </div>
              <label className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 cursor-pointer">
                <input type="checkbox" checked={editForm.carga_historica} onChange={e => setEditForm(prev => ({ ...prev, carga_historica: e.target.checked }))}
                  className="mt-0.5" />
                <span className="text-[12px] text-amber-800">
                  <b>Carga histórica</b> — pausa el cálculo de mora/capitalización mientras registras pagos pasados.
                </span>
              </label>
              <label className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 cursor-pointer">
                <input type="checkbox" checked={editForm.sin_prorrateo} onChange={e => setEditForm(prev => ({ ...prev, sin_prorrateo: e.target.checked }))}
                  className="mt-0.5" />
                <span className="text-[12px] text-blue-800">
                  <b>Sin prorrateo</b> — cobra el interés completo del período aunque el préstamo arranque a mitad de ciclo (la cuota abierta se recalcula sola al guardar).
                </span>
              </label>
              <p className="text-[11px] text-slate-400">Esto solo cambia los datos del préstamo. Las cuotas ya generadas no se recalculan automáticamente (excepto el interés de la próxima cuota abierta, que sí se ajusta según &quot;Sin prorrateo&quot;).</p>
              <div className="flex justify-end gap-2.5 pt-2">
                <button onClick={cerrarEditar} className="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[13px] font-semibold">Cancelar</button>
                <button onClick={guardarEdicion} disabled={savingEdit} className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold disabled:opacity-60">
                  {savingEdit ? '⏳ Guardando…' : '💾 Actualizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalDesem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && cerrarDesembolso()}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-slideUp">
            <div className="bg-gradient-to-r from-[#0f172a] to-[#059669] px-6 py-4 flex items-center justify-between">
              <span className="text-white font-bold text-[15px]">➕ Prestar más</span>
              <button onClick={cerrarDesembolso} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-[12px] text-slate-500">El monto se suma al capital de este préstamo y queda registrado en el historial de desembolsos, sin crear un préstamo aparte.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Monto adicional</label>
                  <input type="text" inputMode="decimal" autoFocus value={montoDesem} onChange={e => setMontoDesem(soloDecimal(e.target.value))}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[14px] font-bold outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Fecha</label>
                  <input type="date" value={fechaDesem} onChange={e => setFechaDesem(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Nota (opcional)</label>
                <input value={notasDesem} onChange={e => setNotasDesem(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button onClick={cerrarDesembolso} className="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[13px] font-semibold">Cancelar</button>
                <button onClick={registrarDesembolso} disabled={savingDesem} className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold disabled:opacity-60">
                  {savingDesem ? '⏳ Guardando…' : '💾 Registrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
