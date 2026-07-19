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

/**
 * Genera el plan de cuotas de un préstamo tipo "bala": interés fijo por periodo
 * sobre el capital pendiente (que no baja mientras no haya abonos a capital),
 * con el capital completo venciendo en la última cuota.
 */
export function generarCuotas(monto: number, tasaInteres: number, frecuencia: Frecuencia, numCuotas: number, fechaInicio: string): CuotaNueva[] {
  const dias = DIAS_FRECUENCIA[frecuencia]
  const interesPeriodo = Math.round(monto * (tasaInteres / 100) * 100) / 100
  const cuotas: CuotaNueva[] = []
  for (let i = 1; i <= numCuotas; i++) {
    const esUltima = i === numCuotas
    const capital = esUltima ? monto : 0
    cuotas.push({
      numero: i,
      fecha_vencimiento: addDias(fechaInicio, dias * i),
      capital,
      interes: interesPeriodo,
      monto_cuota: interesPeriodo + capital,
      monto_pagado: 0,
      saldo_capital: monto,
      estado: 'pendiente',
    })
  }
  return cuotas
}
