'use client'

import { repartirPagoPorAntiguedad, capitalizadasPrevias, fmtMoney, fmtFecha } from '@/lib/prestamos'
import type { Cuota } from '@/types'

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Lista, para el modal de cobro, cada cuota que se debe (incluidas las capitalizadas que se
 * cobran junto a una cuota) y cuánto se aplica a cada grupo con el monto escrito, de la más
 * antigua a la más reciente.
 */
export default function CuotasAPagar({ cuotas, monto }: { cuotas: Cuota[]; monto: number }) {
  const recargoDe = (c: Cuota) => capitalizadasPrevias(cuotas, c.numero)
    .reduce((s, x) => s + r2(Number(x.monto_cuota) - Number(x.monto_pagado)), 0)
  const asignaciones = repartirPagoPorAntiguedad(cuotas, recargoDe, monto)
  const totalDebe = asignaciones.reduce((s, a) => s + a.capacidad, 0)

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-[12px] text-slate-600 space-y-2">
      <div className="text-[10px] font-bold text-slate-500 uppercase">Cuotas a pagar · de la más antigua a la más reciente</div>
      {asignaciones.map(a => {
        const previas = capitalizadasPrevias(cuotas, a.cuota.numero)
        const propia = Math.max(0, r2(Number(a.cuota.monto_cuota) - Number(a.cuota.monto_pagado)))
        return (
          <div key={a.cuota.id} className="rounded-md border border-slate-200 bg-white px-2.5 py-2 space-y-1">
            {previas.map(x => (
              <div key={x.id} className="flex justify-between gap-3 text-purple-700">
                <span>#{x.numero} · {fmtFecha(x.fecha_vencimiento)} · interés capitalizado</span>
                <span className="whitespace-nowrap">debe {fmtMoney(r2(Number(x.monto_cuota) - Number(x.monto_pagado)))}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3">
              <span>#{a.cuota.numero} · {fmtFecha(a.cuota.fecha_vencimiento)} · interés</span>
              <span className="whitespace-nowrap">debe {fmtMoney(propia)}</span>
            </div>
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-1 font-bold">
              <span className="text-slate-500">Se aplica</span>
              <span className={a.aplicar > 0 ? 'text-emerald-700' : 'text-slate-400'}>{fmtMoney(a.aplicar)} de {fmtMoney(a.capacidad)}</span>
            </div>
          </div>
        )
      })}
      <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-red-600">
        <span>Total que debe</span><span>{fmtMoney(totalDebe)}</span>
      </div>
      {asignaciones.some(a => capitalizadasPrevias(cuotas, a.cuota.numero).length > 0) && (
        <p className="text-[10px] text-slate-400">El pago cubre primero el interés de la cuota y lo que sobra va a los intereses capitalizados (abona a capital).</p>
      )}
    </div>
  )
}
