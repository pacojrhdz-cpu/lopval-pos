import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { mxn } from '../../utils/format'
import {
  Search, Plus, Minus, Trash2, Tag, ArrowLeft, Clock,
  CreditCard, Banknote, Smartphone, X, CheckCircle,
  AlertTriangle, Printer, ChefHat
} from 'lucide-react'

const CAT_COLORS = {
  'Pizzas':    'bg-stone-100 text-stone-700 ring-stone-200',
  'Pastas':    'bg-amber-100 text-amber-700 ring-amber-200',
  'Ensaladas': 'bg-green-100 text-green-700 ring-green-200',
  'Bebidas':   'bg-blue-100 text-blue-700 ring-blue-200',
  'Postres':   'bg-purple-100 text-purple-700 ring-purple-200',
  'Extras':    'bg-yellow-100 text-yellow-700 ring-yellow-200',
}

export default function CuentaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile, activeBranch } = useAuth()

  const [account,    setAccount]    = useState(null)
  const [categories, setCategories] = useState([])
  const [products,   setProducts]   = useState([])
  const [cart,       setCart]       = useState([])
  const [selCat,     setSelCat]     = useState('Todos')
  const [search,     setSearch]     = useState('')
  const [discount,   setDiscount]   = useState('')
  const [discReason, setDiscReason] = useState('')
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [showPay,    setShowPay]    = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [lastSale,   setLastSale]   = useState(null)
  const [sendingCmd, setSendingCmd] = useState(false)
  const [cmdSent,    setCmdSent]    = useState(false)

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const branchId = activeBranch?.id
    const [accRes, catRes, prodRes] = await Promise.all([
      supabase.from('accounts').select('*, account_items(*)').eq('id', id).single(),
      branchId
        ? supabase.from('categories').select('*').eq('active', true).eq('branch_id', branchId).order('sort_order')
        : supabase.from('categories').select('*').eq('active', true).order('sort_order'),
      branchId
        ? supabase.from('products').select('*, categories(name,icon,color)').eq('active', true).eq('branch_id', branchId).order('name')
        : supabase.from('products').select('*, categories(name,icon,color)').eq('active', true).order('name'),
    ])
    const acc = accRes.data
    if (!acc || acc.status !== 'open') { navigate('/pos/cuentas'); return }
    setAccount(acc)
    setCategories(catRes.data ?? [])
    setProducts(prodRes.data ?? [])
    setCart((acc.account_items ?? []).map(ai => ({
      cartKey:    ai.id,
      product_id: ai.product_id,
      name:       ai.product_name,
      price:      Number(ai.unit_price),
      qty:        ai.quantity,
    })))
    setLoading(false)
  }

  const filtered = products.filter(p => {
    const matchCat    = selCat === 'Todos' || p.categories?.name === selCat
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const addToCart = useCallback((product) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.product_id === product.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next
      }
      return [...prev, { cartKey: `new-${product.id}`, product_id: product.id, name: product.name, price: product.price, qty: 1 }]
    })
  }, [])

  const updateQty  = (idx, delta) => setCart(prev => prev.map((i, ii) => ii === idx ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0))
  const removeItem = (idx)        => setCart(prev => prev.filter((_, ii) => ii !== idx))

  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const discountAmt = Math.min(parseFloat(discount) || 0, subtotal)
  const total       = subtotal - discountAmt

  async function persistItems() {
    await supabase.from('account_items').delete().eq('account_id', id)
    if (cart.length > 0) {
      await supabase.from('account_items').insert(
        cart.map(i => ({
          account_id:   id,
          product_id:   i.product_id,
          product_name: i.name,
          quantity:     i.qty,
          unit_price:   i.price,
        }))
      )
    }
  }

  async function saveAndExit() {
    setSaving(true)
    await persistItems()
    setSaving(false)
    navigate('/pos/cuentas')
  }

  async function sendComanda() {
    if (cart.length === 0) return
    setSendingCmd(true)
    await persistItems()
    const label = account?.table_name
      ? account.table_name
      : `Cuenta ${account?.id?.slice(0, 4).toUpperCase()}`
    await supabase.from('kitchen_tickets').insert({
      branch_id:    activeBranch?.id ?? null,
      ticket_label: label,
      items:        cart.map(i => ({ name: i.name, qty: i.qty })),
      source:       'cuenta',
      reference_id: account?.id ?? null,
    })
    setSendingCmd(false)
    setCmdSent(true)
    setTimeout(() => setCmdSent(false), 3000)
  }

  async function completeSale(paymentMethod, platformName, cashReceived) {
    await persistItems()
    const changeGiven = paymentMethod === 'efectivo' ? (cashReceived - total) : 0

    // Buscar la caja abierta de esta sucursal para enlazar la venta al corte
    const { data: openReg } = await supabase
      .from('cash_registers')
      .select('id')
      .eq('branch_id', activeBranch?.id)
      .eq('status', 'open')
      .maybeSingle()

    const { data: sale, error } = await supabase.from('sales').insert({
      cashier_id:       user?.id,
      cashier_name:     profile?.name ?? 'Cajero',
      cash_register_id: openReg?.id ?? null,
      branch_id:        activeBranch?.id   ?? null,
      branch_name:      activeBranch?.name ?? null,
      subtotal,
      discount:        discountAmt,
      discount_reason: discReason || null,
      total,
      payment_method:  paymentMethod,
      platform_name:   platformName || null,
      cash_received:   paymentMethod === 'efectivo' ? cashReceived : null,
      change_given:    paymentMethod === 'efectivo' ? changeGiven  : null,
      status:          'completed',
    }).select().single()
    if (error) throw error

    await supabase.from('sale_items').insert(
      cart.map(i => ({
        sale_id: sale.id, product_id: i.product_id, product_name: i.name,
        quantity: i.qty, unit_price: i.price, subtotal: i.price * i.qty,
      }))
    )
    await supabase.from('accounts').update({
      status: 'closed', closed_at: new Date().toISOString(), sale_id: sale.id,
    }).eq('id', id)

    setLastSale({ ...sale, items: cart, change: changeGiven, cashier: profile?.name ?? 'Cajero', tableName: account?.table_name, branchName: activeBranch?.name })
    setShowPay(false)
  }

  async function cancelAccount(reason) {
    await supabase.from('accounts').update({
      status: 'cancelled', closed_at: new Date().toISOString(), cancel_reason: reason || null,
    }).eq('id', id)
    navigate('/pos/cuentas')
  }

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center" style={{ background: '#faf8f4' }}>
        <p className="text-gray-400 animate-pulse">Cargando cuenta...</p>
      </div>
    )
  }

  if (lastSale) return <SuccessModal sale={lastSale} onClose={() => navigate('/pos/cuentas')} />

  return (
    <div className="flex h-full">
      {/* ── Panel izquierdo ── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 bg-white">
        <div className="p-4 bg-white border-b flex gap-2 items-center">
          <button onClick={() => navigate('/pos/cuentas')}
            className="text-gray-500 hover:text-gray-900 transition-colors flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-shrink-0">
            <p className="font-bold text-gray-900 text-sm">{account?.table_name}</p>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {account?.created_at ? new Date(account.created_at).toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'}) : ''}
            </p>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(product => {
              const inCart   = cart.find(i => i.product_id === product.id)
              const colorCls = CAT_COLORS[product.categories?.name] ?? 'bg-gray-100 text-gray-700 ring-gray-200'
              return (
                <button key={product.id} onClick={() => addToCart(product)}
                  className={`relative bg-white rounded-2xl p-3 shadow-sm border text-left hover:shadow-md active:scale-95 transition-all
                    ${inCart ? 'border-gray-800 ring-2 ring-gray-200' : 'border-gray-100 hover:border-gray-300'}`}>
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
                <p className="text-4xl mb-2">🔍</p><p>Sin resultados</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Panel derecho: orden ── */}
      <div className="w-80 flex flex-col bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="font-semibold text-gray-800 truncate">{account?.table_name}</p>
          <button onClick={() => setShowCancel(true)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 p-8 text-center">
              <p className="text-sm">Agrega productos a la cuenta</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {cart.map((item, idx) => (
                <div key={item.cartKey ?? idx} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{mxn(item.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(idx, -1)} className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.qty}</span>
                    <button onClick={() => updateQty(idx, 1)} className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors">
                      <Plus className="w-3 h-3" />
                    </button>
                    <button onClick={() => removeItem(idx)} className="w-7 h-7 rounded-full hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-500 ml-1 transition-colors">
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
              <input type="number" min="0" max={subtotal} value={discount}
                onChange={e => setDiscount(e.target.value)} placeholder="Descuento $"
                className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
              <input value={discReason} onChange={e => setDiscReason(e.target.value)} placeholder="Motivo"
                className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
            </div>
          </div>
        )}

        <div className="p-4 border-t space-y-2">
          {cart.length > 0 && (
            <>
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
              <button onClick={() => setShowPay(true)}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl py-3.5 transition-colors">
                Cobrar {mxn(total)}
              </button>
            </>
          )}
          {/* Botón Mandar comanda */}
          <button
            onClick={sendComanda}
            disabled={sendingCmd || cart.length === 0}
            className={`w-full font-medium rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2
              ${cmdSent
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 disabled:opacity-50'}`}
          >
            <ChefHat className="w-4 h-4" />
            {cmdSent ? '¡Comanda enviada!' : sendingCmd ? 'Enviando...' : 'Mandar comanda a cocina'}
          </button>

          <button onClick={saveAndExit} disabled={saving}
            className="w-full border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium rounded-xl py-3 text-sm transition-colors disabled:opacity-60">
            {saving ? 'Guardando...' : 'Guardar y salir'}
          </button>
        </div>
      </div>

      {showPay    && <PaymentModal total={total} onClose={() => setShowPay(false)} onComplete={completeSale} />}
      {showCancel && <CancelModal onClose={() => setShowCancel(false)} onConfirm={cancelAccount} />}
    </div>
  )
}

// ─── Cancel Modal ─────────────────────────────────────────────
function CancelModal({ onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <h2 className="font-bold text-gray-800">Cancelar cuenta</h2>
        </div>
        <p className="text-sm text-gray-600">Esta acción cancelará la cuenta. Los productos no se cobrarán.</p>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo (opcional)"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm font-medium transition-colors">
            Volver
          </button>
          <button onClick={() => onConfirm(reason)}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl py-2.5 text-sm transition-colors">
            Cancelar cuenta
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Payment Modal ─────────────────────────────────────────────
function PaymentModal({ total, onClose, onComplete }) {
  const [method,   setMethod]   = useState('efectivo')
  const [platform, setPlatform] = useState('')
  const [cash,     setCash]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const cashNum = parseFloat(cash) || 0
  const change  = cashNum - total
  const valid   = method !== 'efectivo' || cashNum >= total

  async function handleConfirm() {
    if (!valid) { setError('El efectivo es menor al total'); return }
    if (method === 'plataforma' && !platform) { setError('Selecciona la plataforma'); return }
    setLoading(true); setError('')
    try { await onComplete(method, platform, cashNum) }
    catch { setError('Error al procesar. Intenta de nuevo.'); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="font-bold text-gray-800 text-lg">Cobrar cuenta</h2>
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
              <input type="number" value={cash} onChange={e => setCash(e.target.value)} placeholder="$0.00" autoFocus
                className="w-full border rounded-xl px-4 py-2.5 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-gray-400" />
              <div className="flex gap-2 mt-2">
                {[50,100,200,500].map(v => (
                  <button key={v} onClick={() => setCash(String(v))}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-1.5 text-sm font-medium transition-colors">${v}</button>
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
            {loading ? 'Procesando...' : 'Confirmar cobro'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Success Modal ─────────────────────────────────────────────
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
          <h2 className="text-xl font-bold text-gray-800 mb-1">¡Cuenta cobrada!</h2>
          {sale.tableName && <p className="text-sm text-gray-500 mb-2">{sale.tableName}</p>}
          <p className="text-3xl font-black text-gray-900 mb-3">{mxn(sale.total)}</p>
          <p className="text-sm text-gray-500 mb-1">Pago: {methodLabel[sale.payment_method]}</p>
          {sale.change > 0 && (
            <p className="text-sm font-semibold text-green-700 mb-4">Cambio: {mxn(sale.change)}</p>
          )}
          <div className="text-left bg-gray-50 rounded-xl p-3 mb-4 text-xs space-y-1">
            {sale.items?.map((i, idx) => (
              <div key={idx} className="flex justify-between text-gray-600">
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
              Finalizar
            </button>
          </div>
        </div>
      </div>

      <div className="print-only ticket">
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0' }}>{sale.branchName ?? 'Pizza & Totó'}</p>
          <p style={{ fontSize: '10px', margin: '2px 0' }}>Grupo Lopval</p>
          {sale.tableName && <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '2px 0' }}>{sale.tableName}</p>}
          <p style={{ fontSize: '9px', color: '#555', margin: '2px 0' }}>
            {now.toLocaleDateString('es-MX')} {now.toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'})}
          </p>
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
