import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { mxn } from '../../utils/format'
import { useAuth } from '../../contexts/AuthContext'
import {
  Plus, Pencil, AlertTriangle, Package,
  ArrowUpCircle, ArrowDownCircle, SlidersHorizontal, ClipboardList
} from 'lucide-react'

const CAT_COLORS = {
  'Lácteos':     'bg-yellow-100 text-yellow-700',
  'Embutidos':   'bg-red-100 text-red-700',
  'Carnes':      'bg-rose-100 text-rose-700',
  'Pastas':      'bg-orange-100 text-orange-700',
  'Verduras':    'bg-green-100 text-green-700',
  'Frutas':      'bg-pink-100 text-pink-700',
  'Salsas':      'bg-amber-100 text-amber-700',
  'Especias':    'bg-lime-100 text-lime-700',
  'Harinas':     'bg-stone-100 text-stone-700',
  'Desechables': 'bg-blue-100 text-blue-700',
  'Limpieza':    'bg-cyan-100 text-cyan-700',
  'Aceites':     'bg-yellow-100 text-yellow-600',
  'Bebidas':     'bg-indigo-100 text-indigo-700',
}

const TYPE_LABELS = {
  entry:              { label: 'Entrada',       cls: 'bg-green-100 text-green-700' },
  exit:               { label: 'Salida',        cls: 'bg-red-100 text-red-700' },
  merma:              { label: 'Merma',         cls: 'bg-orange-100 text-orange-700' },
  production_use:     { label: 'Producción',    cls: 'bg-purple-100 text-purple-700' },
  production_output:  { label: 'Prod. output',  cls: 'bg-teal-100 text-teal-700' },
  count_adjustment:   { label: 'Ajuste conteo', cls: 'bg-blue-100 text-blue-700' },
  requisition_receipt:{ label: 'Recepción requi', cls: 'bg-cyan-100 text-cyan-700' },
}

export default function Inventory() {
  const { user, profile, activeBranch } = useAuth()
  const [items,      setItems]      = useState([])   // ingredients + stock merged
  const [movements,  setMovements]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [catFilter,  setCatFilter]  = useState('Todos')
  const [modal,      setModal]      = useState(null) // { item, type }
  const [editIngr,   setEditIngr]   = useState(null)
  const [qty,        setQty]        = useState('')
  const [reason,     setReason]     = useState('')
  const [saving,     setSaving]     = useState(false)
  const [activeTab,  setActiveTab]  = useState('stock')
  const [showCount,  setShowCount]  = useState(false)
  const [countItems, setCountItems] = useState([])
  const [countNotes, setCountNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { fetchAll() }, [activeBranch])

  async function fetchAll() {
    setLoading(true)
    const branchId = activeBranch?.id

    // 1. Catálogo completo de insumos (compartido)
    const { data: ingredients } = await supabase
      .from('ingredients').select('*').eq('active', true).order('name')

    // 2. Stock de esta sucursal
    let invQ = supabase.from('inventory').select('ingredient_id, quantity, min_stock')
    if (branchId) invQ = invQ.eq('branch_id', branchId)
    const { data: inv } = await invQ

    // 3. Movimientos recientes
    let movQ = supabase.from('inventory_movements')
      .select('*, ingredients(name)')
      .order('created_at', { ascending: false }).limit(100)
    if (branchId) movQ = movQ.eq('branch_id', branchId)
    const { data: mov } = await movQ

    // Merge: ingredient + stock de esta sucursal
    const stockMap = {}
    for (const s of (inv ?? [])) stockMap[s.ingredient_id] = s

    const merged = (ingredients ?? []).map(ing => ({
      ...ing,
      stock_quantity: stockMap[ing.id]?.quantity   ?? 0,
      min_stock:      stockMap[ing.id]?.min_stock  ?? ing.min_stock ?? 0,
    }))

    setItems(merged)
    setMovements(mov ?? [])
    setLoading(false)
  }

  async function applyMovement() {
    if (!qty || isNaN(qty) || parseFloat(qty) <= 0) return
    setSaving(true)
    const amount  = parseFloat(qty)
    const { item, type } = modal
    const branchId = activeBranch?.id

    let delta
    if (type === 'entry')  delta = amount
    if (type === 'exit')   delta = -amount
    if (type === 'merma')  delta = -amount
    if (type === 'adjust') {
      // ajuste: delta = nuevo valor - actual
      delta = amount - item.stock_quantity
    }

    const mvType = type === 'adjust' ? 'count_adjustment' : type

    await supabase.rpc('update_stock', {
      p_branch_id:     branchId,
      p_ingredient_id: item.id,
      p_delta:         delta,
      p_type:          mvType,
      p_notes:         reason || null,
      p_user_id:       user?.id ?? null,
      p_user_name:     profile?.name ?? null,
    })

    setModal(null); setQty(''); setReason('')
    setSaving(false)
    fetchAll()
  }

  async function saveIngredient() {
    if (!editIngr.name?.trim()) return
    setSaving(true)
    const payload = {
      name:          editIngr.name.trim(),
      unit:          editIngr.unit || 'pza',
      cost_per_unit: parseFloat(editIngr.cost_per_unit) || 0,
      category:      editIngr.category || null,
      active:        true,
    }
    if (editIngr.id) {
      await supabase.from('ingredients').update(payload).eq('id', editIngr.id)
    } else {
      const { data: newIng } = await supabase.from('ingredients').insert(payload).select().single()
      // Crear fila de stock vacía para esta sucursal
      if (newIng && activeBranch?.id) {
        await supabase.from('inventory').upsert({
          branch_id: activeBranch.id, ingredient_id: newIng.id,
          quantity: 0, min_stock: parseFloat(editIngr.min_stock) || 0,
        }, { onConflict: 'branch_id,ingredient_id' })
      }
    }
    // Actualizar min_stock en inventory si existe
    if (editIngr.id && activeBranch?.id) {
      await supabase.from('inventory').upsert({
        branch_id: activeBranch.id, ingredient_id: editIngr.id,
        min_stock: parseFloat(editIngr.min_stock) || 0,
      }, { onConflict: 'branch_id,ingredient_id' })
    }
    setEditIngr(null); setSaving(false); fetchAll()
  }

  // ── Conteo Cíclico ───────────────────────────────────────────
  function startCount() {
    setCountItems(items.map(i => ({
      ingredient_id:   i.id,
      ingredient_name: i.name,
      unit:            i.unit,
      expected_qty:    i.stock_quantity,
      counted_qty:     '',
    })))
    setCountNotes('')
    setShowCount(true)
  }

  async function submitCount() {
    const filled = countItems.filter(c => c.counted_qty !== '')
    if (filled.length === 0) return
    setSubmitting(true)

    const { data: countRec } = await supabase.from('cyclic_counts').insert({
      branch_id:       activeBranch?.id,
      branch_name:     activeBranch?.name,
      created_by:      user?.id,
      created_by_name: profile?.name,
      status:          'submitted',
      notes:           countNotes || null,
      submitted_at:    new Date().toISOString(),
    }).select().single()

    if (countRec) {
      await supabase.from('cyclic_count_items').insert(
        filled.map(c => ({
          count_id:        countRec.id,
          ingredient_id:   c.ingredient_id,
          ingredient_name: c.ingredient_name,
          unit:            c.unit,
          expected_qty:    c.expected_qty,
          counted_qty:     parseFloat(c.counted_qty),
        }))
      )
    }

    setShowCount(false)
    setSubmitting(false)
    alert('Conteo enviado al administrador.')
    fetchAll()
  }

  const categories = ['Todos', ...new Set(items.map(i => i.category).filter(Boolean))]
  const lowStock   = items.filter(i => i.min_stock > 0 && i.stock_quantity < i.min_stock)

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase())
    const matchCat    = catFilter === 'Todos' || i.category === catFilter
    return matchSearch && matchCat
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-red-600" />
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          {activeBranch && <span className="text-sm text-gray-400">— {activeBranch.name}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={startCount}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors">
            <ClipboardList className="w-4 h-4" /> Conteo cíclico
          </button>
          <button onClick={() => setEditIngr({ name:'', unit:'pza', cost_per_unit:'', min_stock:'', category:'' })}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors">
            <Plus className="w-4 h-4" /> Nuevo insumo
          </button>
        </div>
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
          <div className="flex flex-wrap gap-2 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar insumo..."
              className="flex-1 min-w-48 border rounded-xl px-4 py-2.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            <div className="flex gap-1 flex-wrap">
              {categories.slice(0,10).map(c => (
                <button key={c} onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    catFilter === c ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
                  }`}>{c}</button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-gray-400">Cargando...</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Insumo','Categoría','Stock actual','Mínimo','Costo/u','Movimiento'].map(h => (
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
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => { setModal({ item: ing, type: 'entry' }); setQty(''); setReason('') }}
                              title="Entrada" className="text-green-500 hover:text-green-700 transition-colors">
                              <ArrowUpCircle className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setModal({ item: ing, type: 'exit' }); setQty(''); setReason('') }}
                              title="Salida" className="text-red-400 hover:text-red-600 transition-colors">
                              <ArrowDownCircle className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setModal({ item: ing, type: 'merma' }); setQty(''); setReason('') }}
                              title="Merma" className="text-orange-400 hover:text-orange-600 transition-colors">
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setModal({ item: ing, type: 'adjust' }); setQty(String(ing.stock_quantity)); setReason('') }}
                              title="Ajuste" className="text-blue-400 hover:text-blue-600 transition-colors">
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="py-12 text-center text-gray-400">Sin insumos registrados</td></tr>
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
                {['Fecha','Insumo','Tipo','Cantidad','Notas','Usuario'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {movements.map(m => {
                const t = TYPE_LABELS[m.type] ?? { label: m.type, cls: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString('es-MX')}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{m.ingredients?.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.cls}`}>{t.label}</span>
                    </td>
                    <td className={`px-4 py-3 font-bold ${m.quantity >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {m.quantity >= 0 ? '+' : ''}{m.quantity}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.notes ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.created_by_name ?? '—'}</td>
                  </tr>
                )
              })}
              {movements.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400">Sin movimientos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal movimiento ── */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h2 className="font-bold text-gray-800">
              {modal.type === 'entry'  ? '📥 Entrada de' :
               modal.type === 'exit'   ? '📤 Salida de' :
               modal.type === 'merma'  ? '⚠️ Merma de' :
                                         '⚙️ Ajustar'} {modal.item.name}
            </h2>
            <p className="text-sm text-gray-500">
              Stock actual: <b>{modal.item.stock_quantity} {modal.item.unit}</b>
            </p>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {modal.type === 'adjust' ? 'Nuevo stock total' : `Cantidad (${modal.item.unit})`}
              </label>
              <input type="number" min="0" step="0.001" value={qty}
                onChange={e => setQty(e.target.value)} autoFocus
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Nota (opcional)</label>
              <input value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Compra semanal, caducó, etc."
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModal(null)}
                className="flex-1 border text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={applyMovement} disabled={saving}
                className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-60">
                {saving ? '...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editar/nuevo insumo ── */}
      {editIngr && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h2 className="font-bold text-gray-800">{editIngr.id ? 'Editar insumo' : 'Nuevo insumo'}</h2>
            {[
              { label: 'Nombre *',           key: 'name',          type: 'text' },
              { label: 'Unidad de medida',   key: 'unit',          type: 'text', placeholder: 'kg, pza, L, pack...' },
              { label: 'Costo por unidad ($)',key: 'cost_per_unit', type: 'number' },
              { label: 'Stock mínimo',       key: 'min_stock',     type: 'number' },
              { label: 'Categoría',          key: 'category',      type: 'text', placeholder: 'Lácteos, Carnes, Verduras...' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm text-gray-600 mb-1">{f.label}</label>
                <input type={f.type} value={editIngr[f.key] ?? ''}
                  onChange={e => setEditIngr(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
            ))}
            <div className="flex gap-3">
              <button onClick={() => setEditIngr(null)}
                className="flex-1 border text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={saveIngredient} disabled={saving}
                className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-60">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Conteo cíclico ── */}
      {showCount && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
              <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <ClipboardList className="w-5 h-5" /> Conteo cíclico
              </h2>
              <button onClick={() => setShowCount(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              <p className="text-xs text-gray-500 mb-3">
                Ingresa la cantidad física que contaste. Deja en blanco los que no revisaste.
              </p>
              {countItems.map((ci, idx) => (
                <div key={ci.ingredient_id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-gray-700">{ci.ingredient_name}</span>
                  <span className="text-xs text-gray-400 w-16 text-right">{ci.expected_qty} {ci.unit}</span>
                  <input
                    type="number" min="0" step="0.001"
                    value={ci.counted_qty}
                    onChange={e => setCountItems(prev => prev.map((x, i) => i === idx ? { ...x, counted_qty: e.target.value } : x))}
                    placeholder="Contado"
                    className="w-24 border rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  {ci.counted_qty !== '' && (
                    <span className={`text-xs w-16 text-right font-medium ${
                      parseFloat(ci.counted_qty) < ci.expected_qty ? 'text-red-600' :
                      parseFloat(ci.counted_qty) > ci.expected_qty ? 'text-amber-600' : 'text-green-600'
                    }`}>
                      {parseFloat(ci.counted_qty) >= ci.expected_qty ? '+' : ''}
                      {(parseFloat(ci.counted_qty) - ci.expected_qty).toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="p-5 border-t space-y-3">
              <input value={countNotes} onChange={e => setCountNotes(e.target.value)}
                placeholder="Notas del conteo (opcional)"
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              <div className="flex gap-3">
                <button onClick={() => setShowCount(false)}
                  className="flex-1 border text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={submitCount} disabled={submitting}
                  className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-60">
                  {submitting ? 'Enviando...' : 'Enviar al admin'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
