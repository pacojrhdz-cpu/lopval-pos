import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Tag, Plus, Pencil, Trash2, X, Check } from 'lucide-react'

const EMPTY = { name: '', icon: '🍕', active: true, sort_order: 0 }

export default function Categories() {
  const { activeBranch } = useAuth()
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState(EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => { fetchAll() }, [activeBranch])

  async function fetchAll() {
    setLoading(true)
    let q = supabase.from('categories').select('*').order('sort_order').order('name')
    if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id)
    const { data } = await q
    setCategories(data ?? [])
    setLoading(false)
  }

  function openNew() {
    setForm({ ...EMPTY, sort_order: categories.length })
    setEditing('new')
    setError('')
  }

  function openEdit(cat) {
    setForm({ name: cat.name, icon: cat.icon ?? '', active: cat.active, sort_order: cat.sort_order ?? 0 })
    setEditing(cat)
    setError('')
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      name:       form.name.trim(),
      icon:       form.icon.trim() || null,
      active:     form.active,
      sort_order: parseInt(form.sort_order) || 0,
      updated_at: new Date().toISOString(),
      ...(editing === 'new' && activeBranch?.id ? { branch_id: activeBranch.id } : {}),
    }
    let err
    if (editing === 'new') {
      ;({ error: err } = await supabase.from('categories').insert(payload))
    } else {
      ;({ error: err } = await supabase.from('categories').update(payload).eq('id', editing.id))
    }
    if (err) { setError(err.message); setSaving(false); return }
    await fetchAll()
    setEditing(null)
    setSaving(false)
  }

  async function toggleActive(cat) {
    await supabase.from('categories').update({ active: !cat.active }).eq('id', cat.id)
    fetchAll()
  }

  async function handleDelete(cat) {
    if (!confirm(`¿Eliminar categoría "${cat.name}"?`)) return
    await supabase.from('categories').delete().eq('id', cat.id)
    fetchAll()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag className="w-6 h-6" /> Categorías
          </h1>
          {activeBranch && <p className="text-sm text-gray-500 mt-0.5">{activeBranch.name}</p>}
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors">
          <Plus className="w-4 h-4" /> Nueva categoría
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Cargando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Orden', 'Ícono', 'Nombre', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {categories.map(cat => (
                <tr key={cat.id} className={`hover:bg-gray-50 transition-colors ${!cat.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-gray-400 text-xs">{cat.sort_order ?? 0}</td>
                  <td className="px-4 py-3 text-2xl">{cat.icon ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{cat.name}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(cat)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {cat.active ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(cat)} className="text-gray-400 hover:text-blue-600 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(cat)} className="text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-gray-400">Sin categorías — crea la primera</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
              <h2 className="font-bold text-gray-800">{editing === 'new' ? 'Nueva categoría' : 'Editar categoría'}</h2>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-red-500 text-sm">{error}</p>}

              <Field label="Ícono (emoji)">
                <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                  className="input text-2xl" placeholder="🍕" maxLength={4} />
              </Field>

              <Field label="Nombre *">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="Ej: Pizzas, Bebidas, Postres" autoFocus />
              </Field>

              <Field label="Orden de aparición">
                <input type="number" min="0" value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                  className="input" />
              </Field>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="w-4 h-4 accent-red-600" />
                <span className="text-sm text-gray-700">Categoría activa (visible en POS)</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditing(null)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`.input{width:100%;border:1px solid #e5e7eb;border-radius:.75rem;padding:.625rem .75rem;font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px #fca5a5}`}</style>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
