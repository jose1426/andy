import type { SupabaseClient } from '@supabase/supabase-js'
import type { Frecuencia } from '@/types'

export const fmtMoney = (v: number | null | undefined) =>
  'B/. ' + Number(v || 0).toLocaleString('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export const DIAS_FRECUENCIA: Record<Frecuencia, number> = {
  semanal: 7,
  quincenal: 15,
  mensual: 30,
}

export const FRECUENCIA_LABEL: Record<Frecuencia, string> = {
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
}

function addDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export interface CuotaNueva {
  numero: number
  fecha_vencimiento: string
  capital: number
  interes: number
  monto_cuota: number
  monto_pagado: number
  saldo_capital: number
  estado: 'pendiente'
}

function cuota(numero: number, fechaVencimiento: string, saldoCapital: number, tasaInteres: number): CuotaNueva {
  const interes = Math.round(saldoCapital * (tasaInteres / 100) * 100) / 100
  return {
    numero, fecha_vencimiento: fechaVencimiento, capital: 0, interes,
    monto_cuota: interes, monto_pagado: 0, saldo_capital: saldoCapital, estado: 'pendiente',
  }
}

/** Primera cuota al crear el préstamo: interés sobre el capital inicial. */
export function primeraCuota(monto: number, tasaInteres: number, frecuencia: Frecuencia, fechaInicio: string): CuotaNueva {
  return cuota(1, addDias(fechaInicio, DIAS_FRECUENCIA[frecuencia]), monto, tasaInteres)
}

/**
 * Genera las cuotas que falten hasta hoy (una por cada periodo vencido desde
 * la última cuota existente), con interés sobre el saldo de capital vigente.
 * El préstamo no tiene plazo fijo: sigue sumando cuotas cada periodo hasta
 * que el cliente cancele el capital con abonos.
 */
export function cuotasFaltantesHastaHoy(
  frecuencia: Frecuencia, tasaInteres: number, saldoCapital: number,
  ultimoNumero: number, ultimaFechaVencimiento: string,
): CuotaNueva[] {
  if (saldoCapital <= 0) return []
  const dias = DIAS_FRECUENCIA[frecuencia]
  const hoy = new Date().toISOString().slice(0, 10)
  const nuevas: CuotaNueva[] = []
  let numero = ultimoNumero
  let fecha = ultimaFechaVencimiento
  while (true) {
    const siguiente = addDias(fecha, dias)
    if (siguiente > hoy) break
    numero += 1
    fecha = siguiente
    nuevas.push(cuota(numero, fecha, saldoCapital, tasaInteres))
  }
  return nuevas
}

/**
 * Recorre todos los préstamos activos/en mora y les aplica el mismo chequeo que
 * la pantalla de detalle: genera las cuotas vencidas que falten, marca como
 * atrasada la que no se pagó a tiempo, y cierra el préstamo si ya no debe capital.
 * Debe llamarse antes de mostrar listados que crucen varios préstamos (Cobros,
 * Reportes, Inicio) para que el estado de "atrasada" no dependa de haber
 * visitado cada préstamo individualmente.
 */
export async function reconciliarPrestamosVencidos(supabase: SupabaseClient) {
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: prestamosList } = await supabase.from('prestamos')
    .select('id,monto,tasa_interes,frecuencia,estado')
    .in('estado', ['activo', 'en_mora'])
  if (!prestamosList?.length) return

  for (const p of prestamosList as any[]) {
    const { data: cuotasList } = await supabase.from('cuotas').select('*').eq('prestamo_id', p.id).order('numero')
    if (!cuotasList?.length) continue

    const capitalPagado = cuotasList.reduce((s: number, c: any) => s + Math.max(0, c.monto_pagado - c.interes), 0)
    const saldo = Math.max(0, Math.round((p.monto - capitalPagado) * 100) / 100)

    if (saldo <= 0) {
      await supabase.from('prestamos').update({ estado: 'pagado' }).eq('id', p.id)
      continue
    }

    const ultima = cuotasList.reduce((max: any, c: any) => c.numero > max.numero ? c : max, cuotasList[0])
    const nuevas = cuotasFaltantesHastaHoy(p.frecuencia, p.tasa_interes, saldo, ultima.numero, ultima.fecha_vencimiento)
    if (nuevas.length) {
      await supabase.from('cuotas').insert(nuevas.map(c => ({
        ...c, prestamo_id: p.id, estado: c.fecha_vencimiento < hoy ? 'atrasada' : 'pendiente',
      })))
    }

    const vencidas = cuotasList.filter((c: any) => c.estado === 'pendiente' && c.fecha_vencimiento < hoy)
    if (vencidas.length) {
      await supabase.from('cuotas').update({ estado: 'atrasada' }).in('id', vencidas.map((c: any) => c.id))
    }

    if ((nuevas.some(n => n.fecha_vencimiento < hoy) || vencidas.length) && p.estado === 'activo') {
      await supabase.from('prestamos').update({ estado: 'en_mora' }).eq('id', p.id)
    }
  }
}
