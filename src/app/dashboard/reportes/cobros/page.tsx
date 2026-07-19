'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { fmtMoney, fmtFecha } from '@/lib/prestamos'
import type { Cliente } from '@/types'

interface PagoRow {
  id: number
  monto: number
  fecha: string
  tipo: string
  cuota: { numero: number; prestamo: { id: number; cliente_id: number; cliente: { nombre: string; apellido: string | null } } }
}

function primerDiaMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
const HOY = new Date().toISOString().slice(0, 10)

export default function ReporteCobrosPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pagos, setPagos] = useState<PagoRow[]>([])
  const [loading, setLoading] = useState(true)

  const [clienteId, setClienteId] = useState('')
  const [fecDes, setFecDes] = useState(primerDiaMes())
  const [fecHas, setFecHas] = useState(HOY)

  useEffect(() => {
    supabase.from('clientes').select('*').order('nombre').then(({ data }) => setClientes((data || []) as Cliente[]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('pagos')
      .select('id,monto,fecha,tipo,cuota:cuotas(numero,prestamo:prestamos(id,cliente_id,cliente:clientes(nombre,apellido)))')
      .gte('fecha', fecDes)
      .lte('fecha', fecHas)
      .order('fecha', { ascending: false })
    const { data, error } = await q
    setLoading(false)
    if (error) { toast.error(error.message); return }
    setPagos((data || []) as any)
  }, [fecDes, fecHas])

  useEffect(() => { load() }, [load])

  const filtrados = useMemo(
    () => clienteId ? pagos.filter(p => p.cuota.prestamo.cliente_id === parseInt(clienteId)) : pagos,
    [pagos, clienteId],
  )

  const porCliente = useMemo(() => {
    const grupos = new Map<number, { nombre: string; prestamoId: number; pagos: PagoRow[]; total: number }>()
    for (const p of filtrados) {
      const cid = p.cuota.prestamo.cliente_id
      if (!grupos.has(cid)) {
        grupos.set(cid, {
          nombre: `${p.cuota.prestamo.cliente.nombre} ${p.cuota.prestamo.cliente.apellido ?? ''}`.trim(),
          prestamoId: p.cuota.prestamo.id,
          pagos: [], total: 0,
        })
      }
      const g = grupos.get(cid)!
      g.pagos.push(p)
      g.total += Number(p.monto)
    }
    return [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [filtrados])

  const totalGeneral = filtrados.reduce((s, p) => s + Number(p.monto), 0)

  return (
    <div className="space-y-4 animate-fadeIn">
      <div>
        <p className="text-[12px] text-slate-500 mb-0.5">Reportes / Cobros</p>
        <h1 className="text-2xl font-bold text-[#0f172a]">Cobros por Cliente y Fecha</h1>
        <p className="text-[14px] text-slate-500 mt-0.5">Pagos registrados en el rango seleccionado</p>
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 grid grid-cols-1 sm:grid-cols-[1fr_160px_160px] gap-3 items-end">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cliente</label>
          <select value={clienteId} onChange={e => setClienteId(e.target.value)}
            className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400 bg-white">
            <option value="">— Todos los clientes —</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Desde</label>
          <input type="date" value={fecDes} onChange={e => setFecDes(e.target.value)}
            className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Hasta</label>
          <input type="date" value={fecHas} onChange={e => setFecHas(e.target.value)}
            className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gradient-to-r from-[#0f172a] to-[#059669] text-white flex items-center justify-between">
          <span className="font-bold text-[14px]">💰 Cobros ({fmtFecha(fecDes)} al {fmtFecha(fecHas)})</span>
          <span className="font-extrabold text-[16px]">{fmtMoney(totalGeneral)}</span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-400 text-[13px]">Cargando…</div>
        ) : porCliente.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-[13px]">Sin cobros en este rango.</div>
        ) : (
          <div className="divide-y divide-[#f1f5f9]">
            {porCliente.map(g => (
              <div key={g.nombre + g.prestamoId}>
                <div className="px-5 py-2.5 bg-[#f8fafc] flex items-center justify-between">
                  <Link href={`/dashboard/prestamos/${g.prestamoId}`} className="font-bold text-[#0369a1] hover:underline text-[13px]">
                    {g.nombre}
                  </Link>
                  <span className="font-bold text-emerald-700 text-[13px]">{fmtMoney(g.total)}</span>
                </div>
                <table className="w-full border-collapse text-[13px]">
                  <tbody>
                    {g.pagos.map(p => (
                      <tr key={p.id} className="border-b border-[#f1f5f9] last:border-0">
                        <td className="px-5 py-2 text-slate-500 w-32">{fmtFecha(p.fecha)}</td>
                        <td className="px-4 py-2 text-slate-500">Cuota #{p.cuota.numero}</td>
                        <td className="px-4 py-2 text-slate-500 capitalize">{p.tipo}</td>
                        <td className="px-4 py-2 text-right font-semibold text-[#0f172a] w-28">{fmtMoney(p.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
