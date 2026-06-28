import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { mxn } from '../../utils/format'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Pencil, AlertTriangle, Package, ArrowUpCircle, ArrowDownCircle, SlidersHorizontal } from 'lucide-react'

const CAT_COLORS = {
  'Lácteos':      'bg-yellow-100 text-yellow-700',
  'Embutidos':    'bg-red-100 text-red-700',
  'Carnes':       'bg-rose-100 text-rose-700',
  'Pastas':       'bg-orange-100 text-orange-700',
  'Verduras':     'bg-green-100 text-green-700',
  'Frutas':       'bg-pink-100 text-pink-700',
  'Salsas':       'bg-amber-100 text-amber-700',
  'Especias':     'bg-lime-100 text-lime-700',
  'Harinas':      'bg-stone-100 text-stone-700',
  'Desechables':  'bg-blue-100 text-blue-700',
  'Limpieza':     'bg-cyan-100 text-cyan-700',
  'Aceites':      'bg-yellow-100 text-yellow-600',
  'Bebidas':      'bg-indigo-100 text-indigo-700',
}

export default function Inventory() {
  const { user, profile } = useAuth()
  const [ingredients, setIngredients] = useState([])
  const [movements,   setMovements]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [catFilter,   setCatFilter]   = useState('Todos')
  const [modal,       setModal]       = useState(null) // { ingredient, type: 'entrada'|'salida'|'ajuste' }
  const [editIngr,    setEditIngr]    = useState(null)
  const [qty,         setQty]         = useState('')
  const [reason,      setReason]      = useState('')
  const [saving,      setSaving]      = useState(false)
  const [activeTab,   setActiveTab]   = useState('stock') // 'stock' | 'movements'

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: ing }, { data: mov }] = await Promise.all([
      supabase.from('ingredients').select('*').eq('active', true).order('name'),
      supabase.from('inventory_movements').select('*, ingredients(name), profiles(name)').order('created_at', { ascending: false }).limit(50),
    ])
    setIngredients(ing ?? [])
    setMovements(mov ?? [])
    setLoading(false)
  }

  async function applyMovement() {
    if (!qty || isNaN(qty) || parseFloat(qty) <= 0) return
    setSaving(true)
    const amount = parseFloat(qty)
    const { ingredient, type } = modal

    let newQty
    if (type === 'entrada')  newQty = ingredient.stock_quantity + amount
    if (type === 'salida')   newQty = Math.max(0, ingredient.stock_quantity - amount)
    if (type === 'ajuste')   newQty = amount

    await Promise.all([
      supabase.from('ingredients').update({ stock_quantity: newQty, updated_at: new Date().toISOString() }).eq('id', ingredient.id),
      supabase.from('inventory_movements').insert({
        ingredient_id: ingredient.id,
        type,
        quantity:  amount,
        reason:    reason || null,
        user_id:   user?.id,
      }),
    ])
    setModal(null); setQty(''); setReason('')
    setSaving(false)
    fetchAll()
  }

  async function saveIngredient() {
    if (!editIngr.name.trim()) return
    setSaving(true)
    const payload = {
      name:           editIngr.name,
      unit:           editIngr.unit,
      cost_per_unit:  parseFloat(editIngr.cost_per_unit) || 0,
      min_stock:      parseFloat(editIngr.min_stock) || 0,
      supplier:       editIngr.supplier || null,
      category:       editIngr.category || null,
      updated_at:     new Date().toISOString(),
    }
    if (editIngr.id) {
      await supabase.from('ingredients').update(payload).eq('id', editIngr.id)
    } else {
      await supabase.from('ingredients').insert({ ...payload, stock_quantity: 0, active: true })
    }
    setEditIngr(null)
    setSaving(false)
    fetchAll()
  }

  const categories = ['Todos', ...new Set(ingredients.map(i => i.category).filter(Boolean))]
  const lowStock   = ingredients.filter(i => i.min_stock > 0 && i.stock_quantity < i.min_stock)

  const filtered = ingredients.filter(i => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase())
    const matchCat    = catFilter === 'Todos' || i.category === catFilter
    return matchSearch && matchCat
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-red-600" />
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
        </div>
        <button onClick={() => setEditIngr({ name:'', unit:'pza', cost_per_unit:'', min_stock:'', supplier:'', category:'' })}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors">
          <Plus className="w-4 h-4" /> Nuevo insumo
        </button>
      </div>

      {/* Alertas de stock mínimo */}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm mb-2">
            <AlertTriangle className="w-4 h-4" /> {lowStock.length} insumo{lowStock.length > 1 ? 's' : ''} bajo stock mínimo
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(i => (
              <span key={i.id} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                {i.name}: {i.stock_quantity} {i.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {[['stock','Stock actual'],['movements','Movimientos']].map(([id,label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === id ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border'
            }`}>{label}</button>
        ))}
      </div>

      {activeTab === 'stock' && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar insumo..."
              className="flex-1 min-w-48 border rounded-xl px-4 py-2.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            <div className="flex gap-1 flex-wrap">
              {categories.slice(0,8).map(c => (
                <button key={c} onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    catFilter === c ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
                  }`}>{c}</button>
              ))}
            </div>
          </div>

          {/* Tabla de stock */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-gray-400">Cargando...</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Insumo','Categoría','Stock','Stock mín.','Costo/u','Proveedor','Movimiento'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(ing => {
                    const low = ing.min_stock > 0 && ing.stock_quantity < ing.min_stock
                    return (
                      <tr key={ing.id} className={`hover:bg-gray-50 transition-colors ${low ? 'bg-amber-50/50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {low && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                            <button onClick={() => setEditIngr({ ...ing })}
                              className="font-medium text-gray-800 hover:text-red-600 transition-colors text-left">
                              {ing.name}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {ing.category && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[ing.category] ?? 'bg-gray-100 text-gray-600'}`}>
                              {ing.category}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${low ? 'text-amber-600' : 'text-gray-800'}`}>
                            {ing.stock_quantity} {ing.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{ing.min_stock > 0 ? `${ing.min_stock} ${ing.unit}` : '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{ing.cost_per_unit > 0 ? mxn(ing.cost_per_unit) : '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{ing.supplier ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => { setModal({ ingredient: ing, type: 'entrada' }); setQty(''); setReason('') }}
                              title="Entrada" className="text-green-500 hover:text-green-700 transition-colors">
                              <ArrowUpCircle className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setModal({ ingredient: ing, type: 'salida' }); setQty(''); setReason('') }}
                              title="Salida" className="text-red-400 hover:text-red-600 transition-colors">
                              <ArrowDownCircle className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setModal({ ingredient: ing, type: 'ajuste' }); setQty(String(ing.stock_quantity)); setReason('') }}
                              title="Ajustar" className="text-blue-400 hover:text-blue-600 transition-colors">
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="py-12 text-center text-gray-400">Sin insumos</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'movements' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Fecha','Insumo','Tipo','Cantidad','Motivo','Usuario'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {movements.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(m.created_at).toLocaleDateString('es-MX')}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{m.ingredients?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.type === 'entrada' ? 'bg-green-100 text-green-700' :
                      m.type === 'salida'  ? 'bg-red-100 text-red-700'    :
                                             'bg-blue-100 text-blue-700'
                    }`}>{m.type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{m.quantity}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{m.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{m.profiles?.name ?? '—'}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400">Sin movimientos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal movimiento */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h2 className="font-bold text-gray-800 capitalize">
              {modal.type === 'entrada' ? '📥 Entrada de' : modal.type === 'salida' ? '📤 Salida de' : '⚙️ Ajustar'} {modal.ingredient.name}
            </h2>
            <p className="text-sm text-gray-500">Stock actual: <b>{modal.ingredient.stock_quantity} {modal.ingredient.unit}</b></p>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {modal.type === 'ajuste' ? 'Nuevo stock total' : 'Cantidad'}
              </label>
              <input type="number" min="0" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
                autoFocus className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Motivo (opcional)</label>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Compra semanal, merma, etc."
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 border text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={applyMovement} disabled={saving}
                className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-60">
                {saving ? '...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar insumo */}
      {editIngr && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h2 className="font-bold text-gray-800">{editIngr.id ? 'Editar insumo' : 'Nuevo insumo'}</h2>
            {[
              { label: 'Nombre *', key: 'name', type: 'text' },
              { label: 'Unidad de medida', key: 'unit', type: 'text', placeholder: 'kg, pza, L, pack...' },
              { label: 'Costo por unidad ($)', key: 'cost_per_unit', type: 'number' },
              { label: 'Stock mínimo', key: 'min_stock', type: 'number' },
              { label: 'Proveedor', key: 'supplier', type: 'text' },
              { label: 'Categoría', key: 'category', type: 'text', placeholder: 'Lácteos, Embutidos, Verduras...' },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-sm text-gray-600 mb-1">{field.label}</label>
                <input type={field.type} value={editIngr[field.key] ?? ''}
                  onChange={e => setEditIngr(f => ({...f, [field.key]: e.target.value}))}
                  placeholder={field.placeholder}
                  className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
            ))}
            <div className="flex gap-3">
              <button onClick={() => setEditIngr(null)} className="flex-1 border text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={saveIngredient} disabled={saving}
                className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-60">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
