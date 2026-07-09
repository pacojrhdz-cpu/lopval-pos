import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { mxn } from '../../utils/format'
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Tag,
  CreditCard, Banknote, Smartphone, X, CheckCircle, Clock,
  Printer, BookOpen, Scissors, ChefHat
} from 'lucide-react'

const CAT_COLORS = {
  'Pizzas':    'bg-stone-100 text-stone-700 ring-stone-200',
  'Pastas':    'bg-amber-100 text-amber-700 ring-amber-200',
  'Ensaladas': 'bg-green-100 text-green-700 ring-green-200',
  'Bebidas':   'bg-blue-100 text-blue-700 ring-blue-200',
  'Postres':   'bg-purple-100 text-purple-700 ring-purple-200',
  'Extras':    'bg-yellow-100 text-yellow-700 ring-yellow-200',
}

export default function POS() {
  const { user, profile, activeBranch } = useAuth()
  const navigate = useNavigate()
  const [categories,       setCategories]       = useState([])
  const [products,         setProducts]         = useState([])
  const [selCat,           setSelCat]           = useState('Todos')
  const [search,           setSearch]           = useState('')
  const [cart,             setCart]             = useState([])
  const [discount,         setDiscount]         = useState('')
  const [discReason,       setDiscReason]       = useState('')
  const [showPayment,      setShowPayment]      = useState(false)
  const [lastSale,         setLastSale]         = useState(null)
  const [recentSales,      setRecentSales]      = useState([])
  const [cashRegister,     setCashRegister]     = useState(null)
  const [checkingRegister, setCheckingRegister] = useState(true)
  const [showCorte,        setShowCorte]        = useState(false)
  const [sendingCmd,       setSendingCmd]       = useState(false)
  const [cmdSent,          setCmdSent]          = useState(false)
  const [pendingProduct,   setPendingProduct]   = useState(null)  // producto esperando selección de modificadores

  useEffect(() => {
    fetchCategories()
    fetchProductsWithMods()
    fetchRecentSales()
    if (user) fetchCashRegister()
  }, [user])

  async function fetchCashRegister() {
    const { data } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('cashier_id', user.id)
      .eq('status', 'open')
      .order('opening_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setCashRegister(data ?? null)
    setCheckingRegister(false)
  }

  async function fetchCategories() {
    let q = supabase.from('categories').select('*').eq('active', true).order('sort_order')
    if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id)
    const { data } = await q
    setCategories(data ?? [])
  }
  async function fetchProductsWithMods() {
    let q = supabase.from('products').select('*, categories(name,icon,color)').eq('active', true).order('name')
    if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id)
    const { data: prods } = await q

    // Cargar grupos de modificadores asignados a cada producto
    const { data: assignments } = await supabase
      .from('product_modifier_group_assignments')
      .select('product_id, sort_order, modifier_groups(id, name, min_select, max_select, modifiers(id, name, price, active))')
      .order('sort_order')

    // Indexar por producto
    const modMap = {}
    for (const a of assignments ?? []) {
      if (!a.modifier_groups) continue
      if (!modMap[a.product_id]) modMap[a.product_id] = []
      modMap[a.product_id].push(a.modifier_groups)
    }

    setProducts((prods ?? []).map(p => ({ ...p, modifier_groups: modMap[p.id] ?? [] })))
  }
  async function fetchRecentSales() {
    const { data } = await supabase.from('sales').select('id,created_at,total,payment_method').order('created_at', { ascending: false }).limit(5)
    setRecentSales(data ?? [])
  }

  const filtered = products.filter(p => {
    const matchCat    = selCat === 'Todos' || p.categories?.name === selCat
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const addToCart = useCallback((product, selectedMods = []) => {
    if (product.modifier_groups?.length > 0 && selectedMods.length === 0) {
      // Mostrar modal de modificadores
      setPendingProduct(product)
      return
    }
    const modPrice  = selectedMods.reduce((s, m) => s + Number(m.price), 0)
    const finalPrice = Number(product.price) + modPrice
    const cartKey   = product.id + (selectedMods.length ? '|' + selectedMods.map(m => m.id).join(',') : '')
    setCart(prev => {
      const idx = prev.findIndex(i => i.cartKey === cartKey)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { ...product, cartKey, price: finalPrice, mods: selectedMods, qty: 1 }]
    })
  }, [])

  const updateQty  = (cartKey, delta) => setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0))
  const removeItem = (cartKey)        => setCart(prev => prev.filter(i => i.cartKey !== cartKey))
  const clearCart  = ()          => { setCart([]); setDiscount(''); setDiscReason('') }

  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const discountAmt = Math.min(parseFloat(discount) || 0, subtotal)
  const total       = subtotal - discountAmt

  async function sendComanda() {
    if (cart.length === 0) return
    setSendingCmd(true)
    const { error } = await supabase.from('kitchen_tickets').insert({
      branch_id:    activeBranch?.id ?? null,
      ticket_label: 'POS',
      items:        cart.map(i => ({ name: i.name, qty: i.qty })),
      source:       'pos',
    })
    setSendingCmd(false)
    if (error) { alert('Error comanda: ' + error.message); return }
    setCmdSent(true)
    setTimeout(() => setCmdSent(false), 3000)
  }

  async function completeSale(paymentMethod, platformName, cashReceived) {
    const changeGiven = paymentMethod === 'efectivo' ? (cashReceived - total) : 0
    const { data: sale, error } = await supabase.from('sales').insert({
      cashier_id:       user?.id,
      cashier_name:     profile?.name ?? 'Cajero',
      cash_register_id: cashRegister?.id ?? null,
      branch_id:        activeBranch?.id ?? null,
      branch_name:      activeBranch?.name ?? null,
      subtotal,
      discount:         discountAmt,
      discount_reason:  discReason || null,
      total,
      payment_method:   paymentMethod,
      platform_name:    platformName || null,
      cash_received:    paymentMethod === 'efectivo' ? cashReceived : null,
      change_given:     paymentMethod === 'efectivo' ? changeGiven  : null,
      status:           'completed',
    }).select().single()

    if (error) throw error

    await supabase.from('sale_items').insert(
      cart.map(i => ({
        sale_id:      sale.id,
        product_id:   i.id,
        product_name: i.mods?.length
          ? `${i.name} (${i.mods.map(m => m.name).join(', ')})`
          : i.name,
        quantity:     i.qty,
        unit_price:   i.price,
        subtotal:     i.price * i.qty,
      }))
    )

    // Enviar comanda a cocina
    await supabase.from('kitchen_tickets').insert({
      branch_id:    activeBranch?.id ?? null,
      ticket_label: 'POS',
      items:        cart.map(i => ({ name: i.name, qty: i.qty })),
      source:       'pos',
      reference_id: sale.id,
    })

    setLastSale({ ...sale, items: cart, change: changeGiven, cashier: profile?.name ?? 'Cajero', branchName: activeBranch?.name })
    clearCart()
    setShowPayment(false)
    fetchRecentSales()
  }

  // ── Loading ──
  if (checkingRegister) {
    return (
      <div className="min-h-full flex items-center justify-center" style={{ background: '#faf8f4' }}>
        <p className="text-gray-400 animate-pulse">Verificando turno...</p>
      </div>
    )
  }

  // ── Apertura de caja obligatoria ──
  if (!cashRegister) {
    return (
      <AperturaOverlay
        userId={user?.id}
        cashierName={profile?.name ?? 'Cajero'}
        branchId={activeBranch?.id}
        branchName={activeBranch?.name}
        onOpen={reg => setCashRegister(reg)}
      />
    )
  }

  return (
    <div className="flex h-full">
      {/* ── Panel izquierdo ── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 bg-white">

        <div className="p-4 bg-white border-b flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <button
            onClick={() => navigate('/pos/cuentas')}
            className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
          >
            <BookOpen className="w-4 h-4" /> Cuentas
          </button>
          <button
            onClick={() => setShowCorte(true)}
            className="flex items-center gap-2 px-3 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Scissors className="w-4 h-4" /> Corte
          </button>
        </div>

        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide bg-white border-b">
          {['Todos', ...categories.map(c => c.name)].map(cat => (
            <button
              key={cat}
              onClick={() => setSelCat(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selCat === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{ background: '#faf8f4' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(product => {
              const inCart   = cart.find(i => i.id === product.id)
              const colorCls = CAT_COLORS[product.categories?.name] ?? 'bg-gray-100 text-gray-700 ring-gray-200'
              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`
                    relative bg-white rounded-2xl p-3 shadow-sm border text-left
                    hover:shadow-md active:scale-95 transition-all
                    ${inCart ? 'border-gray-800 ring-2 ring-gray-200' : 'border-gray-100 hover:border-gray-300'}
                  `}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-2 ring-1 ${colorCls}`}>
                    {product.categories?.icon ?? '🍽️'}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{product.name}</p>
                  <p className="text-gray-800 font-bold mt-1">{mxn(product.price)}</p>
                  {inCart && (
                    <span className="absolute top-2 right-2 bg-gray-900 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                      {inCart.qty}
                    </span>
                  )}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-400">
                <p className="text-4xl mb-2">🔍</p>
                <p>Sin resultados</p>
              </div>
            )}
          </div>
        </div>

        {recentSales.length > 0 && !cart.length && (
          <div className="px-4 pb-4 bg-white border-t">
            <p className="text-xs text-gray-500 mt-3 mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Últimas ventas</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {recentSales.map(s => (
                <div key={s.id} className="flex-shrink-0 bg-gray-50 border rounded-xl px-3 py-2 text-xs">
                  <p className="font-bold text-gray-800">{mxn(s.total)}</p>
                  <p className="text-gray-400">{new Date(s.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Panel derecho: carrito ── */}
      <div className="w-80 flex flex-col bg-white">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <ShoppingCart className="w-5 h-5 text-gray-700" />
          <h2 className="font-semibold text-gray-800">Orden actual</h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="ml-auto text-gray-400 hover:text-gray-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 p-8">
              <ShoppingCart className="w-14 h-14 mb-3" />
              <p className="text-sm">Selecciona productos del menú</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {cart.map(item => (
                <div key={item.cartKey} className="flex items-start gap-2 bg-gray-50 rounded-xl p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                    {item.mods?.length > 0 && (
                      <p className="text-xs text-amber-600 truncate">
                        + {item.mods.map(m => m.name).join(', ')}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">{mxn(item.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.cartKey, -1)} className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.qty}</span>
                    <button onClick={() => updateQty(item.cartKey, 1)} className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors">
                      <Plus className="w-3 h-3" />
                    </button>
                    <button onClick={() => removeItem(item.cartKey)} className="w-7 h-7 rounded-full hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-500 ml-1 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-gray-800 w-14 text-right">{mxn(item.price * item.qty)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="px-3 pb-2 border-t pt-3">
            <div className="flex gap-2 items-center">
              <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="number" min="0" max={subtotal} value={discount}
                onChange={e => setDiscount(e.target.value)}
                placeholder="Descuento $"
                className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
              <input
                value={discReason} onChange={e => setDiscReason(e.target.value)}
                placeholder="Motivo"
                className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          </div>
        )}

        {cart.length > 0 && (
          <div className="p-4 border-t space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span><span>{mxn(subtotal)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-sm text-amber-600">
                <span>Descuento</span><span>-{mxn(discountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg text-gray-900 border-t pt-2">
              <span>Total</span><span>{mxn(total)}</span>
            </div>
            <button
              onClick={sendComanda}
              disabled={sendingCmd}
              className={`w-full font-medium rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2
                ${cmdSent
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 disabled:opacity-50'}`}
            >
              <ChefHat className="w-4 h-4" />
              {cmdSent ? '¡Comanda enviada!' : sendingCmd ? 'Enviando...' : 'Mandar comanda a cocina'}
            </button>
            <button
              onClick={() => setShowPayment(true)}
              className="w-full bg-gray-900 hover:bg-gray-800 active:bg-black text-white font-bold rounded-xl py-3.5 transition-colors text-base"
            >
              Cobrar {mxn(total)}
            </button>
          </div>
        )}
      </div>

      {pendingProduct && (
        <ModifierModal
          product={pendingProduct}
          onConfirm={mods => { setPendingProduct(null); addToCart(pendingProduct, mods) }}
          onClose={() => setPendingProduct(null)}
        />
      )}
      {showPayment && <PaymentModal total={total} onClose={() => setShowPayment(false)} onComplete={completeSale} />}
      {lastSale    && <SuccessModal sale={lastSale} onClose={() => setLastSale(null)} />}
      {showCorte   && (
        <CorteModal
          cashRegister={cashRegister}
          onClose={() => setShowCorte(false)}
          onClosed={() => { setCashRegister(null); setCheckingRegister(false); setShowCorte(false) }}
        />
      )}
    </div>
  )
}

// ─── Modifier Modal ───────────────────────────────────────────
function ModifierModal({ product, onConfirm, onClose }) {
  const groups = product.modifier_groups ?? []
  const [selected, setSelected] = useState({}) // { groupId: [modifierId, ...] }

  function toggle(group, mod) {
    setSelected(prev => {
      const cur = prev[group.id] ?? []
      const has = cur.includes(mod.id)
      let next
      if (group.max_select === 1) {
        // Radio — solo uno por grupo
        next = has ? [] : [mod.id]
      } else {
        if (has) {
          next = cur.filter(id => id !== mod.id)
        } else {
          if (group.max_select && cur.length >= group.max_select) return prev
          next = [...cur, mod.id]
        }
      }
      return { ...prev, [group.id]: next }
    })
  }

  const allMods    = groups.flatMap(g => g.modifiers ?? [])
  const selectedIds = Object.values(selected).flat()
  const chosenMods  = allMods.filter(m => selectedIds.includes(m.id))
  const extraPrice  = chosenMods.reduce((s, m) => s + Number(m.price), 0)
  const finalPrice  = Number(product.price) + extraPrice

  const canConfirm = groups.every(g => {
    const cnt = (selected[g.id] ?? []).length
    return cnt >= (g.min_select ?? 0)
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <div>
            <h2 className="font-bold text-gray-900">{product.name}</h2>
            <p className="text-sm text-gray-500">Personaliza tu orden</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
          {groups.map(group => {
            const activeMods = (group.modifiers ?? []).filter(m => m.active !== false)
            return (
              <div key={group.id}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-gray-800 text-sm">{group.name}</p>
                  <span className="text-xs text-gray-400">
                    {group.min_select > 0 ? `Mín ${group.min_select}` : 'Opcional'}
                    {group.max_select ? ` · Máx ${group.max_select}` : ''}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {activeMods.map(mod => {
                    const isSelected = (selected[group.id] ?? []).includes(mod.id)
                    return (
                      <button
                        key={mod.id}
                        onClick={() => toggle(group, mod)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                          isSelected
                            ? 'border-gray-800 bg-gray-900 text-white'
                            : 'border-gray-200 hover:border-gray-400 text-gray-700'
                        }`}
                      >
                        <span>{mod.name}</span>
                        <span className={isSelected ? 'text-gray-300' : 'text-gray-500'}>
                          {Number(mod.price) > 0 ? `+${mxn(mod.price)}` : 'Incluido'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Precio base</span><span>{mxn(product.price)}</span>
          </div>
          {extraPrice > 0 && (
            <div className="flex justify-between text-sm text-amber-600">
              <span>Extras</span><span>+{mxn(extraPrice)}</span>
            </div>
          )}
          <button
            onClick={() => onConfirm(chosenMods)}
            disabled={!canConfirm}
            className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white font-bold rounded-xl py-3.5 transition-colors"
          >
            Agregar — {mxn(finalPrice)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Apertura de Caja ─────────────────────────────────────────
function AperturaOverlay({ userId, cashierName, branchId, branchName, onOpen }) {
  const [amount, setAmount] = useState('')
  const [notes,  setNotes]  = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleOpen(e) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt < 0) { setError('Ingresa un monto válido'); return }
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.from('cash_registers').insert({
      cashier_id:     userId,
      cashier_name:   cashierName,
      branch_id:      branchId   || null,
      branch_name:    branchName || null,
      opening_amount: amt,
      notes:          notes || null,
      status:         'open',
    }).select().single()
    if (err) { setError('Error al abrir caja. Intenta de nuevo.'); setSaving(false); return }
    onOpen(data)
  }

  return (
    <div className="min-h-full flex items-center justify-center p-4" style={{ background: '#faf8f4' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">💵</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Apertura de caja</h1>
          <p className="text-sm text-gray-500 mt-1">Ingresa el efectivo en caja al iniciar tu turno</p>
        </div>

        <form onSubmit={handleOpen} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">Efectivo en caja</label>
            <input
              type="number" min="0" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="$0.00"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <div className="grid grid-cols-4 gap-2 mt-2">
              {[0, 200, 500, 1000].map(v => (
                <button key={v} type="button" onClick={() => setAmount(String(v))}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-1.5 text-sm font-medium transition-colors">
                  ${v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">Notas (opcional)</label>
            <input
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Observaciones del turno"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-bold rounded-xl py-3.5 transition-colors">
            {saving ? 'Abriendo...' : 'Abrir caja e iniciar turno'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Corte de Caja ────────────────────────────────────────────
function CorteModal({ cashRegister, onClose, onClosed }) {
  const { activeBranch } = useAuth()
  const [summary,    setSummary]    = useState(null)
  const [closingAmt, setClosingAmt] = useState('')
  const [notes,      setNotes]      = useState('')
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => { fetchSummary() }, [])

  async function fetchSummary() {
    setLoading(true)

    // Usar activeBranch del contexto como fuente principal de branch_id.
    // cashRegister.branch_id puede ser null en registros viejos, por eso
    // activeBranch es el fallback seguro — ambos admins siempre ven lo mismo.
    const branchId = activeBranch?.id ?? cashRegister.branch_id
    let sinceDate = cashRegister.opening_at  // fallback: apertura de este registro

    if (branchId) {
      const { data: lastClosed } = await supabase
        .from('cash_registers')
        .select('closing_at')
        .eq('branch_id', branchId)
        .eq('status', 'closed')
        .order('closing_at', { ascending: false })
        .limit(1)
      if (lastClosed?.[0]?.closing_at) sinceDate = lastClosed[0].closing_at
    }

    const { data } = await supabase
      .from('sales')
      .select('total, payment_method, payments')
      .eq('branch_id', branchId)
      .gte('created_at', sinceDate)
      .eq('status', 'completed')

    const s = (data ?? []).reduce((acc, sale) => {
      acc.total += Number(sale.total)
      acc.count += 1
      // Pagos mixtos: sumar cada método por su monto real
      if (sale.payment_method === 'mixto' && Array.isArray(sale.payments)) {
        for (const p of sale.payments) {
          if (p.method === 'efectivo')   acc.efectivo   += Number(p.amount)
          if (p.method === 'tarjeta')    acc.tarjeta    += Number(p.amount)
          if (p.method === 'plataforma') acc.plataforma += Number(p.amount)
        }
      } else {
        if (sale.payment_method === 'efectivo')   acc.efectivo   += Number(sale.total)
        if (sale.payment_method === 'tarjeta')    acc.tarjeta    += Number(sale.total)
        if (sale.payment_method === 'plataforma') acc.plataforma += Number(sale.total)
      }
      return acc
    }, { total: 0, count: 0, efectivo: 0, tarjeta: 0, plataforma: 0 })

    setSummary(s)
    setLoading(false)
  }

  async function handleClose() {
    const amt = parseFloat(closingAmt)
    if (isNaN(amt) || amt < 0) { setError('Ingresa el efectivo contado'); return }
    setSaving(true)
    const expectedCash = Number(cashRegister.opening_amount) + (summary?.efectivo ?? 0)
    const difference   = amt - expectedCash
    const branchId = activeBranch?.id ?? cashRegister.branch_id
    await supabase.from('cash_registers').update({
      status:         'closed',
      closing_amount: amt,
      closing_at:     new Date().toISOString(),
      total_sales:    summary?.total     ?? 0,
      total_cash:     summary?.efectivo  ?? 0,
      total_card:     summary?.tarjeta   ?? 0,
      total_platform: summary?.plataforma ?? 0,
      difference,
      notes:          notes || null,
      // Parchar branch_id si quedó null en apertura (registros viejos)
      ...(branchId && !cashRegister.branch_id ? { branch_id: branchId } : {}),
    }).eq('id', cashRegister.id)
    onClosed()
  }

  const expectedCash = Number(cashRegister.opening_amount) + (summary?.efectivo ?? 0)
  const closingNum   = parseFloat(closingAmt) || 0
  const difference   = closingNum - expectedCash

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
            <Scissors className="w-5 h-5" /> Corte de caja
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 animate-pulse">Calculando resumen...</div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Resumen del turno</p>
              <Row label="Apertura de caja"    value={mxn(cashRegister.opening_amount)} />
              <Row label="Ventas en efectivo"  value={mxn(summary.efectivo)}  cls="text-green-700" />
              <Row label="Ventas con tarjeta"  value={mxn(summary.tarjeta)}   cls="text-blue-700" />
              <Row label="Plataformas"         value={mxn(summary.plataforma)} cls="text-purple-700" />
              <div className="border-t pt-2">
                <Row label={`Total ventas (${summary.count} órdenes)`} value={mxn(summary.total)} bold />
              </div>
              <div className="border-t pt-2">
                <Row label="Efectivo esperado en caja" value={mxn(expectedCash)} bold />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1.5">Efectivo contado en caja</label>
              <input
                type="number" min="0" step="0.01" value={closingAmt}
                onChange={e => setClosingAmt(e.target.value)}
                placeholder="$0.00" autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>

            {closingAmt !== '' && (
              <div className={`rounded-xl px-4 py-3 flex justify-between items-center ${
                Math.abs(difference) < 1 ? 'bg-green-50 border border-green-200' :
                difference < 0 ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'
              }`}>
                <span className="text-sm font-medium text-gray-700">Diferencia</span>
                <span className={`font-bold text-lg ${
                  Math.abs(difference) < 1 ? 'text-green-700' :
                  difference < 0 ? 'text-red-700' : 'text-amber-700'
                }`}>
                  {difference >= 0 ? '+' : ''}{mxn(difference)}
                </span>
              </div>
            )}

            <input
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Notas del turno (opcional)"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button onClick={handleClose} disabled={saving}
              className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-bold rounded-xl py-3.5 transition-colors">
              {saving ? 'Cerrando turno...' : 'Cerrar turno'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, cls = 'text-gray-800', bold = false }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  )
}

// ─── Modal de Pago ────────────────────────────────────────────
function PaymentModal({ total, onClose, onComplete }) {
  const [method,   setMethod]   = useState('efectivo')
  const [platform, setPlatform] = useState('')
  const [cash,     setCash]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const cashNum   = parseFloat(cash) || 0
  const change    = cashNum - total
  const validCash = method !== 'efectivo' || cashNum >= total

  async function handleConfirm() {
    if (!validCash) { setError('El efectivo recibido es menor al total'); return }
    if (method === 'plataforma' && !platform) { setError('Selecciona la plataforma'); return }
    setLoading(true); setError('')
    try { await onComplete(method, platform, cashNum) }
    catch { setError('Error al guardar la venta. Intenta de nuevo.'); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="font-bold text-gray-800 text-lg">Método de pago</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-center text-3xl font-black text-gray-900">{mxn(total)}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'efectivo',   icon: Banknote,   label: 'Efectivo'   },
              { id: 'tarjeta',    icon: CreditCard, label: 'Tarjeta'    },
              { id: 'plataforma', icon: Smartphone, label: 'Plataforma' },
            ].map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setMethod(id)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                  method === id ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
          {method === 'efectivo' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Efectivo recibido</label>
              <input type="number" value={cash} onChange={e => setCash(e.target.value)}
                placeholder="$0.00" autoFocus
                className="w-full border rounded-xl px-4 py-2.5 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-gray-400" />
              <div className="flex gap-2 mt-2">
                {[50,100,200,500].map(v => (
                  <button key={v} onClick={() => setCash(String(v))}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-1.5 text-sm font-medium transition-colors">
                    ${v}
                  </button>
                ))}
              </div>
              {cashNum >= total && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-center">
                  <p className="text-sm text-green-700">Cambio: <span className="font-bold text-lg">{mxn(change)}</span></p>
                </div>
              )}
            </div>
          )}
          {method === 'plataforma' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Plataforma</label>
              <select value={platform} onChange={e => setPlatform(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-400">
                <option value="">Seleccionar...</option>
                <option>Rappi</option><option>Uber Eats</option><option>Mercado Pago</option>
                <option>DiDi Food</option><option>WhatsApp / Teléfono</option><option>Otra</option>
              </select>
            </div>
          )}
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button onClick={handleConfirm} disabled={loading}
            className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-bold rounded-xl py-3.5 transition-colors">
            {loading ? 'Procesando...' : 'Confirmar venta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de Éxito + Ticket ──────────────────────────────────
function SuccessModal({ sale, onClose }) {
  const methodLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', plataforma: sale.platform_name }
  const now = new Date()

  useEffect(() => {
    const timer = setTimeout(() => window.print(), 600)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 no-print">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm text-center p-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">¡Venta registrada!</h2>
          <p className="text-3xl font-black text-gray-900 mb-3">{mxn(sale.total)}</p>
          <p className="text-sm text-gray-500 mb-1">Pago: {methodLabel[sale.payment_method]}</p>
          {sale.change > 0 && (
            <p className="text-sm font-semibold text-green-700 mb-4">Cambio: {mxn(sale.change)}</p>
          )}
          <div className="text-left bg-gray-50 rounded-xl p-3 mb-4 text-xs space-y-1">
            {sale.items?.map(i => (
              <div key={i.id} className="flex justify-between text-gray-600">
                <span>{i.name} x{i.qty}</span><span>{mxn(i.price * i.qty)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()}
              className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-3 text-sm font-medium transition-colors">
              <Printer className="w-4 h-4" /> Reimprimir
            </button>
            <button onClick={onClose}
              className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl py-3 transition-colors">
              Nueva venta
            </button>
          </div>
        </div>
      </div>

      <div className="print-only ticket">
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0' }}>{sale.branchName ?? 'Pizza & Totó'}</p>
          <p style={{ fontSize: '10px', margin: '2px 0' }}>Grupo Lopval</p>
          <p style={{ fontSize: '9px', color: '#555', margin: '2px 0' }}>
            {now.toLocaleDateString('es-MX')} {now.toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'})}
          </p>
          {sale.cashier && <p style={{ fontSize: '9px', color: '#555', margin: '2px 0' }}>Cajero: {sale.cashier}</p>}
        </div>
        <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', margin: '6px 0' }}>
          {sale.items?.map((i, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
              <span>{i.name} x{i.qty}</span><span>{mxn(i.price * i.qty)}</span>
            </div>
          ))}
        </div>
        {sale.discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
            <span>Descuento</span><span>-{mxn(sale.discount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', borderTop: '1px solid #000', paddingTop: '4px', marginTop: '4px' }}>
          <span>TOTAL</span><span>{mxn(sale.total)}</span>
        </div>
        <div style={{ marginTop: '6px', fontSize: '10px' }}>
          <p style={{ margin: '2px 0' }}>Pago: {methodLabel[sale.payment_method]}</p>
          {sale.change > 0 && <p style={{ margin: '2px 0' }}>Cambio: {mxn(sale.change)}</p>}
        </div>
        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '9px', color: '#555' }}>
          <p>¡Gracias por su visita!</p><p>Vuelva pronto</p>
        </div>
      </div>
    </>
  )
}
