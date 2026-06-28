import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { mxn } from '../../utils/format'
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Tag,
  CreditCard, Banknote, Smartphone, X, CheckCircle, Clock, Printer
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

  const filtered = products.filter(p => {
    const matchCat = selCat === 'Todos' || p.categories?.name === selCat
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

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

  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const discountAmt = Math.min(parseFloat(discount) || 0, subtotal)
  const total       = subtotal - discountAmt

  async function completeSale(paymentMethod, platformName, cashReceived) {
    const changeGiven = paymentMethod === 'efectivo' ? (cashReceived - total) : 0
    const { data: sale, error } = await supabase.from('sales').insert({
      cashier_id:      user?.id,
      cashier_name:    profile?.name ?? 'Cajero',
      subtotal,
      discount:        discountAmt,
      discount_reason: discReason || null,
      total,
      payment_method:  paymentMethod,
      platform_name:   platformName || null,
      cash_received:   paymentMethod === 'efectivo' ? cashReceived : null,
      change_given:    paymentMethod === 'efectivo' ? changeGiven : null,
      status: 'completed'
    }).select().single()

    if (error) throw error

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

    setLastSale({ ...sale, items: cart, change: changeGiven, cashier: profile?.name ?? 'Cajero' })
    clearCart()
    setShowPayment(false)
    fetchRecentSales()
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 bg-white">
        <div className="p-4 bg-white border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
          </div>
        </div>

        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide bg-white border-b">
          {['Todos', ...categories.map(c => c.name)].map(cat => (
            <button key={cat} onClick={() => setSelCat(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selCat === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{ background: '#faf8f4' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(product => {
              const inCart = cart.find(i => i.id === product.id)
              const colorCls = CAT_COLORS[product.categories?.name] ?? 'bg-gray-100 text-gray-700 ring-gray-200'
              return (
                <button key={product.id} onClick={() => addToCart(product)}
                  className={`relative bg-white rounded-2xl p-3 shadow-sm border text-left hover:shadow-md active:scale-95 transition-all ${
                    inCart ? 'border-gray-800 ring-2 ring-gray-200' : 'border-gray-100 hover:border-gray-300'
                  }`}>
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
                <div key={item.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{mxn(item.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.id, -1)} className="w-7