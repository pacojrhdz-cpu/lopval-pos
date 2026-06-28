import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { mxn } from '../../utils/format'
import { Plus, Pencil, Trash2, X, Check, Search } from 'lucide-react'

const EMPTY_PRODUCT = { name: '', description: '', category_id: '', price: '', active: true }

export default function Products() {
  const [products,    setProducts]   = useState([])
  const [categories,  setCategories] = useState([])
  const [loading,     setLoading]    = useState(true)
  const [search,      setSearch]     = useState('')
  const [editing,     setEditing]    = useState(null)   // null | 'new' | product object
  const [form,        setForm]       = useState(EMPTY_PRODUCT)
  const [saving,      setSaving]     = useState(false)
  const [error,       setError]      = useState('')

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('products').select('*, categories(name,icon)').order('name'),
      supabase.from('categories').select('*').eq('active', true).order('sort_order'),
    ])
    setProducts(p ?? [])
    setCategories(c ?? [])
    setLoading(false)
  }

  function openNew() {
    setForm({ ...EMPTY_PRODUCT, category_id: categories[0]?.id ?? '' })
    setEditing('new')
    setError('')
  }

  function openEdit(product) {
    setForm({
      name:        product.name,
      description: product.description ?? '',
      category_id: product.category_id ?? '',
      price:       product.price,
      active:      product.active,
    })
    setEditing(product)
    setError('')
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.price || isNaN(form.price)) { setError('Precio inválido'); return }
    setSaving(true)
    setError('')

    const payload = {
      name:        form.name.trim(),
      description: form.description.trim() || null,
      category_id: form.category_id || null,
      price:       parseFloat(form.price),
      active:      form.active,
      updated_at:  new Date().toISOString(),
    }

    let err
    if (editing === 'new') {
      ;({ error: err } = await supabase.from('products').insert(payload))
    } else {
      ;({ error: err } = await supabase.from('products').update(payload).eq('id', editing.id))
    }

    if (err) { setError(err.message); setSaving(false); return }
    await fetchAll()
    setEditing(null)
    setSaving(false)
  }

  async function toggleActive(product) {
    await supabase.from('products').update({ active: !product.active }).eq('id', product.id)
    fetchAll()
  }

  async function handleDelete(product) {
    if (!confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return
    await supabase.from('products').delete().eq('id', product.id)
    fetchAll()
  }

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors">
          <Plus className="w-4 h-4" /> Nuevo producto
        </button>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border rounded-xl shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Cargando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Producto','Categoría','Precio','Estado',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${!p.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-400 truncate max-w-xs">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.categories ? `${p.categories.icon} ${p.categories.name}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-bold text-red-600">{mxn(p.price)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(p)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-blue-600 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(p)} className="text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-gray-400">Sin productos</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal edición */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
              <h2 className="font-bold text-gray-800">{editing === 'new' ? 'Nuevo producto' : 'Editar producto'}</h2>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-red-500 text-sm">{error}</p>}

              <Field label="Nombre *">
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                  className="input" placeholder="Ej: Pizza Margarita" />
              </Field>

              <Field label="Descripción">
                <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))}
                  rows={2} className="input resize-none" placeholder="Ingredientes principales..." />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Categoría">
                  <select value={form.category_id} onChange={e => setForm(f => ({...f, category_id: e.target.value}))}
                    className="input">
                    <option value="">Sin categoría</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </Field>
                <Field label="Precio *">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" min="0" step="0.50" value={form.price}
                      onChange={e => setForm(f => ({...f, price: e.target.value}))}
                      className="input pl-7" placeholder="0.00" />
                  </div>
                </Field>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({...f, active: e.target.checked}))}
                  className="w-4 h-4 accent-red-600" />
                <span className="text-sm text-gray-700">Producto activo (visible en POS)</span>
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

      <style>{`.input { width:100%; border:1px solid #e5e7eb; border-radius:0.75rem; padding:0.625rem 0.75rem; font-size:0.875rem; outline:none; } .input:focus { box-shadow:0 0 0 2px #fca5a5; }`}</style>
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
