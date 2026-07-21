'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { fmtMoney, fmtFecha, telefonoWhatsapp, soloDecimal } from '@/lib/prestamos'
import type { Solicitud, EstadoSolicitud, Frecuencia } from '@/types'

const PERIODO_LABEL: Record<Frecuencia, string> = { semanal: 'semana', quincenal: 'quincena', mensual: 'mes' }

const ESTADO_STYLE: Record<EstadoSolicitud, string> = {
  pendiente: 'bg-amber-100 text-amber-800 border-amber-300',
  aprobada: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rechazada: 'bg-red-100 text-red-800 border-red-300',
}
const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada',
}

function mensajeResultado(s: Solicitud): string {
  const nombreCompleto = `${s.nombre} ${s.apellido ?? ''}`.trim()
  return s.estado === 'aprobada'
    ? `🎉 ¡Buenas noticias, ${nombreCompleto}! Tu solicitud de préstamo${s.monto_solicitado ? ` por ${fmtMoney(s.monto_solicitado)}` : ''} ha sido *aprobada*. Pronto nos pondremos en contacto contigo para los siguientes pasos.`
    : `Hola ${nombreCompleto}, gracias por tu interés. Lamentamos informarte que tu solicitud de préstamo no fue aprobada en esta ocasión.`
}

function linkWhatsappResultado(s: Solicitud): string {
  const tel = telefonoWhatsapp(s.telefono)
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensajeResultado(s))}`
}

function mensajeAprobacionConTerminos(s: Solicitud, monto: number, tasa: number, frecuencia: Frecuencia): string {
  const nombreCompleto = `${s.nombre} ${s.apellido ?? ''}`.trim()
  const periodo = PERIODO_LABEL[frecuencia]
  const cuota = Math.round(monto * (tasa / 100) * 100) / 100
  return `🎉 ¡Buenas noticias, ${nombreCompleto}! Tu solicitud de préstamo fue *aprobada* con estos términos:\n\n` +
    `💰 Monto: ${fmtMoney(monto)}\n` +
    `📈 Interés: ${tasa}% por ${periodo}\n` +
    `💵 Cuota estimada cada ${periodo}: ${fmtMoney(cuota)}\n\n` +
    `¿Estás de acuerdo con estas condiciones? Respóndenos para continuar. 🙌`
}

function emptyForm() {
  return { nombre: '', apellido: '', cedula: '', telefono: '', monto_solicitado: '', referencia: '' }
}

export default function SolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState<number | null>(null)
  const [aprobando, setAprobando] = useState<Solicitud | null>(null)
  const [montoForm, setMontoForm] = useState('')
  const [tasaForm, setTasaForm] = useState('')
  const [frecuenciaForm, setFrecuenciaForm] = useState<Frecuencia>('quincenal')

  const [editRow, setEditRow] = useState<Solicitud | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteRow, setDeleteRow] = useState<Solicitud | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('solicitudes').select('*').order('created_at', { ascending: false })
    setLoading(false)
    if (error) { toast.error(error.message); return }
    setSolicitudes((data || []) as Solicitud[])
  }, [])

  useEffect(() => { load() }, [load])

  const abrirAprobar = (s: Solicitud) => {
    setMontoForm(s.monto_solicitado ? String(s.monto_solicitado) : '')
    setTasaForm('')
    setFrecuenciaForm('quincenal')
    setAprobando(s)
  }

  const confirmarAprobar = async () => {
    const s = aprobando
    if (!s) return
    const monto = parseFloat(montoForm)
    const tasa = parseFloat(tasaForm)
    if (!monto || monto <= 0) { toast.error('Ingrese un monto válido.'); return }
    if (!tasa || tasa <= 0) { toast.error('Ingrese una tasa de interés válida.'); return }

    setProcesando(s.id)
    try {
      const { data: cliente, error: errCli } = await supabase.from('clientes').insert({
        nombre: s.nombre, apellido: s.apellido, cedula: s.cedula, telefono: s.telefono,
        referencia: s.referencia, activo: true,
      }).select().single()
      if (errCli) throw errCli

      const { error: errSol } = await supabase.from('solicitudes')
        .update({ estado: 'aprobada', cliente_id: cliente.id }).eq('id', s.id)
      if (errSol) throw errSol

      if (s.telefono) {
        const tel = telefonoWhatsapp(s.telefono)
        const mensaje = mensajeAprobacionConTerminos(s, monto, tasa, frecuenciaForm)
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener,noreferrer')
      }

      toast.success('Cliente creado. Ya puedes crear su préstamo con estos mismos términos.')
      setAprobando(null)
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setProcesando(null)
    }
  }

  const rechazar = async (s: Solicitud) => {
    setProcesando(s.id)
    const { error } = await supabase.from('solicitudes').update({ estado: 'rechazada' }).eq('id', s.id)
    setProcesando(null)
    if (error) { toast.error(error.message); return }
    toast.success('Solicitud rechazada.')
    load()
  }

  const openEdit = (s: Solicitud) => {
    setEditRow(s)
    setForm({
      nombre: s.nombre, apellido: s.apellido ?? '', cedula: s.cedula ?? '', telefono: s.telefono ?? '',
      monto_solicitado: s.monto_solicitado != null ? String(s.monto_solicitado) : '', referencia: s.referencia ?? '',
    })
  }
  const f = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  const save = async () => {
    if (!editRow) return
    if (!form.nombre.trim()) { toast.error('Ingresa el nombre.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('solicitudes').update({
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim() || null,
        cedula: form.cedula.trim() || null,
        telefono: form.telefono.trim() || null,
        monto_solicitado: form.monto_solicitado ? parseFloat(form.monto_solicitado) : null,
        referencia: form.referencia.trim() || null,
      }).eq('id', editRow.id)
      if (error) throw error
      toast.success('Solicitud actualizada.')
      setEditRow(null)
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteRow) return
    setDeleting(true)
    const { error } = await supabase.from('solicitudes').delete().eq('id', deleteRow.id)
    setDeleting(false)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Solicitud eliminada.')
    setDeleteRow(null)
    load()
  }

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente')
  const resueltas = solicitudes.filter(s => s.estado !== 'pendiente')

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a]">Solicitudes de Préstamo</h1>
          <p className="text-[14px] text-slate-500 mt-0.5">
            {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} · comparte{' '}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[12px]">/solicitar</code> con tus clientes
          </p>
        </div>
        <button onClick={() => window.print()} className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[13px] font-bold print:hidden">
          🖨️ Imprimir / PDF
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gradient-to-r from-[#0f172a] to-[#059669] text-white font-bold text-[14px]">
          ⏳ Pendientes de revisión
        </div>
        {loading ? (
          <div className="py-10 text-center text-slate-400 text-[13px]">Cargando…</div>
        ) : pendientes.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-[13px]">Sin solicitudes pendientes 🎉</div>
        ) : (
          <div className="divide-y divide-[#f1f5f9]">
            {pendientes.map(s => (
              <div key={s.id} className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-bold text-[#0f172a] text-[14px]">{s.nombre} {s.apellido}</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">
                    {s.cedula || 'Sin cédula'} · {s.telefono || 'Sin teléfono'}
                    {s.monto_solicitado ? ` · Solicita ${fmtMoney(s.monto_solicitado)}` : ''}
                  </div>
                  {s.referencia && <div className="text-[12px] text-slate-400 mt-0.5">Referencia: {s.referencia}</div>}
                  <div className="text-[11px] text-slate-400 mt-0.5">{fmtFecha(s.created_at.slice(0, 10))}</div>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                  <button onClick={() => openEdit(s)} disabled={procesando === s.id}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[12px] font-bold disabled:opacity-60">
                    ✏️ Editar
                  </button>
                  <button onClick={() => setDeleteRow(s)} disabled={procesando === s.id}
                    className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[12px] font-bold disabled:opacity-60">
                    🗑️
                  </button>
                  <button onClick={() => rechazar(s)} disabled={procesando === s.id}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[12px] font-bold disabled:opacity-60">
                    ❌ Rechazar
                  </button>
                  <button onClick={() => abrirAprobar(s)} disabled={procesando === s.id}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold disabled:opacity-60">
                    {procesando === s.id ? '⏳ Procesando…' : '✅ Aprobar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {resueltas.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-[#f1f5f9] font-bold text-[14px] text-[#0f172a]">Historial</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {resueltas.map(s => (
                  <tr key={s.id} className="border-b border-[#f1f5f9] last:border-0">
                    <td className="px-5 py-2.5 font-semibold text-[#0f172a]">{s.nombre} {s.apellido}</td>
                    <td className="px-4 py-2.5 text-slate-500">{s.telefono || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{s.monto_solicitado ? fmtMoney(s.monto_solicitado) : '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${ESTADO_STYLE[s.estado]}`}>
                        {ESTADO_LABEL[s.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center print:hidden">
                      <div className="flex items-center justify-center gap-3">
                        {s.telefono && (
                          <a href={linkWhatsappResultado(s)} target="_blank" rel="noopener noreferrer"
                            className="text-emerald-600 hover:underline text-[12px] font-semibold">💬 Notificar</a>
                        )}
                        {s.cliente_id && (
                          <Link href={`/dashboard/clientes`} className="text-[#0369a1] hover:underline text-[12px] font-semibold">Ver clientes →</Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center print:hidden">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(s)} title="Editar"
                          className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[11px] font-bold">
                          ✏️
                        </button>
                        <button onClick={() => setDeleteRow(s)} title="Eliminar"
                          className="px-2.5 py-1 rounded-md bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[11px] font-bold">
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={e => e.target === e.currentTarget && setEditRow(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slideUp">
            <div className="bg-gradient-to-r from-[#0f172a] to-[#059669] px-6 py-4 flex items-center justify-between">
              <span className="text-white font-bold text-[15px]">✏️ Editar Solicitud</span>
              <button onClick={() => setEditRow(null)} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Nombre</label>
                  <input value={form.nombre} onChange={e => f('nombre', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Apellido</label>
                  <input value={form.apellido} onChange={e => f('apellido', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Cédula</label>
                  <input value={form.cedula} onChange={e => f('cedula', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Teléfono</label>
                  <input value={form.telefono} onChange={e => f('telefono', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Monto solicitado</label>
                <input type="text" inputMode="decimal" value={form.monto_solicitado} onChange={e => f('monto_solicitado', soloDecimal(e.target.value))}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Referencia</label>
                <input value={form.referencia} onChange={e => f('referencia', e.target.value)}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button onClick={() => setEditRow(null)} className="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[13px] font-semibold">Cancelar</button>
                <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold disabled:opacity-60">
                  {saving ? '⏳ Guardando…' : '💾 Actualizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setDeleteRow(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-slideUp">
            <div className="bg-gradient-to-r from-[#7f1d1d] to-[#dc2626] px-6 py-4 flex items-center justify-between">
              <span className="text-white font-bold text-[15px]">🗑️ Eliminar Solicitud</span>
              <button onClick={() => setDeleteRow(null)} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[13px] text-slate-600">
                ¿Seguro que deseas eliminar la solicitud de <b>{deleteRow.nombre} {deleteRow.apellido}</b>? Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-end gap-2.5 pt-1">
                <button onClick={() => setDeleteRow(null)} className="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[13px] font-semibold">Cancelar</button>
                <button onClick={confirmDelete} disabled={deleting} className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold disabled:opacity-60">
                  {deleting ? '⏳ Eliminando…' : '🗑️ Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {aprobando && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={e => e.target === e.currentTarget && setAprobando(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slideUp">
            <div className="bg-gradient-to-r from-[#0f172a] to-[#059669] px-6 py-4 flex items-center justify-between">
              <span className="text-white font-bold text-[15px]">✅ Aprobar solicitud — {aprobando.nombre} {aprobando.apellido}</span>
              <button onClick={() => setAprobando(null)} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-[12px] text-slate-500">
                Define los términos para notificarle al cliente por WhatsApp antes de crear el préstamo.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Monto aprobado</label>
                  <input type="text" inputMode="decimal" value={montoForm} onChange={e => setMontoForm(soloDecimal(e.target.value))}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Tasa de interés (% por periodo)</label>
                  <input type="text" inputMode="decimal" value={tasaForm} onChange={e => setTasaForm(soloDecimal(e.target.value))}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Frecuencia</label>
                <select value={frecuenciaForm} onChange={e => setFrecuenciaForm(e.target.value as Frecuencia)}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400 bg-white">
                  <option value="semanal">Semanal</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </div>

              {!!parseFloat(montoForm) && !!parseFloat(tasaForm) && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-[12px] text-emerald-800">
                  Cuota estimada cada {PERIODO_LABEL[frecuenciaForm]}: <b>{fmtMoney(parseFloat(montoForm) * (parseFloat(tasaForm) / 100))}</b>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button onClick={() => setAprobando(null)} className="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[13px] font-semibold">Cancelar</button>
                <button onClick={confirmarAprobar} disabled={procesando === aprobando.id}
                  className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold disabled:opacity-60">
                  {procesando === aprobando.id ? '⏳ Procesando…' : '✅ Aprobar y notificar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
