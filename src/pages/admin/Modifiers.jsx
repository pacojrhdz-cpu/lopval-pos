import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { mxn } from '../../utils/format'
import {
  Plus, Pencil, Trash2, X, Check,
  ChevronDown, ChevronRight, Package, Sliders, Link2
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

// ─── Tab 1: Biblioteca de grupos ──────────────────────────────────────────────
function LibraryTab({ activeBranch }) {
  const [groups,       setGroups]       = useState([])
  const [expanded,     setExpanded]     = useState(null)
  const [loading,      setLoading]      = useState(true)

  const [editGroup,    setEditGroup]    = useState(null)
  const [groupForm,    setGroupForm]    = useState({ name: '', required: false, multi_select: true, sort_order: 0 })
  const [savingGroup,  setSavingGroup]  = useState(false)

  const [editMod,      setEditMod]      = useState(null)
  const [modForm,      setModForm]      = useState({ name: '', price_extra: 0, sort_order: 0, groupId: null })
  const [savingMod,    setSavingMod]    = useState(false)

  const [error, setError] = useState('')

  useEffect(() => { fetchGroups() }, [activeBranch])

  async function fetchGroups() {
    setLoading(true)
    let q = supabase
      .from('modifier_groups')
      .select('*, modifiers(*)')
      .order('sort_order')
    if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id)
    const { data } = await q
    setGroups(data ?? [])
    setLoading(false)
  }

  // ── Group CRUD ──
  function openNewGroup() {
    setGroupForm({ name: '', required: false, multi_select: true, sort_order: groups.length })
    setEditGroup('new')
    setError('')
  }
  function openEditGroup(g) {
    setGroupForm({ name: g.name, required: g.required, multi_select: g.multi_select, sort_order: g.sort_order })
    setEditGroup(g)
    setError('')
  }
  async function saveGroup() {
    if (!groupForm.name.trim()) { setError('Nombre obligatorio'); return }
    setSavingGroup(true); setError('')
    const payload = {
      branch_id:    activeBranch?.id ?? null,
      product_id:   null, // grupos independientes, no atados a producto
      name:         groupForm.name.trim(),
      required:     groupForm.required,
      multi_select: groupForm.multi_select,
      sort_order:   parseInt(groupForm.sort_order) || 0,
    }
    let err
    if (editGroup === 'new') {
      ;({ error: err } = await supabase.from('modifier_groups').insert(payload))
    } else {
      ;({ error: err } = await supabase.from('modifier_groups').update({
        name: payload.name, required: payload.required,
        multi_select: payload.multi_select, sort_order: payload.sort_order,
      }).eq('id', editGroup.id))
    }
    if (err) { setError(err.message); setSavingGroup(false); return }
    await fetchGroups()
    setEditGroup(null)
    setSavingGroup(false)
  }
  async function deleteGroup(g) {
    if (!confirm(`¿Eliminar grupo "${g.name}"? Se quitará de todos los productos.`)) return
    await supabase.from('modifier_groups').delete().eq('id', g.id)
    fetchGroups()
  }

  // ── Modifier CRUD ──
  function openNewMod(groupId) {
    const g = groups.find(x => x.id === groupId)
    setModForm({ name: '', price_extra: 0, sort_order: (g?.modifiers?.length ?? 0), groupId })
    setEditMod('new')
    setError('')
  }
  function openEditMod(mod, groupId) {
    setModForm({ name: mod.name, price_extra: mod.price_extra, sort_order: mod.sort_order, groupId })
    setEditMod(mod)
    setError('')
  }
  async function saveMod() {
    if (!modForm.name.trim()) { setError('Nombre obligatorio'); return }
    setSavingMod(true); setError('')
    const payload = {
      group_id:    modForm.groupId,
      name:        modForm.name.trim(),
      price_extra: parseFloat(modForm.price_extra) || 0,
      sort_order:  parseInt(modForm.sort_order) || 0,
    }
    let err
    if (editMod === 'new') {
      ;({ error: err } = await supabase.from('modifiers').insert(payload))
    } else {
      ;({ error: err } = await supabase.from('modifiers').update(payload).eq('id', editMod.id))
    }
    if (err) { setError(err.message); setSavingMod(false); return }
    await fetchGroups()
    setEditMod(null)
    setSavingMod(false)
  }
  async function deleteMod(mod) {
    if (!confirm(`¿Eliminar opción "${mod.name}"?`)) return
    await supabase.from('modifiers').delete().eq('id', mod.id)
    fetchGroups()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Los grupos aquí creados se pueden asignar a cualquier producto desde la pestaña "Asignar".
        </p>
        <button onClick={openNewGroup}
          className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors flex-shrink-0 ml-4">
          <Plus className="w-4 h-4" /> Nuevo grupo
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
          <Sliders className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Sin grupos de modificadores</p>
          <p className="text-xs mt-1">Ej: "Elige tu salsa", "Extras", "Término de cocción"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setExpanded(expanded === g.id ? null : g.id)} className="text-gray-400">
                  {expanded === g.id
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronRight className="w-4 h-4" />}
                </button>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{g.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {g.required ? '● Obligatorio' : '○ Opcional'} &nbsp;·&nbsp;
                    {g.multi_select ? 'Selección múltiple' : 'Selección única'} &nbsp;·&nbsp;
                    {g.modifiers?.length ?? 0} opciones
                  </p>
                </div>
                <button onClick={() => openEditGroup(g)} className="text-gray-400 hover:text-blue-600 transition-colors p-1">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => deleteGroup(g)} className="text-gray-400 hover:text-red-600 transition-colors p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {expanded === g.id && (
                <div className="border-t bg-gray-50 px-4 py-3 space-y-2">
                  {(g.modifiers ?? []).sort((a, b) => a.sort_order - b.sort_order).map(mod => (
                    <div key={mod.id} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 shadow-sm">
                      <span className="flex-1 text-sm text-gray-800">{mod.name}</span>
                      <span className={`text-sm font-medium ${mod.price_extra > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                        {mod.price_extra > 0 ? `+${mxn(mod.price_extra)}` : 'Gratis'}
                      </span>
                      <button onClick={() => openEditMod(mod, g.id)} className="text-gray-400 hover:text-blue-600 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteMod(mod)} className="text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => openNewMod(g.id)}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 hover:border-red-400 hover:text-red-600 text-gray-400 rounded-xl py-2 text-sm transition-colors">
                    <Plus className="w-4 h-4" /> Agregar opción
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: grupo */}
      {editGroup !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
              <h2 className="font-bold text-gray-800">{editGroup === 'new' ? 'Nuevo grupo' : 'Editar grupo'}</h2>
              <button onClick={() => setEditGroup(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <Field label="Nombre del grupo *">
                <input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="Ej: Elige tu salsa" autoFocus />
              </Field>
              <Field label="Orden">
                <input type="number" min="0" value={groupForm.sort_order}
                  onChange={e => setGroupForm(f => ({ ...f, sort_order: e.target.value }))} className="input" />
              </Field>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={groupForm.required}
                  onChange={e => setGroupForm(f => ({ ...f, required: e.target.checked }))} className="w-4 h-4 accent-red-600" />
                <span className="text-sm text-gray-700">Selección obligatoria al vender</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={groupForm.multi_select}
                  onChange={e => setGroupForm(f => ({ ...f, multi_select: e.target.checked }))} className="w-4 h-4 accent-red-600" />
                <span className="text-sm text-gray-700">Permite selección múltiple</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditGroup(null)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm transition-colors">
                  Cancelar
                </button>
                <button onClick={saveGroup} disabled={savingGroup}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" /> {savingGroup ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: modificador */}
      {editMod !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
              <h2 className="font-bold text-gray-800">{editMod === 'new' ? 'Nueva opción' : 'Editar opción'}</h2>
              <button onClick={() => setEditMod(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <Field label="Nombre *">
                <input value={modForm.name} onChange={e => setModForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="Ej: Habanero, Extra queso" autoFocus />
              </Field>
              <Field label="Precio extra (0 = gratis)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" min="0" step="0.50" value={modForm.price_extra}
                    onChange={e => setModForm(f => ({ ...f, price_extra: e.target.value }))}
                    className="input pl-7" placeholder="0.00" />
                </div>
              </Field>
              <Field label="Orden">
                <input type="number" min="0" value={modForm.sort_order}
                  onChange={e => setModForm(f => ({ ...f, sort_order: e.target.value }))} className="input" />
              </Field>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditMod(null)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm transition-colors">
                  Cancelar
                </button>
                <button onClick={saveMod} disabled={savingMod}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" /> {savingMod ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Asignar grupos a productos ────────────────────────────────────────
function AssignTab({ activeBranch }) {
  const [products,    setProducts]    = useState([])
  const [allGroups,   setAllGroups]   = useState([])
  const [selProduct,  setSelProduct]  = useState('')
  const [assignments, setAssignments] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [addGroupId,  setAddGroupId]  = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => { loadProducts(); loadGroups() }, [activeBranch])
  useEffect(() => {
    if (selProduct) loadAssignments()
    else setAssignments([])
  }, [selProduct])

  async function loadProducts() {
    let q = supabase.from('products').select('id, name').eq('active', true).order('name')
    if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id)
    const { data } = await q
    setProducts(data ?? [])
  }

  async function loadGroups() {
    let q = supabase.from('modifier_groups').select('id, name, required, multi_select').eq('active', true).order('name')
    if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id)
    const { data } = await q
    setAllGroups(data ?? [])
  }

  async function loadAssignments() {
    setLoading(true)
    const { data } = await supabase
      .from('product_modifier_group_assignments')
      .select('id, group_id, sort_order, modifier_groups(id, name, required, multi_select)')
      .eq('product_id', selProduct)
      .order('sort_order')
    setAssignments(data ?? [])
    setLoading(false)
  }

  async function addAssignment() {
    if (!addGroupId || !selProduct) return
    setSaving(true); setError('')
    const { error: err } = await supabase.from('product_modifier_group_assignments').insert({
      product_id: selProduct,
      group_id:   addGroupId,
      sort_order: assignments.length,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setAddGroupId('')
    await loadAssignments()
    setSaving(false)
  }

  async function removeAssignment(id) {
    await supabase.from('product_modifier_group_assignments').delete().eq('id', id)
    loadAssignments()
  }

  const assignedIds = new Set(assignments.map(a => a.group_id))
  const available   = allGroups.filter(g => !assignedIds.has(g.id))

  return (
    <div className="space-y-4">
      {/* Selector de producto */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="block text-sm text-gray-600 mb-2">
          Selecciona un producto para ver y editar sus grupos asignados
        </label>
        <select value={selProduct} onChange={e => setSelProduct(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
          <option value="">— Elige un producto —</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selProduct && (
        <div className="space-y-3">
          {/* Grupos asignados */}
          <p className="text-sm font-medium text-gray-700">Grupos asignados</p>
          {loading ? (
            <p className="text-center text-gray-400 py-4 text-sm">Cargando...</p>
          ) : assignments.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center text-gray-400 shadow-sm">
              <Link2 className="w-6 h-6 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin grupos asignados</p>
              <p className="text-xs mt-0.5">Agrega uno desde la biblioteca de abajo</p>
            </div>
          ) : (
            assignments.map((a, idx) => (
              <div key={a.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 px-4 py-3">
                <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-bold flex-shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{a.modifier_groups?.name}</p>
                  <p className="text-xs text-gray-400">
                    {a.modifier_groups?.required ? 'Obligatorio' : 'Opcional'} &nbsp;·&nbsp;
                    {a.modifier_groups?.multi_select ? 'Selección múltiple' : 'Selección única'}
                  </p>
                </div>
                <button onClick={() => removeAssignment(a.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}

          {/* Agregar desde biblioteca */}
          {allGroups.length === 0 ? (
            <p className="text-xs text-gray-400 text-center">
              No hay grupos en la biblioteca aún — crea uno en la pestaña "Grupos".
            </p>
          ) : available.length > 0 ? (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-sm text-gray-600 mb-2">Agregar grupo desde biblioteca</p>
              {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
              <div className="flex gap-2">
                <select value={addGroupId} onChange={e => setAddGroupId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                  <option value="">— Elige un grupo —</option>
                  {available.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button onClick={addAssignment} disabled={!addGroupId || saving}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm font-bold transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center">
              Todos los grupos de la biblioteca ya están asignados a este producto.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: Combos ────────────────────────────────────────────────────────────
function CombosTab({ activeBranch }) {
  const [combos,       setCombos]       = useState([])
  const [allProducts,  setAllProducts]  = useState([])
  const [selCombo,     setSelCombo]     = useState('')
  const [items,        setItems]        = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [addProd,      setAddProd]      = useState('')
  const [addQty,       setAddQty]       = useState(1)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  useEffect(() => {
    let q = supabase.from('products').select('id, name, price, is_combo').eq('active', true).order('name')
    if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id)
    q.then(({ data }) => {
      const all = data ?? []
      setAllProducts(all)
      setCombos(all.filter(p => p.is_combo))
    })
  }, [activeBranch])

  useEffect(() => {
    if (!selCombo) { setItems([]); return }
    fetchItems(selCombo)
  }, [selCombo])

  async function fetchItems(comboId) {
    const id = comboId ?? selCombo
    if (!id) return
    setLoadingItems(true)
    // Especificamos la FK exacta porque combo_items tiene dos referencias a products
    const { data } = await supabase
      .from('combo_items')
      .select('*, product:products!combo_items_product_id_fkey(name, price)')
      .eq('combo_product_id', id)
    setItems(data ?? [])
    setLoadingItems(false)
  }

  async function markAsCombo(productId, value) {
    await supabase.from('products').update({ is_combo: value }).eq('id', productId)
    let q = supabase.from('products').select('id, name, price, is_combo').eq('active', true).order('name')
    if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id)
    const { data } = await q
    const all = data ?? []
    setAllProducts(all)
    setCombos(all.filter(p => p.is_combo))
    if (!value && selCombo === productId) setSelCombo('')
  }

  async function addItem() {
    if (!addProd || !selCombo) return
    setSaving(true); setError('')
    const { error: err } = await supabase.from('combo_items').insert({
      combo_product_id: selCombo,
      product_id:       addProd,
      quantity:         parseInt(addQty) || 1,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setAddProd(''); setAddQty(1)
    await fetchItems()
    setSaving(false)
  }

  async function removeItem(id) {
    await supabase.from('combo_items').delete().eq('id', id)
    fetchItems()
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Productos marcados como combo/paquete</p>
        <p className="text-xs text-gray-400">Activa el toggle en los productos que quieres usar como paquetes</p>
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {allProducts.map(p => (
            <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-800">{p.name}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={!!p.is_combo}
                  onChange={e => markAsCombo(p.id, e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-red-600 rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {combos.length > 0 ? (
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-2">Selecciona un combo para editar sus componentes</label>
            <select value={selCombo} onChange={e => setSelCombo(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
              <option value="">— Elige un combo —</option>
              {combos.map(p => <option key={p.id} value={p.id}>{p.name} ({mxn(p.price)})</option>)}
            </select>
          </div>

          {selCombo && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <p className="text-sm font-medium text-gray-700">Componentes del paquete</p>
              </div>
              <div className="p-4 space-y-3">
                {loadingItems ? (
                  <p className="text-center text-gray-400 py-4 text-sm">Cargando...</p>
                ) : (
                  <div className="space-y-2">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                        <span className="flex-1 text-sm text-gray-800">{item.product?.name}</span>
                        <span className="text-xs text-gray-500">× {item.quantity}</span>
                        <button onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <p className="text-center text-gray-400 text-sm py-2">Sin componentes — agrega productos abajo</p>
                    )}
                  </div>
                )}

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <div className="flex gap-2 pt-2 border-t">
                  <select value={addProd} onChange={e => setAddProd(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                    <option value="">Agregar producto...</option>
                    {allProducts.filter(p => p.id !== selCombo).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input type="number" min="1" value={addQty} onChange={e => setAddQty(e.target.value)}
                    className="w-16 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 text-center" />
                  <button onClick={addItem} disabled={!addProd || saving}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm font-bold transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Aún no hay combos</p>
          <p className="text-xs mt-1">Activa el toggle en los productos de arriba para marcarlos como paquete</p>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Modifiers() {
  const { activeBranch } = useAuth()
  const [tab, setTab] = useState('grupos')

  const tabs = [
    { id: 'grupos',  label: '⚙️ Grupos',    desc: 'Biblioteca de modificadores' },
    { id: 'asignar', label: '🔗 Asignar',   desc: 'Asignar grupos a productos'  },
    { id: 'combos',  label: '📦 Combos',    desc: 'Paquetes y menús'            },
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Modificadores y Combos</h1>
        {activeBranch && <p className="text-sm text-gray-500 mt-0.5">{activeBranch.name}</p>}
      </div>

      <div className="flex gap-2 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'grupos'  && <LibraryTab  activeBranch={activeBranch} />}
      {tab === 'asignar' && <AssignTab   activeBranch={activeBranch} />}
      {tab === 'combos'  && <CombosTab   activeBranch={activeBranch} />}

      <style>{`.input{width:100%;border:1px solid #e5e7eb;border-radius:.75rem;padding:.625rem .75rem;font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px #fca5a5}`}</style>
    </div>
  )
}
