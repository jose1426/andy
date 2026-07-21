'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Cliente } from '@/types'

function emptyForm(): Omit<Cliente, 'id' | 'created_at'> {
  return { nombre: '', apellido: '', cedula: '', telefono: '', direccion: '', email: '', referencia: '', activo: true }
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editRow, setEditRow] = useState<Cliente | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [deleteRow, setDeleteRow] = useState<Cliente | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('clientes').select('*').order('nombre')
    setLoading(false)
    if (error) { toast.error(error.message); return }
    setClientes((data || []) as Cliente[])
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = clientes.filter(c => {
    const txt = `${c.nombre} ${c.apellido ?? ''} ${c.cedula ?? ''}`.toLowerCase()
    return !search || txt.includes(search.toLowerCase())
  })

  const openNew = () => { setEditRow(null); setForm(emptyForm()); setModal(true) }
  const openEdit = (c: Cliente) => {
    setEditRow(c)
    setForm({ nombre: c.nombre, apellido: c.apellido, cedula: c.cedula, telefono: c.telefono, direccion: c.direccion, email: c.email, referencia: c.referencia, activo: c.activo })
    setModal(true)
  }
  const closeModal = () => { setModal(false); setEditRow(null) }
  const f = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(prev => ({ ...prev, [k]: v }))

  const save = async () => {
    if (!form.nombre.trim()) { toast.error('Ingrese el nombre.'); return }
    setSaving(true)
    try {
      if (editRow) {
        const { error } = await supabase.from('clientes').update(form).eq('id', editRow.id)
        if (error) throw error
        toast.success('Cliente actualizado')
      } else {
        const { error } = await supabase.from('clientes').insert(form)
        if (error) throw error
        toast.success('Cliente creado')
      }
      closeModal()
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActivo = async (c: Cliente) => {
    const { error } = await supabase.from('clientes').update({ activo: !c.activo }).eq('id', c.id)
    if (error) { toast.error(error.message); return }
    setClientes(prev => prev.map(x => x.id === c.id ? { ...x, activo: !x.activo } : x))
  }

  const confirmDelete = async () => {
    if (!deleteRow) return
    setDeleting(true)
    try {
      const { count, error: errCount } = await supabase.from('prestamos')
        .select('id', { count: 'exact', head: true }).eq('cliente_id', deleteRow.id)
      if (errCount) throw errCount
      if (count && count > 0) {
        toast.error(`No se puede eliminar: tiene ${count} préstamo${count !== 1 ? 's' : ''} registrado${count !== 1 ? 's' : ''}.`)
        setDeleteRow(null)
        return
      }
      const { error } = await supabase.from('clientes').delete().eq('id', deleteRow.id)
      if (error) throw error
      toast.success('Cliente eliminado.')
      setDeleteRow(null)
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a]">Clientes</h1>
          <p className="text-[14px] text-slate-500 mt-0.5">{clientes.length} clientes registrados</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button onClick={() => window.print()} className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[13px] font-bold">
            🖨️ Imprimir / PDF
          </button>
          <button onClick={openNew} className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold hover:opacity-90 transition-opacity">
            ＋ Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 print:hidden">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por nombre o cédula…"
          className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400"
        />
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#f1f5f9] border-b-2 border-[#e2e8f0]">
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-slate-500">Nombre</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-slate-500">Cédula</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-slate-500">Teléfono</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-slate-500">Dirección</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500">Estado</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold uppercase text-slate-500 print:hidden">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">Cargando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">Sin clientes</td></tr>
              ) : filtered.map((c, i) => (
                <tr key={c.id} onClick={() => openEdit(c)}
                  className={`border-b border-[#f1f5f9] cursor-pointer hover:bg-emerald-50/50 transition-colors ${i % 2 === 0 ? '' : 'bg-[#f8fafc]'}`}>
                  <td className="px-4 py-2.5 font-semibold text-[#0f172a]">{c.nombre} {c.apellido}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{c.cedula || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{c.telefono || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{c.direccion || '—'}</td>
                  <td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => toggleActivo(c)}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border cursor-pointer ${c.activo ? 'bg-green-100 text-green-800 border-green-400' : 'bg-red-100 text-red-800 border-red-300'}`}>
                      {c.activo ? '☑ ACTIVO' : '⊖ INACTIVO'}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-center print:hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEdit(c)} title="Editar"
                        className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[11px] font-bold">
                        ✏️ Editar
                      </button>
                      <button onClick={() => setDeleteRow(c)} title="Eliminar"
                        className="px-2.5 py-1 rounded-md bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[11px] font-bold">
                        🗑️ Eliminar
                      </button>
                    </div>
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
              <span className="text-white font-bold text-[15px]">👥 {editRow ? 'Editar' : 'Nuevo'} Cliente</span>
              <button onClick={closeModal} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
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
                  <input value={form.apellido ?? ''} onChange={e => f('apellido', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Cédula</label>
                  <input value={form.cedula ?? ''} onChange={e => f('cedula', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Teléfono</label>
                  <input value={form.telefono ?? ''} onChange={e => f('telefono', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Dirección</label>
                <input value={form.direccion ?? ''} onChange={e => f('direccion', e.target.value)}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Correo</label>
                  <input value={form.email ?? ''} onChange={e => f('email', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Referencia</label>
                  <input value={form.referencia ?? ''} onChange={e => f('referencia', e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[13px] font-semibold">Cancelar</button>
                <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#10b981] text-white text-[13px] font-bold disabled:opacity-60">
                  {saving ? '⏳ Guardando…' : `💾 ${editRow ? 'Actualizar' : 'Guardar'}`}
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
              <span className="text-white font-bold text-[15px]">🗑️ Eliminar Cliente</span>
              <button onClick={() => setDeleteRow(null)} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[13px] text-slate-600">
                ¿Seguro que deseas eliminar a <b>{deleteRow.nombre} {deleteRow.apellido}</b>? Esta acción no se puede deshacer.
              </p>
              <p className="text-[11px] text-slate-400">Si el cliente tiene préstamos registrados, no se podrá eliminar.</p>
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
    </div>
  )
}
