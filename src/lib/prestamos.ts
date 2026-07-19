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

export function addDias(fecha: string, dias: number): string {
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

/** Días de gracia tras el vencimiento antes de capitalizar el interés no pagado al capital. */
export const DIAS_GRACIA_CAPITALIZACION = 2

/**
 * Recorre los préstamos activos/en mora (o uno solo si se pasa prestamoId) y:
 * 1. Capitaliza al capital el interés de cuotas vencidas hace 2+ días sin pagar
 *    (se registra como un desembolso con nota, y la cuota queda "capitalizada").
 * 2. Recalcula el interés de las cuotas abiertas restantes sobre el saldo resultante.
 * 3. Genera las cuotas que falten hasta hoy.
 * 4. Marca como atrasada la que venció sin pagar (aún dentro de los días de gracia).
 * 5. Cierra el préstamo si ya no debe capital.
 *
 * Debe llamarse antes de mostrar listados que crucen varios préstamos (Cobros,
 * Reportes, Inicio) o el detalle de un préstamo, para que el estado no dependa
 * de haber visitado cada préstamo individualmente.
 */
export async function reconciliarPrestamosVencidos(supabase: SupabaseClient, prestamoId?: number) {
  const hoy = new Date().toISOString().slice(0, 10)
  const limiteCapitalizacion = addDias(hoy, -DIAS_GRACIA_CAPITALIZACION)

  let query = supabase.from('prestamos').select('id,monto,tasa_interes,frecuencia,estado').in('estado', ['activo', 'en_mora'])
  if (prestamoId) query = query.eq('id', prestamoId)
  const { data: prestamosList } = await query
  if (!prestamosList?.length) return

  for (const p of prestamosList as any[]) {
    const { data: cuotasIniciales } = await supabase.from('cuotas').select('*').eq('prestamo_id', p.id).order('numero')
    if (!cuotasIniciales?.length) continue

    // 1) Capitalizar el interés no pagado de cuotas vencidas hace 2+ días.
    // Todo el trabajo (reclamar la cuota, registrar el desembolso, sumar el
    // capital) ocurre en una sola transacción de Postgres (fn_capitalizar_cuota),
    // así que dos cargas concurrentes (p. ej. React StrictMode, u otra pestaña)
    // no pueden duplicar el desembolso ni perder el aumento de capital.
    const paraCapitalizar = cuotasIniciales.filter((c: any) =>
      (c.estado === 'pendiente' || c.estado === 'atrasada' || c.estado === 'parcial') && c.fecha_vencimiento <= limiteCapitalizacion
    )
    for (const c of paraCapitalizar) {
      await supabase.rpc('fn_capitalizar_cuota', { p_cuota_id: c.id })
    }

    // A partir de aquí se relee todo en frío: no se reutiliza nada calculado
    // antes de la capitalización, para no arrastrar estados que hayan cambiado.
    const [{ data: prestamoFresh }, { data: cuotasList }] = await Promise.all([
      supabase.from('prestamos').select('monto').eq('id', p.id).single(),
      supabase.from('cuotas').select('*').eq('prestamo_id', p.id).order('numero'),
    ])
    if (!cuotasList?.length) continue
    const monto = (prestamoFresh as any)?.monto ?? p.monto

    const capitalPagado = cuotasList.reduce((s: number, c: any) => s + Math.max(0, c.monto_pagado - c.interes), 0)
    const saldo = Math.max(0, Math.round((monto - capitalPagado) * 100) / 100)

    if (saldo <= 0) {
      await supabase.from('prestamos').update({ estado: 'pagado' }).eq('id', p.id)
      continue
    }

    // 2) Recalcular interés de las cuotas abiertas restantes sobre el saldo vigente
    // (por si cambió, ya sea por la capitalización de arriba o por otro proceso).
    const abiertas = cuotasList.filter((c: any) => c.estado === 'pendiente' || c.estado === 'atrasada')
    const tasa = p.tasa_interes / 100
    for (const c of abiertas) {
      const nuevoInteres = Math.round(saldo * tasa * 100) / 100
      if (nuevoInteres === c.interes) continue
      await supabase.from('cuotas').update({
        interes: nuevoInteres, capital: 0, monto_cuota: nuevoInteres, saldo_capital: saldo,
      }).eq('id', c.id).in('estado', ['pendiente', 'atrasada'])
    }

    // 3) Generar las cuotas que falten hasta hoy sobre el saldo vigente.
    const ultima = cuotasList.reduce((max: any, c: any) => c.numero > max.numero ? c : max, cuotasList[0])
    const nuevas = cuotasFaltantesHastaHoy(p.frecuencia, p.tasa_interes, saldo, ultima.numero, ultima.fecha_vencimiento)
    if (nuevas.length) {
      await supabase.from('cuotas').insert(nuevas.map(c => ({
        ...c, prestamo_id: p.id, estado: c.fecha_vencimiento < hoy ? 'atrasada' : 'pendiente',
      })))
    }

    // 4) Marcar atrasadas las pendientes vencidas (aún dentro de los días de gracia).
    const vencidas = abiertas.filter((c: any) => c.estado === 'pendiente' && c.fecha_vencimiento < hoy)
    if (vencidas.length) {
      await supabase.from('cuotas').update({ estado: 'atrasada' }).in('id', vencidas.map((c: any) => c.id)).eq('estado', 'pendiente')
    }

    if ((nuevas.some(n => n.fecha_vencimiento < hoy) || vencidas.length || monto !== p.monto) && p.estado === 'activo') {
      await supabase.from('prestamos').update({ estado: 'en_mora' }).eq('id', p.id).eq('estado', 'activo')
    }
  }
}
