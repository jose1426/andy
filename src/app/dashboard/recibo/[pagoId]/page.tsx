'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { fmtMoney, fmtFecha, FORMA_PAGO_LABEL, telefonoWhatsapp } from '@/lib/prestamos'
import type { FormaPago } from '@/types'

interface ReciboData {
  id: number
  monto: number
  fecha: string
  tipo: string
  forma_pago: FormaPago
  cuotaNumero: number
  cuotaInteres: number
  prestamoId: number
  prestamoMonto: number
  saldoCapital: number
  clienteNombre: string
  clienteApellido: string | null
  clienteCedula: string | null
  clienteTelefono: string | null
  interesDelCobro: number
  capitalDelCobro: number
}

export default function ReciboPage() {
  const { pagoId } = useParams<{ pagoId: string }>()
  const router = useRouter()
  const [recibo, setRecibo] = useState<ReciboData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: pago, error } = await supabase.from('pagos')
      .select('id,monto,fecha,tipo,forma_pago,cuota_id,prestamo_id,cuota:cuotas(numero,interes),prestamo:prestamos(id,monto,cliente:clientes(nombre,apellido,cedula,telefono))')
      .eq('id', pagoId).single()

    if (error || !pago) { toast.error('Recibo no encontrado.'); router.replace('/dashboard/cobros'); return }

    const p = pago as any

    const [{ data: pagosCuota }, { data: cuotasPrestamo }] = await Promise.all([
      supabase.from('pagos').select('id,monto').eq('cuota_id', p.cuota_id).order('fecha').order('id'),
      supabase.from('cuotas').select('monto_pagado,interes').eq('prestamo_id', p.prestamo_id),
    ])

    let acumulado = 0
    let capitalDelCobro = 0
    for (const pc of pagosCuota || []) {
      const capitalPrevio = Math.max(0, acumulado - p.cuota.interes)
      acumulado += Number(pc.monto)
      const capitalNuevo = Math.max(0, acumulado - p.cuota.interes)
      if (pc.id === p.id) { capitalDelCobro = Math.round((capitalNuevo - capitalPrevio) * 100) / 100; break }
    }
    const interesDelCobro = Math.round((Number(p.monto) - capitalDelCobro) * 100) / 100

    const totalAbonoCapital = (cuotasPrestamo || []).reduce((s: number, c: any) => s + Math.max(0, c.monto_pagado - c.interes), 0)
    const saldoCapital = Math.round((Number(p.prestamo.monto) - totalAbonoCapital) * 100) / 100

    setRecibo({
      id: p.id, monto: Number(p.monto), fecha: p.fecha, tipo: p.tipo, forma_pago: p.forma_pago,
      cuotaNumero: p.cuota.numero, cuotaInteres: p.cuota.interes,
      prestamoId: p.prestamo.id, prestamoMonto: Number(p.prestamo.monto), saldoCapital,
      clienteNombre: p.prestamo.cliente.nombre, clienteApellido: p.prestamo.cliente.apellido,
      clienteCedula: p.prestamo.cliente.cedula, clienteTelefono: p.prestamo.cliente.telefono,
      interesDelCobro, capitalDelCobro,
    })
    setLoading(false)
  }, [pagoId, router])

  useEffect(() => { load() }, [load])

  if (loading || !recibo) {
    return <div className="py-20 text-center text-slate-400">Cargando…</div>
  }

  const nombreCompleto = `${recibo.clienteNombre} ${recibo.clienteApellido ?? ''}`.trim()
  const mensaje =
    `🧾 *Cooperativa Hermandad — Recibo de pago*\n\n` +
    `Cliente: ${nombreCompleto}\n` +
    `Fecha: ${fmtFecha(recibo.fecha)}\n` +
    `Cuota #${recibo.cuotaNumero}\n` +
    `Monto pagado: ${fmtMoney(recibo.monto)}\n` +
    `  · Interés: ${fmtMoney(recibo.interesDelCobro)}\n` +
    `  · Abono a capital: ${fmtMoney(recibo.capitalDelCobro)}\n` +
    `Forma de pago: ${FORMA_PAGO_LABEL[recibo.forma_pago]}\n` +
    `Saldo pendiente: ${fmtMoney(recibo.saldoCapital)}\n\n` +
    `¡Gracias por su pago!`

  const tel = telefonoWhatsapp(recibo.clienteTelefono)
  const linkWhatsapp = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`

  return (
    <div className="space-y-4 animate-fadeIn max-w-lg mx-auto">
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="text-[13px] text-slate-500 hover:text-slate-700 flex items-center gap-1">
          ← Volver
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[12px] font-bold">
            🖨️ Imprimir
          </button>
          <a href={linkWhatsapp} target="_blank" rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold">
            💬 Enviar por WhatsApp
          </a>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-[#0f172a] to-[#059669] text-white text-center">
          <div className="text-[20px] font-extrabold">🤝 Cooperativa Hermandad</div>
          <div className="text-[12px] text-emerald-200/80 mt-0.5">Recibo de pago #{recibo.id}</div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-between text-[13px]">
            <span className="text-slate-500">Cliente</span>
            <span className="font-bold text-[#0f172a]">{nombreCompleto}</span>
          </div>
          {recibo.clienteCedula && (
            <div className="flex justify-between text-[13px]">
              <span className="text-slate-500">Cédula</span>
              <span className="font-semibold text-[#0f172a]">{recibo.clienteCedula}</span>
            </div>
          )}
          <div className="flex justify-between text-[13px]">
            <span className="text-slate-500">Fecha</span>
            <span className="font-semibold text-[#0f172a]">{fmtFecha(recibo.fecha)}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-slate-500">Cuota</span>
            <span className="font-semibold text-[#0f172a]">#{recibo.cuotaNumero}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-slate-500">Forma de pago</span>
            <span className="font-semibold text-[#0f172a]">{FORMA_PAGO_LABEL[recibo.forma_pago]}</span>
          </div>

          <div className="border-t border-dashed border-slate-300 pt-4 space-y-1.5">
            <div className="flex justify-between text-[12px] text-slate-500">
              <span>Interés</span>
              <span>{fmtMoney(recibo.interesDelCobro)}</span>
            </div>
            <div className="flex justify-between text-[12px] text-slate-500">
              <span>Abono a capital</span>
              <span>{fmtMoney(recibo.capitalDelCobro)}</span>
            </div>
            <div className="flex justify-between text-[16px] font-extrabold text-emerald-700 pt-1">
              <span>Total pagado</span>
              <span>{fmtMoney(recibo.monto)}</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex justify-between text-[13px]">
            <span className="text-slate-500">Saldo pendiente</span>
            <span className="font-extrabold text-red-600">{fmtMoney(recibo.saldoCapital)}</span>
          </div>

          <div className="text-center text-[12px] text-slate-400 pt-2">¡Gracias por su pago!</div>
        </div>
      </div>
    </div>
  )
}
