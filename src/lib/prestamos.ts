import type { SupabaseClient } from '@supabase/supabase-js'
import type { Frecuencia, FormaPago } from '@/types'

export const FORMA_PAGO_LABEL: Record<FormaPago, string> = { yappy: 'Yappy', efectivo: 'Efectivo', transferencia: 'Transferencia' }

export const fmtMoney = (v: number | null | undefined) =>
  'B/. ' + Number(v || 0).toLocaleString('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

/** Normaliza un teléfono local a formato internacional (Panamá +507) para enlaces wa.me. */
export function telefonoWhatsapp(tel: string | null | undefined): string {
  const digitos = (tel || '').replace(/\D/g, '')
  if (!digitos) return ''
  return digitos.length <= 8 ? '507' + digitos : digitos
}
/** Filtra texto a solo dígitos y un punto decimal, para inputs de dinero/tasa sin usar type="number". */
export const soloDecimal = (v: string): string => {
  const limpio = v.replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  return partes.length > 2 ? partes[0] + '.' + partes.slice(1).join('') : limpio
}

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

/**
 * La quincena real panameña no son 15 dias fijos: es 1-15 y 16-fin de mes,
 * y el segundo tramo tiene 13 a 16 dias segun el mes. Sumar 15 dias a secas
 * (como hace addDias) hace que la fecha se atrase cada vez que el tramo
 * 16-fin de mes tiene mas de 15 dias (p. ej. julio, con 31 dias).
 */
function siguienteQuincena(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00')
  // Fecha a mitad de la primera mitad (p. ej. un prestamo que arranca el dia 4):
  // el siguiente limite es el 15 del mismo mes, no el 15 del mes que sigue.
  if (d.getDate() < 15) {
    const quince = new Date(d.getFullYear(), d.getMonth(), 15)
    return quince.toISOString().slice(0, 10)
  }
  if (d.getDate() === 15) {
    const finDeMes = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return finDeMes.toISOString().slice(0, 10)
  }
  const quinceSiguiente = new Date(d.getFullYear(), d.getMonth() + 1, 15)
  return quinceSiguiente.toISOString().slice(0, 10)
}

function anteriorQuincena(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00')
  // Vencimiento el 15 -> el periodo (1-15) arranco el 1 del mismo mes.
  if (d.getDate() <= 15) {
    const primero = new Date(d.getFullYear(), d.getMonth(), 1)
    return primero.toISOString().slice(0, 10)
  }
  // Vencimiento fin de mes -> el periodo (16-fin) arranco el 16 del mismo mes.
  const dieciseis = new Date(d.getFullYear(), d.getMonth(), 16)
  return dieciseis.toISOString().slice(0, 10)
}

/** Siguiente fecha de vencimiento segun la frecuencia (la quincenal usa el calendario real, no +15 dias). */
export function siguienteVencimiento(frecuencia: Frecuencia, fecha: string): string {
  return frecuencia === 'quincenal' ? siguienteQuincena(fecha) : addDias(fecha, DIAS_FRECUENCIA[frecuencia])
}

/** Inicio del periodo cuyo vencimiento es `fecha`, segun la frecuencia. */
export function anteriorVencimiento(frecuencia: Frecuencia, fecha: string): string {
  return frecuencia === 'quincenal' ? anteriorQuincena(fecha) : addDias(fecha, -DIAS_FRECUENCIA[frecuencia])
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

/** Días calendario entre dos fechas ISO (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 86_400_000)
}

/** Interés de un monto de capital que solo estuvo activo `diasStub` de los `diasPeriodo` del ciclo. */
export function interesProrrateado(monto: number, tasaInteres: number, diasStub: number, diasPeriodo: number): number {
  return Math.round(monto * (tasaInteres / 100) * (diasStub / diasPeriodo) * 100) / 100
}

/**
 * Primera cuota al crear el préstamo: interés sobre el capital inicial.
 * Si se pasa `primerVencimiento` y cae antes del período completo (préstamo
 * desembolsado a mitad de ciclo, p. ej. inicio 25 con vencimiento el 30 para
 * alinearlo con la quincena de otro préstamo), el interés de esa primera cuota
 * se prorratea por días: capital × tasa% × (días_stub / días_período).
 * El capital no cambia por el prorrateo, solo el interés de ese primer tramo.
 */
export function primeraCuota(
  monto: number, tasaInteres: number, frecuencia: Frecuencia, fechaInicio: string,
  primerVencimiento?: string | null,
): CuotaNueva {
  const vence = primerVencimiento || siguienteVencimiento(frecuencia, fechaInicio)
  const diasPeriodo = diasEntre(anteriorVencimiento(frecuencia, vence), vence)
  const diasStub = diasEntre(fechaInicio, vence)
  const esProrrateo = diasStub > 0 && diasStub < diasPeriodo

  if (!esProrrateo) return cuota(1, vence, monto, tasaInteres)

  const interes = interesProrrateado(monto, tasaInteres, diasStub, diasPeriodo)
  return {
    numero: 1, fecha_vencimiento: vence, capital: 0, interes,
    monto_cuota: interes, monto_pagado: 0, saldo_capital: monto, estado: 'pendiente',
  }
}

/**
 * Genera las cuotas que falten hasta hoy (una por cada periodo vencido desde
 * la última cuota existente) más la próxima cuota que aún no vence, para que
 * el cobrador vea con anticipación lo que toca la siguiente quincena.
 * El préstamo no tiene plazo fijo: sigue sumando cuotas cada periodo hasta
 * que el cliente cancele el capital con abonos.
 */
export function cuotasFaltantesHastaHoy(
  frecuencia: Frecuencia, tasaInteres: number, saldoCapital: number,
  ultimoNumero: number, ultimaFechaVencimiento: string,
): CuotaNueva[] {
  if (saldoCapital <= 0) return []
  const hoy = new Date().toISOString().slice(0, 10)
  // Ya hay una cuota futura generada (la próxima por venir): no crear otra encima.
  if (ultimaFechaVencimiento > hoy) return []
  const nuevas: CuotaNueva[] = []
  let numero = ultimoNumero
  let fecha = ultimaFechaVencimiento
  while (true) {
    const siguiente = siguienteVencimiento(frecuencia, fecha)
    numero += 1
    fecha = siguiente
    nuevas.push(cuota(numero, fecha, saldoCapital, tasaInteres))
    if (siguiente > hoy) break
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
export async function reconciliarPrestamosVencidos(supabase: SupabaseClient<any, any, any>, prestamoId?: number) {
  const hoy = new Date().toISOString().slice(0, 10)
  const limiteCapitalizacion = addDias(hoy, -DIAS_GRACIA_CAPITALIZACION)

  let query = supabase.from('prestamos').select('id,monto,tasa_interes,frecuencia,estado,carga_historica,fecha_inicio').in('estado', ['activo', 'en_mora'])
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
    // En modo "carga histórica" (préstamos viejos que se están registrando
    // ahora, ya pagados a tiempo en su momento) se omite: la mora/capitalización
    // solo debe calcularse desde hoy en adelante, una vez el usuario termine
    // de registrar los pagos pasados y desactive el modo.
    const paraCapitalizar = p.carga_historica ? [] : cuotasIniciales.filter((c: any) =>
      (c.estado === 'pendiente' || c.estado === 'atrasada' || c.estado === 'parcial') && c.fecha_vencimiento <= limiteCapitalizacion
    )
    for (const c of paraCapitalizar) {
      await supabase.rpc('fn_capitalizar_cuota', { p_cuota_id: c.id })
    }

    // A partir de aquí se relee todo en frío: no se reutiliza nada calculado
    // antes de la capitalización, para no arrastrar estados que hayan cambiado.
    const [{ data: prestamoFresh }, { data: cuotasList }, { data: desembolsosList }] = await Promise.all([
      supabase.from('prestamos').select('monto').eq('id', p.id).single(),
      supabase.from('cuotas').select('*').eq('prestamo_id', p.id).order('numero'),
      supabase.from('desembolsos').select('monto,fecha').eq('prestamo_id', p.id),
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
    // La cuota mas proxima a vencer prorratea por dias los desembolsos que caigan
    // dentro de su propio periodo (capital que no estuvo activo el periodo completo);
    // el resto del saldo de esa cuota, y las demas cuotas abiertas, llevan interes
    // de periodo completo como siempre.
    const abiertas = cuotasList.filter((c: any) => c.estado === 'pendiente' || c.estado === 'atrasada')
    const tasa = p.tasa_interes / 100
    const [proxima, ...resto] = abiertas
    if (proxima) {
      const inicioPeriodo = anteriorVencimiento(p.frecuencia as Frecuencia, proxima.fecha_vencimiento)
      const diasPeriodo = diasEntre(inicioPeriodo, proxima.fecha_vencimiento)
      const desembolsosPeriodo = (desembolsosList || []).filter((d: any) => d.fecha > inicioPeriodo && d.fecha <= proxima.fecha_vencimiento)
      const totalDesembolsosPeriodo = desembolsosPeriodo.reduce((s: number, d: any) => s + Number(d.monto), 0)
      const saldoBase = Math.round((saldo - totalDesembolsosPeriodo) * 100) / 100
      let nuevoInteres = Math.round(saldoBase * tasa * 100) / 100
      for (const d of desembolsosPeriodo) {
        const diasStub = Math.max(0, Math.min(diasPeriodo, diasEntre(d.fecha, proxima.fecha_vencimiento)))
        nuevoInteres = Math.round((nuevoInteres + interesProrrateado(Number(d.monto), p.tasa_interes, diasStub, diasPeriodo)) * 100) / 100
      }
      // La cuota #1 no tiene su capital inicial en `desembolsos` (ese es el monto
      // del prestamo en si): si el prestamo arranco a mitad del periodo de su
      // propia primera cuota, se prorratea igual que hace primeraCuota() al crearlo.
      if (proxima.numero === 1 && p.fecha_inicio > inicioPeriodo) {
        const diasStubInicial = Math.max(0, Math.min(diasPeriodo, diasEntre(p.fecha_inicio, proxima.fecha_vencimiento)))
        if (diasStubInicial > 0 && diasStubInicial < diasPeriodo) {
          nuevoInteres = interesProrrateado(saldoBase, p.tasa_interes, diasStubInicial, diasPeriodo)
        }
      }
      if (nuevoInteres !== proxima.interes) {
        await supabase.from('cuotas').update({
          interes: nuevoInteres, capital: 0, monto_cuota: nuevoInteres, saldo_capital: saldo,
        }).eq('id', proxima.id).in('estado', ['pendiente', 'atrasada'])
      }
    }
    for (const c of resto) {
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
        ...c, prestamo_id: p.id, estado: !p.carga_historica && c.fecha_vencimiento < hoy ? 'atrasada' : 'pendiente',
      })))
    }

    // 4) Marcar atrasadas las pendientes vencidas (aún dentro de los días de gracia).
    // Se omite en carga histórica: esas cuotas viejas no estaban realmente atrasadas.
    const vencidas = p.carga_historica ? [] : abiertas.filter((c: any) => c.estado === 'pendiente' && c.fecha_vencimiento < hoy)
    if (vencidas.length) {
      await supabase.from('cuotas').update({ estado: 'atrasada' }).in('id', vencidas.map((c: any) => c.id)).eq('estado', 'pendiente')
    }

    if (!p.carga_historica && (nuevas.some(n => n.fecha_vencimiento < hoy) || vencidas.length || monto !== p.monto) && p.estado === 'activo') {
      await supabase.from('prestamos').update({ estado: 'en_mora' }).eq('id', p.id).eq('estado', 'activo')
    }
  }
}
