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
