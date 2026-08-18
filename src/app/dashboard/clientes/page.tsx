'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Cliente } from '@/types'

interface ClienteDocumento {
  id: number
  cliente_id: number
  nombre: string
  path: string
  created_at: string
}

const BUCKET_DOCUMENTOS = 'prestamos-clientes'
const esImagen = (nombre: string) => /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(nombre)

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
  const [documentos, setDocumentos] = useState<ClienteDocumento[]>([])
  const [docUrls, setDocUrls] = useState<Record<number, string>>({})
  const [subiendo, setSubiendo] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [savingPin, setSavingPin] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('clientes')
      .select('id,nombre,apellido,cedula,telefono,direccion,email,referencia,activo,created_at,pin_set_at')
      .order('nombre')
    setLoading(false)
    if (error) { toast.error(error.message); return }
    setClientes((data || []) as Cliente[])
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = clientes.filter(c => {
    const txt = `${c.nombre} ${c.apellido ?? ''} ${c.cedula ?? ''}`.toLowerCase()
    return !search || txt.includes(search.toLowerCase())
  })

  const openNew = () => { setEditRow(null); setForm(emptyForm()); setDocumentos([]); setDocUrls({}); setModal(true) }
  const openEdit = (c: Cliente) => {
    setEditRow(c)
    setForm({ nombre: c.nombre, apellido: c.apellido, cedula: c.cedula, telefono: c.telefono, direccion: c.direccion, email: c.email, referencia: c.referencia, activo: c.activo })
    setModal(true)
    cargarDocumentos(c.id)
  }
  const closeModal = () => { setModal(false); setEditRow(null); setDocumentos([]); setDocUrls({}); setPinInput('') }
  const f = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(prev => ({ ...prev, [k]: v }))

  const cargarDocumentos = async (clienteId: number) => {
    const { data, error } = await supabase.from('cliente_documentos').select('*').eq('cliente_id', clienteId).order('created_at')
    if (error) { toast.error(error.message); return }
    const docs = (data || []) as ClienteDocumento[]
    setDocumentos(docs)
    const urls: Record<number, string> = {}
    await Promise.all(docs.map(async d => {
      const { data: signed } = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(d.path, 3600)
      if (signed?.signedUrl) urls[d.id] = signed.signedUrl
    }))
    setDocUrls(urls)
  }

  const subirDocumentos = async (files: FileList | null) => {
    if (!files?.length || !editRow) return
    setSubiendo(true)
    try {
      for (const file of Array.from(files)) {
        const path = `cliente-${editRow.id}/${Date.now()}-${file.name}`
        const { error: errUp } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(path, file)
        if (errUp) throw errUp
        const { error: errIns } = await supabase.from('cliente_documentos').insert({ cliente_id: editRow.id, nombre: file.name, path })
        if (errIns) throw errIns
      }
      toast.success('Documento(s) agregado(s)')
      cargarDocumentos(editRow.id)
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setSubiendo(false)
    }
  }

  const eliminarDocumento = async (doc: ClienteDocumento) => {
    if (!window.confirm(`¿Eliminar "${doc.nombre}"?`)) return
    const { error: errStorage } = await supabase.storage.from(BUCKET_DOCUMENTOS).remove([doc.path])
    if (errStorage) { toast.error(errStorage.message); return }
    const { error } = await supabase.from('cliente_documentos').delete().eq('id', doc.id)
    if (error) { toast.error(error.message); return }
    setDocumentos(prev => prev.filter(d => d.id !== doc.id))
    toast.success('Documento eliminado')
  }

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

  const guardarPin = async () => {
    if (!editRow) return
    if (!/^\d{4,6}$/.test(pinInput)) { toast.error('El PIN debe tener entre 4 y 6 dígitos.'); return }
    setSavingPin(true)
    const { error } = await supabase.rpc('portal_set_pin', { p_cliente_id: editRow.id, p_pin: pinInput })
    setSavingPin(false)
    if (error) { toast.error(error.message); return }
    toast.success('PIN guardado. Comunícaselo al cliente por WhatsApp o en persona.')
    setPinInput('')
    const now = new Date().toISOString()
    setEditRow(prev => prev ? { ...prev, pin_set_at: now } : prev)
    setClientes(prev => prev.map(c => c.id === editRow.id ? { ...c, pin_set_at: now } : c))
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

              <div className="pt-1 border-t border-[#f1f5f9]">
                <label className="block text-[11px] font-bold text-slate-500 mb-1.5 mt-2">🔐 PIN del Portal del Cliente</label>
                {!editRow ? (
                  <p className="text-[12px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    Guarda el cliente primero para poder asignarle un PIN.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-[12px] text-slate-500">
                      {editRow.pin_set_at
                        ? `PIN configurado el ${new Date(editRow.pin_set_at).toLocaleDateString('es-PA')}. Escribe uno nuevo para reemplazarlo.`
                        : 'Este cliente todavía no tiene PIN — no puede entrar al portal.'}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        value={pinInput}
                        onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        inputMode="numeric"
                        placeholder="4 a 6 dígitos"
                        className="flex-1 px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-emerald-400 tracking-[0.2em]"
                      />
                      <button type="button" onClick={guardarPin} disabled={savingPin || !pinInput}
                        className="px-3.5 py-2 rounded-lg bg-[#0f172a] text-white text-[12px] font-bold disabled:opacity-50 whitespace-nowrap">
                        {savingPin ? '⏳' : '💾 Guardar PIN'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Comunicáselo por WhatsApp o en persona — no queda visible en ningún lado del sistema.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-1 border-t border-[#f1f5f9]">
                <label className="block text-[11px] font-bold text-slate-500 mb-1.5 mt-2">📎 Cédula / Documentos</label>
                {!editRow ? (
                  <p className="text-[12px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    Guarda el cliente primero para poder adjuntar fotos o documentos.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {documentos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {documentos.map(d => (
                          <div key={d.id} className="relative border border-[#e2e8f0] rounded-lg overflow-hidden group">
                            <a href={docUrls[d.id] || '#'} target="_blank" rel="noopener noreferrer" className="block">
                              {esImagen(d.nombre) && docUrls[d.id] ? (
                                <img src={docUrls[d.id]} alt={d.nombre} className="w-full h-20 object-cover" />
                              ) : (
                                <div className="w-full h-20 flex items-center justify-center bg-slate-50 text-2xl">📄</div>
                              )}
                            </a>
                            <p className="text-[10px] text-slate-500 px-1.5 py-1 truncate" title={d.nombre}>{d.nombre}</p>
                            <button type="button" onClick={() => eliminarDocumento(d)} title="Eliminar"
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center opacity-90 hover:opacity-100">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 text-[12px] font-bold cursor-pointer hover:bg-emerald-100 ${subiendo ? 'opacity-60 pointer-events-none' : ''}`}>
                      {subiendo ? '⏳ Subiendo…' : '📷 Agregar foto o documento'}
                      <input type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden"
                        onChange={e => subirDocumentos(e.target.files)} />
                    </label>
                  </div>
                )}
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
