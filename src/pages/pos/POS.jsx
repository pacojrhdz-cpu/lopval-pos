import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { mxn } from '../../utils/format'
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Tag,
  CreditCard, Banknote, Smartphone, X, CheckCircle, Clock,
  Printer, BookOpen, Scissors, ChefHat, FileText, MessageSquare
} from 'lucide-react'
import InvoiceModal from '../../components/pos/InvoiceModal'
import { printTicket, printComanda } from '../../utils/thermalPrinter'

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
  const [showInvoice,      setShowInvoice]      = useState(false)
  const [sendingCmd,       setSendingCmd]       = useState(false)
  const [cmdSent,          setCmdSent]          = useState(false)
  const [pendingProduct,   setPendingProduct]   = useState(null)  // producto esperando selección de modificadores
  const [noteItem,         setNoteItem]         = useState(null)  // item del carrito en edición de notas

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

    const [{ data: assignments }, { data: combos }, { data: allProds }] = await Promise.all([
      supabase.from('product_modifier_group_assignments').select('product_id'),
      supabase.from('combo_items').select('combo_product_id, product_id, quantity'),
      supabase.from('products').select('id, name'),
    ])

    const hasMods   = new Set((assignments ?? []).map(a => a.product_id))
    const prodNames = Object.fromEntries((allProds ?? []).map(p => [p.id, p.name]))

    const comboMap = {}
    for (const ci of (combos ?? [])) {
      if (!comboMap[ci.combo_product_id]) comboMap[ci.combo_product_id] = []
      comboMap[ci.combo_product_id].push({
        ...ci,
        products: { name: prodNames[ci.product_id] ?? 'Producto' },
      })
    }

    setProducts((prods ?? []).map(p => ({
      ...p,
      hasMods:    hasMods.has(p.id),
      comboItems: comboMap[p.id] ?? [],
    })))
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

  const addToCart = useCallback((product, selectedMods = [], fromModal = false, comboItems = null) => {
    if (product.hasMods && selectedMods.length === 0 && !fromModal) {
      setPendingProduct(product)
      return
    }
    const extraPrice    = selectedMods.reduce((s, m) => s + Number(m.price_extra ?? 0), 0)
    const finalPrice    = Number(product.price) + extraPrice
    const cartKey       = product.id + (selectedMods.length ? '|' + selectedMods.map(m => m.id).sort().join(',') : '')
    const resolvedCombo = comboItems ?? product.comboItems ?? []
    setCart(prev => {
      const idx = prev.findIndex(i => i.cartKey === cartKey)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next
      }
      return [...prev, { ...product, cartKey, price: finalPrice, mods: selectedMods, comboItems: resolvedCombo, qty: 1 }]
    })
  }, [])

  const updateQty  = (cartKey, delta) => setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0))
  const removeItem = (cartKey)        => setCart(prev => prev.filter(i => i.cartKey !== cartKey))
  const updateNote = (cartKey, note)  => setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, note } : i))
  const clearCart  = ()          => { setCart([]); setDiscount(''); setDiscReason('') }

  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const discountAmt = Math.min(parseFloat(discount) || 0, subtotal)
  const total       = subtotal - discountAmt

  function buildItemNotes(i) {
    const parts = []
    if (i.mods?.length)       parts.push(i.mods.map(m => m.name).join(', '))
    if (i.comboItems?.length) parts.push('Incluye: ' + i.comboItems.map(c => `${c.products?.name} ×${c.quantity}`).join(', '))
    if (i.note)               parts.push(i.note)
    return parts.length ? parts.join(' — ') : undefined
  }

  async function sendComanda() {
    if (cart.length === 0) return
    setSendingCmd(true)
    const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    const ticketLabel = `Mostrador · ${hora}`
    const items = cart.map(i => ({ name: i.name, qty: i.qty, notes: buildItemNotes(i) }))
    const { error } = await supabase.from('kitchen_tickets').insert({
      branch_id:    activeBranch?.id ?? null,
      ticket_label: ticketLabel,
      items,
      source:       'pos',
    })
    setSendingCmd(false)
    if (error) { alert('Error comanda: ' + error.message); return }
    // Imprimir comanda en impresora térmica via JSPrintManager
    printComanda(activeBranch?.name, ticketLabel, items)
    setCmdSent(true)
    setTimeout(() => setCmdSent(false), 3000)
  }

  async function printOrder() {
    if (cart.length === 0) return
    const hora     = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    const branch   = activeBranch?.name ?? 'Mostrador'
    const branchId = activeBranch?.id

    // Intentar imprimir con JSPrintManager primero
    const items = cart.map(i => ({ name: i.name, qty: i.qty, notes: buildItemNotes(i) }))
    const printed = await printComanda(branch, `Orden · ${hora}`, items)
    if (printed) return   // JSPrintManager lo imprimió, no necesitamos window.print()
    const LOGOS = {
      'aaaaaaaa-0000-0000-0000-000000000001': '/logo.svg',
      'aaaaaaaa-0000-0000-0000-000000000002': '/logo-foviste.svg',
      'aaaaaaaa-0000-0000-0000-000000000003': '/logo.svg',
      'aaaaaaaa-0000-0000-0000-000000000004': '/logo.svg',
    }
    const logoPath = LOGOS[branchId]
    const logoTag  = logoPath
      ? `<img src="${window.location.origin}${logoPath}" alt="Logo" style="display:block;margin:0 auto 4px;height:44px;object-fit:contain;">`
      : ''
    const rows   = cart.map(i => {
      const mods  = i.mods?.length ? `<div class="item-mod">+ ${i.mods.map(m => m.name).join(', ')}</div>` : ''
      const combo = i.comboItems?.length
        ? i.comboItems.map(c => `<div class="item-mod">· ${c.products?.name} ×${c.quantity}</div>`).join('')
        : ''
      const note  = i.note ? `<div class="item-mod obs">* ${i.note}</div>` : ''
      return `<div class="item-block">
        <div class="item-row">
          <span class="item-name">${i.name}</span><span class="item-qty">×${i.qty}</span>
        </div>${mods}${combo}${note}</div>`
    }).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Orden</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 15px; font-weight: 700; width: 76mm; margin: 0 auto; padding: 3mm 2mm; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h2 { text-align: center; font-size: 20px; font-weight: 900; margin: 2px 0; }
      .sub { text-align: center; font-size: 13px; font-weight: 600; color: #222; margin: 2px 0; }
      .divider { border-top: 2px dashed #000; margin: 7px 0; }
      .item-block { margin: 7px 0; border-bottom: 1px dashed #999; padding-bottom: 6px; }
      .item-row { display: flex; justify-content: space-between; }
      .item-name { font-size: 16px; font-weight: 900; }
      .item-qty  { font-size: 16px; font-weight: 900; }
      .item-mod  { font-size: 13px; font-weight: 600; color: #333; margin-left: 8px; }
      .obs       { color: #7c3a00; font-weight: 700; }
      .total-row { display: flex; justify-content: space-between; font-size: 20px; font-weight: 900; }
    </style></head><body>
    ${logoTag}<h2>${branch}</h2><p class="sub">Orden &bull; ${hora}</p>
    <div class="divider"></div>${rows}<div class="divider"></div>
    <div class="total-row"><span>Total</span><span>$${total.toFixed(2)}</span></div>
    </body></html>`
    const w = window.open('', '_blank', 'width=400,height=600')
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  async function completeSale(paymentMethod, platformName, cashReceived, payments = null, customerName = '') {
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
      payments:         payments ?? null,
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
    const horaVenta = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    await supabase.from('kitchen_tickets').insert({
      branch_id:    activeBranch?.id ?? null,
      ticket_label: `Mostrador · ${horaVenta}`,
      items:        cart.map(i => ({ name: i.name, qty: i.qty, notes: buildItemNotes(i) })),
      source:       'pos',
      reference_id: sale.id,
    })

    setLastSale({ ...sale, items: cart, change: changeGiven, cashier: profile?.name ?? 'Cajero', branchName: activeBranch?.name, customerName })
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
                <div key={item.cartKey} className="bg-gray-50 rounded-xl p-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                      {item.mods?.length > 0 && (
                        <p className="text-xs text-amber-600 truncate">
                          + {item.mods.map(m => m.name).join(', ')}
                        </p>
                      )}
                      {item.comboItems?.length > 0 && (
                        <div className="text-xs text-blue-600 mt-0.5">
                          {item.comboItems.map((c, idx) => (
                            <div key={idx}>· {c.products?.name} ×{c.quantity}</div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500">{mxn(item.price)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setNoteItem(item)}
                        title="Agregar observación"
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${item.note ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 hover:bg-gray-300 text-gray-500'}`}
                      >
                        <MessageSquare className="w-3 h-3" />
                      </button>
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
                  {item.note && (
                    <div className="mt-1.5 flex items-start gap-1 bg-orange-50 rounded-lg px-2 py-1">
                      <MessageSquare className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-orange-700 leading-tight">{item.note}</p>
                    </div>
                  )}
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
            <div className="flex gap-2">
              <button
                onClick={sendComanda}
                disabled={sendingCmd}
                className={`flex-1 font-medium rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2
                  ${cmdSent
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 disabled:opacity-50'}`}
              >
                <ChefHat className="w-4 h-4" />
                {cmdSent ? '¡Enviada!' : sendingCmd ? 'Enviando...' : 'Comanda'}
              </button>
              <button
                onClick={printOrder}
                disabled={cart.length === 0}
                className="flex-1 font-medium rounded-xl py-3 text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Imprimir orden
              </button>
            </div>
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
          onConfirm={(mods, combo) => { addToCart(pendingProduct, mods, true, combo); setPendingProduct(null) }}
          onClose={() => setPendingProduct(null)}
        />
      )}
      {noteItem && (
        <NoteModal
          item={noteItem}
          onConfirm={(note) => { updateNote(noteItem.cartKey, note); setNoteItem(null) }}
          onClose={() => setNoteItem(null)}
        />
      )}
      {showPayment && <PaymentModal total={total} onClose={() => setShowPayment(false)} onComplete={completeSale} />}
      {lastSale && (
        <SuccessModal
          sale={lastSale}
          onClose={() => setLastSale(null)}
        />
      )}
      {/* FACTURACIÓN DESACTIVADA TEMPORALMENTE
      {showInvoice && lastSale && (
        <InvoiceModal
          sale={{
            ...lastSale,
            items: lastSale.items?.map(i => ({
              name:       i.name,
              quantity:   i.qty,
              unit_price: i.price,
            })),
          }}
          onClose={() => { setShowInvoice(false); setLastSale(null) }}
        />
      )}
      */}
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
function ModifierModal({ product, onClose, onConfirm }) {
  const [groups,     setGroups]     = useState([])
  const [selected,   setSelected]   = useState({})
  const [comboItems, setComboItems] = useState(product.comboItems ?? [])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    async function load() {
      const { data: assignments } = await supabase
        .from('product_modifier_group_assignments')
        .select('sort_order, modifier_groups(*, modifiers(*))')
        .eq('product_id', product.id)
        .order('sort_order')
      setGroups((assignments ?? []).map(a => a.modifier_groups).filter(Boolean))

      // Cargar componentes del combo directamente (sin join para evitar ambigüedad de FK)
      const { data: cData } = await supabase
        .from('combo_items')
        .select('product_id, quantity')
        .eq('combo_product_id', product.id)

      if (cData?.length) {
        const ids = cData.map(c => c.product_id)
        const { data: pData } = await supabase.from('products').select('id, name').in('id', ids)
        const names = Object.fromEntries((pData ?? []).map(p => [p.id, p.name]))
        setComboItems(cData.map(c => ({ ...c, products: { name: names[c.product_id] ?? 'Producto' } })))
      }

      setLoading(false)
    }
    load()
  }, [product.id])

  function toggle(group, mod) {
    setSelected(prev => {
      const cur = new Set(prev[group.id] ?? [])
      if (group.multi_select) {
        cur.has(mod.id) ? cur.delete(mod.id) : cur.add(mod.id)
      } else {
        cur.clear(); cur.add(mod.id)
      }
      return { ...prev, [group.id]: cur }
    })
  }

  function getModObj(id) {
    for (const g of groups) {
      const m = g.modifiers?.find(x => x.id === id)
      if (m) return m
    }
    return null
  }

  function handleConfirm() {
    const allMods = []
    for (const g of groups) {
      const selIds = selected[g.id] ?? new Set()
      if (g.required && selIds.size === 0) {
        alert(`Debes elegir una opción en "${g.name}"`)
        return
      }
      for (const id of selIds) {
        const mod = getModObj(id)
        if (mod) allMods.push(mod)
      }
    }
    onConfirm(allMods, comboItems)
  }

  const extraTotal = Object.values(selected)
    .flatMap(s => [...s])
    .reduce((sum, id) => sum + Number(getModObj(id)?.price_extra ?? 0), 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <div>
            <h2 className="font-bold text-gray-800">{product.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Personaliza tu pedido</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <p className="text-center text-gray-400 py-4">Cargando opciones...</p>
          ) : (
            <>
              {comboItems.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">📦 Este combo incluye</p>
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                    {comboItems.map(ci => (
                      <div key={ci.id} className="flex justify-between text-sm text-gray-700">
                        <span>{ci.products?.name}</span>
                        <span className="text-gray-400">× {ci.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {groups.map(g => (
                <div key={g.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-800">{g.name}</p>
                    {g.required
                      ? <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Obligatorio</span>
                      : <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Opcional</span>}
                    {g.multi_select && <span className="text-xs text-gray-400">· Varios</span>}
                  </div>
                  <div className="space-y-2">
                    {(g.modifiers ?? []).filter(m => m.active).sort((a, b) => a.sort_order - b.sort_order).map(mod => {
                      const sel = selected[g.id]?.has(mod.id)
                      return (
                        <button key={mod.id} onClick={() => toggle(g, mod)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 text-sm transition-all ${
                            sel ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                          }`}>
                          <span className="font-medium text-gray-800">{mod.name}</span>
                          <div className="flex items-center gap-2">
                            {Number(mod.price_extra) > 0
                              ? <span className="text-green-700 font-medium">+{mxn(mod.price_extra)}</span>
                              : <span className="text-gray-400">Gratis</span>}
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${sel ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                              {sel && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="p-5 border-t space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Precio base</span>
            <span className="font-medium text-gray-800">{mxn(product.price)}</span>
          </div>
          {extraTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Extras</span>
              <span className="font-medium text-green-700">+{mxn(extraTotal)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 border-t pt-2">
            <span>Total</span><span>{mxn(product.price + extraTotal)}</span>
          </div>
          <button onClick={handleConfirm}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl py-3 transition-colors">
            Agregar al carrito
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

  function printCorte() {
    const LOGOS = {
      'aaaaaaaa-0000-0000-0000-000000000001': '/logo.svg',
      'aaaaaaaa-0000-0000-0000-000000000002': '/logo-foviste.svg',
      'aaaaaaaa-0000-0000-0000-000000000003': '/logo.svg',
      'aaaaaaaa-0000-0000-0000-000000000004': '/logo.svg',
    }
    const BRANCH_INFO = {
      'aaaaaaaa-0000-0000-0000-000000000001': {
        address: 'Santa Matilde, Privadas Santa Matilde, Hgo., México',
      },
      'aaaaaaaa-0000-0000-0000-000000000002': {
        address: 'La Cintal 30, Fovissste III, 29050 Tuxtla Gutiérrez, Chis.',
        phone:   '961 386 3750',
        hours:   'Miércoles a lunes · 3 p.m. a 10:30 p.m.',
      },
      'aaaaaaaa-0000-0000-0000-000000000003': {
        address: 'Calle Ignacio Allende, Santiago Momoxpan, San Andrés Cholula, Pue.',
      },
      'aaaaaaaa-0000-0000-0000-000000000004': {
        address: 'Avenida La Principal, San Antonio, Pachuca de Soto, Hgo.',
      },
    }

    const now      = new Date()
    const fecha    = now.toLocaleDateString('es-MX')
    const hora     = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    const branch   = activeBranch?.name ?? 'Sucursal'
    const branchId = activeBranch?.id
    const s        = summary
    const closing  = parseFloat(closingAmt) || 0
    const exp      = Number(cashRegister.opening_amount) + (s?.efectivo ?? 0)
    const diff     = closing - exp
    const origin   = window.location.origin
    const logoPath = LOGOS[branchId]
    const info     = BRANCH_INFO[branchId]
    const logoTag  = logoPath
      ? `<img src="${origin}${logoPath}" alt="Logo" style="display:block;margin:0 auto 6px;height:48px;object-fit:contain;">`
      : ''
    const infoBlock = info
      ? `<p class="sub">${info.address}</p><p class="sub">Tel: ${info.phone}</p><p class="sub">${info.hours}</p>`
      : ''

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Corte de Caja</title>
    <style>
      body { font-family: 'Courier New', monospace; font-size: 14px; max-width: 320px; margin: 0 auto; padding: 16px; -webkit-print-color-adjust: exact; }
      h2 { text-align: center; font-size: 18px; font-weight: 900; margin: 0 0 4px; }
      .sub { text-align: center; font-size: 12px; color: #444; margin: 2px 0; }
      .divider { border-top: 2px dashed #000; margin: 8px 0; }
      .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 14px; }
      .bold { font-weight: 800; font-size: 15px; }
      .diff-ok { color: green; } .diff-neg { color: red; } .diff-pos { color: #b45309; }
    </style></head><body>
    ${logoTag}
    <h2>${branch}</h2>
    <p class="sub">Grupo Lopval</p>
    ${infoBlock}
    <p class="sub">Corte de Caja · ${fecha} ${hora}</p>
    <div class="divider"></div>
    <div class="row"><span>Cajero</span><span>${cashRegister.cashier_name ?? ''}</span></div>
    <div class="row"><span>Apertura caja</span><span>$${Number(cashRegister.opening_amount).toFixed(2)}</span></div>
    <div class="divider"></div>
    <div class="row"><span>Efectivo</span><span>$${(s?.efectivo ?? 0).toFixed(2)}</span></div>
    <div class="row"><span>Tarjeta</span><span>$${(s?.tarjeta ?? 0).toFixed(2)}</span></div>
    <div class="row"><span>Transferencia</span><span>$${(s?.transferencia ?? 0).toFixed(2)}</span></div>
    <div class="row"><span>Plataformas</span><span>$${(s?.plataforma ?? 0).toFixed(2)}</span></div>
    <div class="divider"></div>
    <div class="row bold"><span>Total ventas (${s?.count ?? 0} órd.)</span><span>$${(s?.total ?? 0).toFixed(2)}</span></div>
    <div class="row bold"><span>Efectivo esperado</span><span>$${exp.toFixed(2)}</span></div>
    ${closingAmt !== '' ? `<div class="row bold"><span>Efectivo contado</span><span>$${closing.toFixed(2)}</span></div>
    <div class="row bold ${Math.abs(diff) < 1 ? 'diff-ok' : diff < 0 ? 'diff-neg' : 'diff-pos'}">
      <span>Diferencia</span><span>${diff >= 0 ? '+' : ''}$${diff.toFixed(2)}</span></div>` : ''}
    ${notes ? `<div class="divider"></div><p style="font-size:10px">Notas: ${notes}</p>` : ''}
    <div class="divider"></div>
    </body></html>`

    const w = window.open('', '_blank', 'width=400,height=600')
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

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
          if (p.method === 'efectivo')      acc.efectivo      += Number(p.amount)
          if (p.method === 'tarjeta')       acc.tarjeta       += Number(p.amount)
          if (p.method === 'transferencia') acc.transferencia += Number(p.amount)
          if (p.method === 'plataforma')    acc.plataforma    += Number(p.amount)
        }
      } else {
        if (sale.payment_method === 'efectivo')      acc.efectivo      += Number(sale.total)
        if (sale.payment_method === 'tarjeta')       acc.tarjeta       += Number(sale.total)
        if (sale.payment_method === 'transferencia') acc.transferencia += Number(sale.total)
        if (sale.payment_method === 'plataforma')    acc.plataforma    += Number(sale.total)
      }
      return acc
    }, { total: 0, count: 0, efectivo: 0, tarjeta: 0, transferencia: 0, plataforma: 0 })

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
      total_platform:  summary?.plataforma    ?? 0,
      total_transfer:  summary?.transferencia ?? 0,
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
              <Row label="Efectivo"        value={mxn(summary.efectivo)}      cls="text-green-700" />
              <Row label="Tarjeta"         value={mxn(summary.tarjeta)}       cls="text-blue-700" />
              <Row label="Transferencia"   value={mxn(summary.transferencia)} cls="text-cyan-700" />
              <Row label="Plataformas"     value={mxn(summary.plataforma)}    cls="text-purple-700" />
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

            <button onClick={printCorte}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium rounded-xl py-3 transition-colors text-sm">
              <Printer className="w-4 h-4" /> Imprimir corte
            </button>

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
  const [method,        setMethod]      = useState('efectivo')
  const [platform,      setPlatform]    = useState('')
  const [cash,          setCash]        = useState('')
  const [loading,       setLoading]     = useState(false)
  const [error,         setError]       = useState('')
  const [customerName,  setCustomerName]= useState('')
  // Pago mixto
  const [mixEfectivo,      setMixEfectivo]      = useState('')
  const [mixTarjeta,       setMixTarjeta]        = useState('')
  const [mixTransferencia, setMixTransferencia]  = useState('')
  const [mixPlataforma,    setMixPlataforma]     = useState('')
  const [mixPlatName,      setMixPlatName]       = useState('')

  const cashNum   = parseFloat(cash) || 0
  const change    = cashNum - total
  const validCash = method !== 'efectivo' || cashNum >= total

  // Mixto: suma de partes
  const mixTotal = (parseFloat(mixEfectivo) || 0) + (parseFloat(mixTarjeta) || 0)
    + (parseFloat(mixTransferencia) || 0) + (parseFloat(mixPlataforma) || 0)
  const mixPending = total - mixTotal

  async function handleConfirm() {
    setError('')
    if (method === 'mixto') {
      if (Math.abs(mixPending) > 0.01) { setError(`Faltan ${mxn(mixPending)} por asignar`); return }
      if (parseFloat(mixPlataforma) > 0 && !mixPlatName) { setError('Selecciona la plataforma'); return }
      const payments = []
      if (parseFloat(mixEfectivo)      > 0) payments.push({ method: 'efectivo',      amount: parseFloat(mixEfectivo) })
      if (parseFloat(mixTarjeta)       > 0) payments.push({ method: 'tarjeta',       amount: parseFloat(mixTarjeta) })
      if (parseFloat(mixTransferencia) > 0) payments.push({ method: 'transferencia', amount: parseFloat(mixTransferencia) })
      if (parseFloat(mixPlataforma)    > 0) payments.push({ method: 'plataforma',    amount: parseFloat(mixPlataforma), platform: mixPlatName })
      setLoading(true)
      try { await onComplete('mixto', null, 0, payments, customerName) }
      catch { setError('Error al guardar la venta.'); setLoading(false) }
      return
    }
    if (!validCash) { setError('El efectivo recibido es menor al total'); return }
    if (method === 'plataforma' && !platform) { setError('Selecciona la plataforma'); return }
    setLoading(true)
    try { await onComplete(method, platform, cashNum, null, customerName) }
    catch { setError('Error al guardar la venta. Intenta de nuevo.'); setLoading(false) }
  }

  const METHODS = [
    { id: 'efectivo',      icon: Banknote,   label: 'Efectivo'      },
    { id: 'tarjeta',       icon: CreditCard, label: 'Tarjeta'       },
    { id: 'transferencia', icon: Smartphone, label: 'Transferencia' },
    { id: 'plataforma',    icon: Smartphone, label: 'Plataforma'    },
    { id: 'mixto',         icon: Tag,        label: 'Mixto'         },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="font-bold text-gray-800 text-lg">Método de pago</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-center text-3xl font-black text-gray-900">{mxn(total)}</p>

          {/* Métodos */}
          <div className="grid grid-cols-5 gap-1.5">
            {METHODS.map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setMethod(id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                  method === id ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-medium leading-tight text-center">{label}</span>
              </button>
            ))}
          </div>

          {/* Efectivo */}
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

          {/* Plataforma */}
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

          {/* Mixto */}
          {method === 'mixto' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-1">Distribuye el total entre los métodos que uses</p>
              {[
                { label: 'Efectivo',      value: mixEfectivo,      set: setMixEfectivo      },
                { label: 'Tarjeta',       value: mixTarjeta,       set: setMixTarjeta        },
                { label: 'Transferencia', value: mixTransferencia, set: setMixTransferencia  },
                { label: 'Plataforma',    value: mixPlataforma,    set: setMixPlataforma     },
              ].map(({ label, value, set }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 w-28 flex-shrink-0">{label}</span>
                  <input type="number" min="0" value={value} onChange={e => set(e.target.value)}
                    placeholder="$0"
                    className="flex-1 border rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-400" />
                </div>
              ))}
              {parseFloat(mixPlataforma) > 0 && (
                <select value={mixPlatName} onChange={e => setMixPlatName(e.target.value)}
                  className="w-full border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400">
                  <option value="">Selecciona plataforma...</option>
                  <option>Rappi</option><option>Uber Eats</option><option>Mercado Pago</option>
                  <option>DiDi Food</option><option>WhatsApp / Teléfono</option><option>Otra</option>
                </select>
              )}
              <div className={`rounded-xl px-4 py-2 flex justify-between text-sm font-medium ${
                Math.abs(mixPending) < 0.01 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
              }`}>
                <span>{Math.abs(mixPending) < 0.01 ? '✓ Completo' : 'Pendiente'}</span>
                <span>{Math.abs(mixPending) < 0.01 ? mxn(total) : mxn(mixPending)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-600 mb-1">Nombre del cliente (opcional)</label>
            <input
              value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Ej: Juan García"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

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
const BRANCH_INFO_PRINT = {
  'aaaaaaaa-0000-0000-0000-000000000001': { address: 'Santa Matilde, Privadas Santa Matilde, Hgo.' },
  'aaaaaaaa-0000-0000-0000-000000000002': { address: 'La Cintal 30, Fovissste III, Tuxtla Gutiérrez, Chis.', phone: '961 386 3750' },
  'aaaaaaaa-0000-0000-0000-000000000003': { address: 'Calle Ignacio Allende, Santiago Momoxpan, San Andrés Cholula, Pue.' },
  'aaaaaaaa-0000-0000-0000-000000000004': { address: 'Av. La Principal, San Antonio, Pachuca de Soto, Hgo.' },
}

const BRANCH_LOGOS = {
  'aaaaaaaa-0000-0000-0000-000000000001': '/logo.svg',
  'aaaaaaaa-0000-0000-0000-000000000002': '/logo-foviste.svg',
  'aaaaaaaa-0000-0000-0000-000000000003': '/logo.svg',
  'aaaaaaaa-0000-0000-0000-000000000004': '/logo.svg',
}

const BRANCH_QR = {
  'aaaaaaaa-0000-0000-0000-000000000001': '/QR_Resena_Google_Matilde.png',
  'aaaaaaaa-0000-0000-0000-000000000003': '/QR_Resena_Google_Puebla.png',
  'aaaaaaaa-0000-0000-0000-000000000004': '/QR_Resena_Google_Pachuca.png',
}

function openTicketWindow(sale) {
  const now    = new Date()
  const fecha  = now.toLocaleDateString('es-MX')
  const hora   = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const info   = BRANCH_INFO_PRINT[sale.branch_id] ?? {}
  const logo   = BRANCH_LOGOS[sale.branch_id]
  const qr     = BRANCH_QR[sale.branch_id]
  const origin = window.location.origin
  const mxn    = n => `$${Number(n ?? 0).toFixed(2)}`
  const iva    = (sale.total ?? 0) * 16 / 116
  const base   = (sale.total ?? 0) - iva
  const METHOD = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', plataforma: sale.platform_name ?? 'Plataforma', mixto: 'Mixto' }

  const itemRows = (sale.items ?? []).map(i => {
    const mods  = i.mods?.length  ? `<div class="mod">+ ${i.mods.map(m => m.name).join(', ')}</div>` : ''
    const combo = i.comboItems?.length ? i.comboItems.map(c => `<div class="mod">· ${c.products?.name} ×${c.quantity}</div>`).join('') : ''
    const note  = i.note ? `<div class="mod obs">* ${i.note}</div>` : ''
    return `<div class="item">
      <div class="item-row"><span>${i.name} x${i.qty}</span><span>${mxn((i.price ?? 0) * (i.qty ?? 1))}</span></div>
      ${mods}${combo}${note}
    </div>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 15px; font-weight: 700; width: 76mm; margin: 0 auto; padding: 3mm 2mm; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .center { text-align: center; }
    .big { font-size: 19px; font-weight: 900; letter-spacing: -0.3px; }
    .sub { font-size: 13px; font-weight: 700; color: #111; margin: 2px 0; }
    .dash { border-top: 2px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 14px; font-weight: 700; }
    .item { margin: 6px 0; padding-bottom: 5px; border-bottom: 1px dashed #999; }
    .item-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; }
    .mod { font-size: 14px; font-weight: 700; color: #222; padding-left: 6px; }
    .obs { color: #7c3a00; font-weight: 800; }
    .total-row { display: flex; justify-content: space-between; font-size: 21px; font-weight: 900; border-top: 2px solid #000; padding-top: 5px; margin-top: 4px; }
    .iva { font-size: 13px; font-weight: 700; color: #222; margin-top: 5px; border-top: 1px dashed #999; padding-top: 4px; }
    .iva .row { font-size: 13px; font-weight: 700; }
    .gracias { font-size: 15px; font-weight: 800; margin: 3px 0; }
    img { display: block; margin: 0 auto; }
  </style></head><body>
  <div class="center">
    ${logo ? `<img src="${origin}${logo}" style="height:48px;object-fit:contain;margin-bottom:4px;">` : ''}
    <div class="big">${sale.branchName ?? 'Pizza & Totó'}</div>
    <div class="sub">Grupo Lopval</div>
    ${info.address ? `<div class="sub">${info.address}</div>` : ''}
    ${info.phone   ? `<div class="sub">Tel: ${info.phone}</div>` : ''}
    <div class="sub">${fecha} &nbsp; ${hora}</div>
    ${sale.cashier      ? `<div class="sub">Cajero: ${sale.cashier}</div>` : ''}
    ${sale.customerName ? `<div class="sub">Cliente: ${sale.customerName}</div>` : ''}
  </div>
  <div class="dash"></div>
  ${itemRows}
  <div class="dash"></div>
  ${sale.discount > 0 ? `<div class="row"><span>Descuento</span><span>-${mxn(sale.discount)}</span></div>` : ''}
  <div class="total-row"><span>TOTAL</span><span>${mxn(sale.total)}</span></div>
  <div class="iva">
    <div class="row"><span>Subtotal s/IVA</span><span>${mxn(base)}</span></div>
    <div class="row"><span>IVA (16%)</span><span>${mxn(iva)}</span></div>
    <div class="sub">* Precios con IVA incluido · Moneda Nacional</div>
  </div>
  <div class="dash"></div>
  <div class="row"><span>Pago:</span><span>${METHOD[sale.payment_method] ?? ''}</span></div>
  ${sale.change > 0 ? `<div class="row"><span>Cambio:</span><span>${mxn(sale.change)}</span></div>` : ''}
  <div class="center" style="margin-top:10px;">
    <div class="gracias">¡Gracias por su visita!</div>
    <div class="gracias">Vuelva pronto</div>
  </div>
  ${qr ? `<div class="center" style="margin-top:8px;border-top:1px dashed #999;padding-top:6px;">
    <div class="sub">¿Cómo fue tu experiencia? ¡Cuéntanos!</div>
    <img src="${origin}${qr}" style="width:76px;height:76px;margin:4px auto;">
    <div class="sub">Escanea para calificarnos en Google</div>
  </div>` : ''}
  </body></html>`

  const w = window.open('', '_blank', 'width=320,height=600')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print(); w.close() }, 500)
}

function SuccessModal({ sale, onClose, onRequestInvoice }) {
  const methodLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', plataforma: sale.platform_name }
  const now = new Date()

  const branchInfo = BRANCH_INFO_PRINT[sale.branch_id]

  useEffect(() => {
    // Intenta imprimir con JSPrintManager; si falla, abre ventana de ticket
    printTicket(sale, branchInfo).then(ok => {
      if (!ok) openTicketWindow(sale)
    })
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
          <div className="space-y-2">
            {/* FACTURACIÓN DESACTIVADA TEMPORALMENTE
            <button onClick={onRequestInvoice}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl py-2.5 text-sm font-medium transition-colors">
              <FileText className="w-4 h-4" /> Solicitar factura
            </button>
            */}
            <div className="flex gap-2">
              <button onClick={async () => {
                const ok = await printTicket(sale, branchInfo)
                if (!ok) openTicketWindow(sale)
              }}
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
      </div>

    </>
  )
}

// ─── Modal de Observaciones ───────────────────────────────────
function NoteModal({ item, onConfirm, onClose }) {
  const [recipeItems, setRecipeItems] = useState([])
  const [removed,     setRemoved]     = useState(new Set())  // IDs de ingredientes a quitar
  const [freeText,    setFreeText]    = useState('')
  const [loading,     setLoading]     = useState(true)

  // Cargar ingredientes de la receta del producto
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('recipe_items')
        .select('id, quantity, unit, ingredients(name)')
        .eq('product_id', item.id)
      setRecipeItems(data ?? [])

      // Pre-llenar con nota existente si había ingredientes marcados
      if (item.note) {
        // Intentar re-parsear nota existente (solo texto libre)
        const parts  = item.note.split(' / ')
        const sinPart = parts.find(p => p.startsWith('Sin: '))
        const obsPart = parts.find(p => p.startsWith('Obs: '))
        if (obsPart) setFreeText(obsPart.replace('Obs: ', ''))
        if (sinPart && data?.length) {
          const sinNames = sinPart.replace('Sin: ', '').split(', ')
          const preRemoved = new Set(
            (data ?? []).filter(r => sinNames.includes(r.ingredients?.name)).map(r => r.id)
          )
          setRemoved(preRemoved)
        } else if (!sinPart && item.note) {
          setFreeText(item.note)
        }
      }

      setLoading(false)
    }
    load()
  }, [item.id])

  function toggleRemove(id) {
    setRemoved(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleConfirm() {
    const parts = []
    if (removed.size > 0) {
      const names = recipeItems.filter(r => removed.has(r.id)).map(r => r.ingredients?.name).filter(Boolean)
      if (names.length) parts.push('Sin: ' + names.join(', '))
    }
    if (freeText.trim()) parts.push('Obs: ' + freeText.trim())
    onConfirm(parts.join(' / ') || '')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <div>
            <h2 className="font-bold text-gray-800">Observaciones</h2>
            <p className="text-sm text-gray-500 mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Ingredientes de la receta */}
          {loading ? (
            <p className="text-center text-gray-400 text-sm py-4">Cargando ingredientes...</p>
          ) : recipeItems.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                🥗 Quitar ingredientes
              </p>
              <div className="space-y-2">
                {recipeItems.map(ri => {
                  const isRemoved = removed.has(ri.id)
                  return (
                    <button
                      key={ri.id}
                      onClick={() => toggleRemove(ri.id)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 text-sm transition-all ${
                        isRemoved
                          ? 'border-red-400 bg-red-50 text-red-700'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <span className="font-medium">{ri.ingredients?.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isRemoved ? 'bg-red-200 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        {isRemoved ? 'Sin esto' : 'Con esto'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center">Este producto no tiene receta definida</p>
          )}

          {/* Texto libre */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              📝 Observación libre
            </p>
            <textarea
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              placeholder="Ej: extra picante, término medio, sin sal..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>

        <div className="p-5 border-t flex gap-3">
          <button
            onClick={() => { setRemoved(new Set()); setFreeText(''); onConfirm('') }}
            className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            Limpiar
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl py-2.5 text-sm transition-colors"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
