import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { mxn } from '../../utils/format'
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Tag,
  CreditCard, Banknote, Smartphone, X, CheckCircle, Clock
} from 'lucide-react'

// ─── Colores por categoría ────────────────────────────────────
const CAT_COLORS = {
  'Pizzas':    'bg-red-100 text-red-700 ring-red-200',
  'Pastas':    'bg-orange-100 text-orange-700 ring-orange-200',
  'Ensaladas': 'bg-green-100 text-green-700 ring-green-200',
  'Bebidas':   'bg-blue-100 text-blue-700 ring-blue-200',
  'Postres':   'bg-purple-100 text-purple-700 ring-purple-200',
  'Extras':    'bg-yellow-100 text-yellow-700 ring-yellow-200',
}

// ─── Componente principal POS ─────────────────────────────────
export default function POS() {
  const { user, profile } = useAuth()
  const [categories, setCategories] = useState([])
  const [products,   setProducts]   = useState([])
  const [selCat,     setSelCat]     = useState('Todos')
  const [search,     setSearch]     = useState('')
  const [cart,       setCart]       = useState([])
  const [discount,   setDiscount]   = useState('')
  const [discReason, setDiscReason] = useState('')
  const [showPayment,setShowPayment]= useState(false)
  const [lastSale,   setLastSale]   = useState(null)
  const [recentSales,setRecentSales]= useState([])

  // ── Carga inicial ──────────────────────────────────────────
  useEffect(() => {
    fetchCategories()
    fetchProducts()
    fetchRecentSales()
  }, [])

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').eq('active', true).order('sort_order')
    setCategories(data ?? [])
  }
  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*, categories(name,icon,color)').eq('active', true).order('name')
    setProducts(data ?? [])
  }
  async function fetchRecentSales() {
    const { data } = await supabase.from('sales').select('id,created_at,total,payment_method').order('created_at', { ascending: false }).limit(5)
    setRecentSales(data ?? [])
  }

  // ── Filtros ────────────────────────────────────────────────
  const filtered = products.filter(p => {
    const matchCat = selCat === 'Todos' || p.categories?.name === selCat
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // ── Carrito ────────────────────────────────────────────────
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.id === product.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { ...product, qty: 1 }]
    })
  }, [])

  const updateQty = (id, delta) => {
    setCart(prev => prev
      .map(i => i.id === id ? { ...i, qty: i.qty + delta } : i)
      .filter(i => i.qty > 0)
    )
  }

  const removeItem = (id) => setCart(prev => prev.filter(i => i.id !== id))
  const clearCart  = () => { setCart([]); setDiscount(''); setDiscReason('') }

  // ── Totales ────────────────────────────────────────────────
  const subtotal      = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const discountAmt   = Math.min(parseFloat(discount) || 0, subtotal)
  const total         = subtotal - discountAmt

  // ── Completar venta ────────────────────────────────────────
  async function completeSale(paymentMethod, platformName, cashReceived) {
    const changeGiven = paymentMethod === 'efectivo' ? (cashReceived - total) : 0
    const { data: sale, error } = await supabase.from('sales').insert({
      cashier_id:     user?.id,
      cashier_name:   profile?.name ?? 'Cajero',
      subtotal,
      discount:       discountAmt,
      discount_reason:discReason || null,
      total,
      payment_method: paymentMethod,
      platform_name:  platformName || null,
      cash_received:  paymentMethod === 'efectivo' ? cashReceived : null,
      change_given:   paymentMethod === 'efectivo' ? changeGiven : null,
      status: 'completed'
    }).select().single()

    if (error) throw error

    // Insertar ítems
    await supabase.from('sale_items').insert(
      cart.map(i => ({
        sale_id:      sale.id,
        product_id:   i.id,
        product_name: i.name,
        quantity:     i.qty,
        unit_price:   i.price,
        subtotal:     i.price * i.qty
      }))
    )

    setLastSale({ ...sale, items: cart, change: changeGiven })
    clearCart()
    setShowPayment(false)
    fetchRecentSales()
  }

  return (
    <div className="flex h-full">
      {/* ── Panel izquierdo: productos ── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">

        {/* Búsqueda */}
        <div className="p-4 bg-white border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
        </div>

        {/* Categorías */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide bg-white border-b">
          {['Todos', ...categories.map(c => c.name)].map(cat => (
            <button
              key={cat}
              onClick={() => setSelCat(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selCat === cat
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(product => {
              const inCart = cart.find(i => i.id === product.id)
              const colorCls = CAT_COLORS[product.categories?.name] ?? 'bg-gray-100 text-gray-700 ring-gray-200'
              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`
                    relative bg-white rounded-2xl p-3 shadow-sm border text-left
                    hover:shadow-md hover:border-red-300 active:scale-95 transition-all
                    ${inCart ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-100'}
                  `}
                >
                  {/* Icono de categoría */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-2 ring-1 ${colorCls}`}>
                    {product.categories?.icon ?? '🍽️'}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{product.name}</p>
                  <p className="text-red-600 font-bold mt-1">{mxn(product.price)}</p>
                  {inCart && (
                    <span className="absolute top-2 right-2 bg-red-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
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

        {/* Últimas ventas (pie) */}
        {recentSales.length > 0 && !cart.length && (
          <div className="px-4 pb-4">
            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Últimas ventas</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {recentSales.map(s => (
                <div key={s.id} className="flex-shrink-0 bg-white border rounded-xl px-3 py-2 text-xs">
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
          <ShoppingCart className="w-5 h-5 text-red-600" />
          <h2 className="font-semibold text-gray-800">Orden actual</h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="ml-auto text-gray-400 hover:text-red-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Items del carrito */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 p-8">
              <ShoppingCart className="w-14 h-14 mb-3" />
              <p className="text-sm">Selecciona productos del menú</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{mxn(item.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="w-7 h-7 rounded-full bg-gray-200 hover:bg-red-100 flex items-center justify-center transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="w-7 h-7 rounded-full bg-gray-200 hover:bg-green-100 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-7 h-7 rounded-full hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-500 ml-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-gray-800 w-14 text-right">{mxn(item.price * item.qty)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Descuento */}
        {cart.length > 0 && (
          <div className="px-3 pb-2 border-t pt-3">
            <div className="flex gap-2 items-center">
              <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="number"
                min="0"
                max={subtotal}
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                placeholder="Descuento $"
                className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <input
                value={discReason}
                onChange={e => setDiscReason(e.target.value)}
                placeholder="Motivo"
                className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>
        )}

        {/* Totales y cobrar */}
        {cart.length > 0 && (
          <div className="p-4 border-t space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>{mxn(subtotal)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-sm text-amber-600">
                <span>Descuento</span>
                <span>-{mxn(discountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg text-gray-900 border-t pt-2">
              <span>Total</span>
              <span className="text-red-600">{mxn(total)}</span>
            </div>
            <button
              onClick={() => setShowPayment(true)}
              className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl py-3.5 transition-colors text-base"
            >
              Cobrar {mxn(total)}
            </button>
          </div>
        )}
      </div>

      {/* ── Modal de pago ── */}
      {showPayment && (
        <PaymentModal
          total={total}
          onClose={() => setShowPayment(false)}
          onComplete={completeSale}
        />
      )}

      {/* ── Modal de venta exitosa ── */}
      {lastSale && (
        <SuccessModal sale={lastSale} onClose={() => setLastSale(null)} />
      )}
    </div>
  )
}

// ─── Modal de Pago ────────────────────────────────────────────
function PaymentModal({ total, onClose, onComplete }) {
  const [method,    setMethod]   = useState('efectivo')
  const [platform,  setPlatform] = useState('')
  const [cash,      setCash]     = useState('')
  const [loading,   setLoading]  = useState(false)
  const [error,     setError]    = useState('')

  const cashNum  = parseFloat(cash) || 0
  const change   = cashNum - total
  const validCash = method !== 'efectivo' || cashNum >= total

  async function handleConfirm() {
    if (!validCash) { setError('El efectivo recibido es menor al total'); return }
    if (method === 'plataforma' && !platform) { setError('Selecciona la plataforma'); return }
    setLoading(true)
    setError('')
    try {
      await onComplete(method, platform, cashNum)
    } catch (e) {
      setError('Error al guardar la venta. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="font-bold text-gray-800 text-lg">Método de pago</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-center text-3xl font-black text-red-600">{mxn(total)}</p>

          {/* Selector de método */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'efectivo',   icon: Banknote,    label: 'Efectivo' },
              { id: 'tarjeta',    icon: CreditCard,  label: 'Tarjeta' },
              { id: 'plataforma', icon: Smartphone,  label: 'Plataforma' },
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setMethod(id)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                  method === id ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>

          {/* Efectivo: monto recibido */}
          {method === 'efectivo' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Efectivo recibido</label>
              <input
                type="number"
                value={cash}
                onChange={e => setCash(e.target.value)}
                placeholder="$0.00"
                className="w-full border rounded-xl px-4 py-2.5 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-red-400"
                autoFocus
              />
              {/* Billetes rápidos */}
              <div className="flex gap-2 mt-2">
                {[50,100,200,500].map(v => (
                  <button
                    key={v}
                    onClick={() => setCash(String(v))}
                    className="flex-1 bg-gray-100 hover:bg-red-100 text-gray-700 hover:text-red-700 rounded-lg py-1.5 text-sm font-medium transition-colors"
                  >
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
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                <option value="">Seleccionar...</option>
                <option>Rappi</option>
                <option>Uber Eats</option>
                <option>Mercado Pago</option>
                <option>DiDi Food</option>
                <option>WhatsApp / Teléfono</option>
                <option>Otra</option>
              </select>
            </div>
          )}

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold rounded-xl py-3.5 transition-colors"
          >
            {loading ? 'Procesando...' : 'Confirmar venta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de Éxito ───────────────────────────────────────────
function SuccessModal({ sale, onClose }) {
  const methodLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', plataforma: sale.platform_name }
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm text-center p-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-9 h-9 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">¡Venta registrada!</h2>
        <p className="text-3xl font-black text-red-600 mb-3">{mxn(sale.total)}</p>
        <p className="text-sm text-gray-500 mb-1">Pago: {methodLabel[sale.payment_method]}</p>
        {sale.change > 0 && (
          <p className="text-sm font-semibold text-green-700 mb-4">Cambio: {mxn(sale.change)}</p>
        )}
        <div className="text-left bg-gray-50 rounded-xl p-3 mb-4 text-xs space-y-1">
          {sale.items?.map(i => (
            <div key={i.id} className="flex justify-between text-gray-600">
              <span>{i.name} x{i.qty}</span>
              <span>{mxn(i.price * i.qty)}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl py-3 transition-colors"
        >
          Nueva venta
        </button>
      </div>
    </div>
  )
}
