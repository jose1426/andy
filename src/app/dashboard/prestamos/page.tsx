'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { fmtMoney, fmtFecha, generarCuotas, FRECUENCIA_LABEL } from '@/lib/prestamos'
import type { Cliente, Prestamo, Frecuencia } from '@/types'

const ESTADO_STYLE: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  pagado: 'bg-slate-100 text-slate-600 border-slate-300',
  en_mora: 'bg-red-100 text-red-800 border-red-300',
  cancelado: 'bg-amber-100 text-amber-800 border-amber-300',
}
const ESTADO_LABEL: Record<string, string> = {
  activo: 'Activo', pagado: 'Pagado', en_mora: 'En Mora', cancelado: 'Cancelado',
}

function emptyForm() {
  return {
    cliente_id: '', monto: '', tasa_interes: '', frecuencia: 'quincenal' as Frecuencia,
    num_cuotas: '4', fecha_inicio: new Date().toISOString().slice(0, 10), notas: '',
  }
}

export default function PrestamosPage() {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm())

  const load = useCallback(async () => {
    setLoading(true)
    const [presRes, cliRes] = await Promise.all([
      supabase.from('prestamos_prestamos').select('*, cliente:prestamos_clientes(*)').order('created_at', { ascending: false }),
      supabase.from('prestamos_clientes').select('*').eq('activo', true).order('nombre'),
    ])
    setLoading(false)
    if (presRes.error) { toast.error(presRes.error.message); return }
    setPrestamos((presRes.data || []) as any)
    setClientes((cliRes.data || []) as Cliente[])
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = prestamos.filter(p => {
    const txt = `${p.cliente?.nombre ?? ''} ${p.cliente?.apellido ?? ''} ${p.cliente?.cedula ?? ''}`.toLowerCase()
    return !search || txt.includes(search.toLowerCase())
  })

  const openNew = () => { setForm(emptyForm()); setModal(true) }
  const closeModal = () => setModal(false)
  const f = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) => setForm(prev => ({ ...prev, [k]: v }))

  const save = async () => {
    const monto = parseFloat(form.monto)
    const tasa = parseFloat(form.tasa_interes)
    const numCuotas = parseInt(form.num_cuotas)
    if (!form.cliente_id) { toast.error('Seleccione un cliente.'); return }
    if (!monto || monto <= 0) { toast.error('Ingrese un monto válido.'); return }
    if (!tasa || tasa <= 0) { toast.error('Ingrese una tasa de interés válida.'); return }
    if (!numCuotas || numCuotas <= 0) { toast.error('Ingrese el número de cuotas.'); return }

    setSaving(true)
    try {
      const { data: prestamo, error } = await supabase.from('prestamos_prestamos').insert({
        cliente_id: parseInt(form.cliente_id),
        monto, tasa_interes: tasa, frecuencia: form.frecuencia,
        num_cuotas: numCuotas, fecha_inicio: form.fecha_inicio,
        notas: form.notas || null, estado: 'activo',
      }).select().single()
      if (error) throw error

      const cuotas = generarCuotas(monto, tasa, form.frecuencia, numCuotas, form.fecha_inicio)
      const { error: errCuotas } = await supabase.from('prestamos_cuotas').insert(
        cuotas.map(c => ({ ...c, prestamo_id: prestamo.id }))
      )
      if (errCuotas) throw errCuotas

      toast.success('Préstamo creado con su plan de cuotas.')
      closeModal()
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const interesPeriodo = form.monto && form.tasa_interes
    ? (parseFloat(form.monto) * (parseFloat(form.tasa_interes) / 100)) || 0
    : 0

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a]">Préstamos</h1>
          <p className="text-[14px] text-slate-500 mt-0.5">{prestamos.length} préstamos registrados</p>
        </div>
        <button onClick={openNew} className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold hover:opacity-90 transition-opacity">
          ＋ Nuevo Préstamo
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por cliente…"
          className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400"
        />
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#f1f5f9] border-b-2 border-[#e2e8f0]">
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-slate-500">Cliente</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-slate-500">Monto</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Tasa</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Frecuencia</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Inicio</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">Cargando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">Sin préstamos</td></tr>
              ) : filtered.map((p, i) => (
                <tr key={p.id} className={`border-b border-[#f1f5f9] ${i % 2 === 0 ? '' : 'bg-[#f8fafc]'}`}>
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard/prestamos/${p.id}`} className="font-semibold text-[#0369a1] hover:underline">
                      {p.cliente?.nombre} {p.cliente?.apellido}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-[#0f172a]">{fmtMoney(p.monto)}</td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{p.tasa_interes}%</td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{FRECUENCIA_LABEL[p.frecuencia]}</td>
                  <td className="px-4 py-2.5 text-center text-slate-500">{fmtFecha(p.fecha_inicio)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${ESTADO_STYLE[p.estado]}`}>
                      {ESTADO_LABEL[p.estado]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slideUp">
            <div className="bg-gradient-to-r from-[#0f172a] to-[#059669] px-6 py-4 flex items-center justify-between">
              <span className="text-white font-bold text-[15px]">📄 Nuevo Préstamo</span>
              <button onClick={closeModal} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Cliente</label>
                <select value={form.cliente_id} onChange={e => f('cliente_id', e.target.value)}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400 bg-white">
                  <option value="">— Seleccionar —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido} {c.cedula ? `(${c.cedula})` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Monto prestado</label>
                  <input type="number" step="0.01" min="0" value={form.monto} onChange={e => f('monto', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Tasa de interés (% por periodo)</label>
                  <input type="number" step="0.01" min="0" value={form.tasa_interes} onChange={e => f('tasa_interes', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Frecuencia</label>
                  <select value={form.frecuencia} onChange={e => f('frecuencia', e.target.value as Frecuencia)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400 bg-white">
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1"># de cuotas</label>
                  <input type="number" min="1" value={form.num_cuotas} onChange={e => f('num_cuotas', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Fecha de inicio</label>
                <input type="date" value={form.fecha_inicio} onChange={e => f('fecha_inicio', e.target.value)}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Notas (opcional)</label>
                <input value={form.notas} onChange={e => f('notas', e.target.value)}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
              </div>

              {interesPeriodo > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-[12px] text-emerald-800">
                  Interés estimado por periodo: <b>{fmtMoney(interesPeriodo)}</b> — el capital de {fmtMoney(parseFloat(form.monto) || 0)} vence completo en la última cuota.
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[13px] font-semibold">Cancelar</button>
                <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold disabled:opacity-60">
                  {saving ? '⏳ Creando…' : '💾 Crear Préstamo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
