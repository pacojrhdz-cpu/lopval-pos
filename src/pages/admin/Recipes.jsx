import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Trash2, X, Check, ChevronDown, ChevronRight, BookOpen } from 'lucide-react'

export default function Recipes() {
  const [products,    setProducts]    = useState([])
  const [ingredients, setIngredients] = useState([])
  const [recipes,     setRecipes]     = useState({}) // { product_id: [recipe_items] }
  const [expanded,    setExpanded]    = useState(null)
  const [addingTo,    setAddingTo]    = useState(null)   // product_id being edited
  const [newItem,     setNewItem]     = useState({ ingredient_id: '', quantity: '', unit: '' })
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [search,      setSearch]      = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: p }, { data: i }, { data: r }] = await Promise.all([
      supabase.from('products').select('*, categories(name,icon)').eq('active', true).order('name'),
      supabase.from('ingredients').select('*').eq('active', true).order('name'),
      supabase.from('recipe_items').select('*, ingredients(name,unit)'),
    ])
    setProducts(p ?? [])
    setIngredients(i ?? [])
    // Agrupar receta por product_id
    const grouped = {}
    ;(r ?? []).forEach(item => {
      if (!grouped[item.product_id]) grouped[item.product_id] = []
      grouped[item.product_id].push(item)
    })
    setRecipes(grouped)
    setLoading(false)
  }

  async function addRecipeItem(productId) {
    if (!newItem.ingredient_id || !newItem.quantity) return
    setSaving(true)
    const ing = ingredients.find(i => i.id === newItem.ingredient_id)
    await supabase.from('recipe_items').insert({
      product_id:    productId,
      ingredient_id: newItem.ingredient_id,
      quantity:      parseFloat(newItem.quantity),
      unit:          newItem.unit || ing?.unit || 'pza',
    })
    setNewItem({ ingredient_id: '', quantity: '', unit: '' })
    setAddingTo(null)
    setSaving(false)
    fetchAll()
  }

  async function deleteRecipeItem(id) {
    await supabase.from('recipe_items').delete().eq('id', id)
    fetchAll()
  }

  // Calcular costo aproximado de receta
  function recipeCount(productId) { return (recipes[productId] ?? []).length }
  function recipeCost(productId) {
    return (recipes[productId] ?? []).reduce((s, ri) => {
      const ing = ingredients.find(i => i.id === ri.ingredient_id)
      return s + (ing?.cost_per_unit ?? 0) * ri.quantity
    }, 0)
  }

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-red-600" />
        <h1 className="text-2xl font-bold text-gray-900">Recetario</h1>
      </div>
      <p className="text-gray-500 text-sm -mt-3">Define los ingredientes y cantidades por producto para calcular costos.</p>

      {/* Búsqueda */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Buscar producto..."
        className="w-full border rounded-xl px-4 py-2.5 text-sm shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />

      {/* Lista de productos */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(product => {
            const items = recipes[product.id] ?? []
            const isExpanded = expanded === product.id
            const cost = recipeCost(product.id)

            return (
              <div key={product.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Header del producto */}
                <button
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setExpanded(isExpanded ? null : product.id)}
                >
                  <span className="text-2xl">{product.categories?.icon ?? '🍽️'}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{product.name}</p>
                    <p className="text-xs text-gray-400">
                      {recipeCount(product.id)} ingrediente{recipeCount(product.id) !== 1 ? 's' : ''}
                      {cost > 0 && ` · Costo aprox. $${cost.toFixed(2)}`}
                    </p>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>

                {/* Receta detalle */}
                {isExpanded && (
                  <div className="border-t px-5 py-4 space-y-3">
                    {items.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-2">Sin ingredientes definidos</p>
                    )}
                    {items.map(ri => (
                      <div key={ri.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{ri.ingredients?.name ?? ri.ingredient_id}</p>
                          <p className="text-xs text-gray-500">{ri.quantity} {ri.unit}</p>
                        </div>
                        <button onClick={() => deleteRecipeItem(ri.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {/* Formulario para agregar ingrediente */}
                    {addingTo === product.id ? (
                      <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-2">
                        <select
                          value={newItem.ingredient_id}
                          onChange={e => {
                            const ing = ingredients.find(i => i.id === e.target.value)
                            setNewItem(n => ({ ...n, ingredient_id: e.target.value, unit: ing?.unit ?? '' }))
                          }}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                        >
                          <option value="">Seleccionar insumo...</option>
                          {ingredients.map(i => (
                            <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <input type="number" min="0" step="0.001" value={newItem.quantity}
                            onChange={e => setNewItem(n => ({...n, quantity: e.target.value}))}
                            placeholder="Cantidad" className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                          <input value={newItem.unit} onChange={e => setNewItem(n => ({...n, unit: e.target.value}))}
                            placeholder="Unidad" className="w-24 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setAddingTo(null)} className="flex-1 border text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors">
                            Cancelar
                          </button>
                          <button onClick={() => addRecipeItem(product.id)} disabled={saving}
                            className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            Agregar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingTo(product.id); setNewItem({ ingredient_id: '', quantity: '', unit: '' }) }}
                        className="w-full flex items-center justify-center gap-2 border border-dashed border-red-300 text-red-500 rounded-xl py-2.5 text-sm hover:bg-red-50 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Agregar ingrediente
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">Sin productos</div>
          )}
        </div>
      )}
    </div>
  )
}
