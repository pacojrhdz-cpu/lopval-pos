import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { mxn, fmtDateTime } from '../../utils/format'
import { Search, ChevronDown, ChevronUp, XCircle, AlertTriangle, X, FileText } from 'lucide-react'
import InvoiceModal from '../../components/pos/InvoiceModal'

const METHOD_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', plataforma: 'Plataforma', mixto: 'Mixto' }
const METHOD_COLORS = {
  efectivo:      'bg-green-100 text-green-700',
  tarjeta:       'bg-blue-100 text-blue-700',
  transferencia: 'bg-orange-100 text-orange-700',
  plataforma:    'bg-purple-100 text-purple-700',
  mixto:         'bg-gray-100 text-gray-700',
}

function localDayRange(fromStr, toStr) {
  const start = new Date(fromStr + 'T00:00:00')
  const end   = new Date(toStr   + 'T23:59:59.999')
  return { from: start.toISOString(), to: end.toISOString() }
}

function pct(part, total) {
  if (!total) return '0.00 %'
  return (part / total * 100).toFixed(2) + ' %'
}

export default function SalesHistory() {
  const { activeBranch } = useAuth()
  const [sales,        setSales]       = useState([])
  const [branches,     setBranches]    = useState([])
  const [branchFilter, setBranchFilter]= useState('all')
  const [loading,      setLoading]     = useState(true)
  const [expanded,     setExpanded]    = useState(null)
  const [search,       setSearch]      = useState('')
  const [filter,       setFilter]      = useState('all')
  const [statusFilter, setStatusFilter]= useState('completed')
  const [dateFrom,     setDateFrom]    = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [dateTo,       setDateTo]      = useState(() => new Date().toISOString().split('T')[0])
  const [cancelId,     setCancelId]    = useState(null)
  const [cancelReason, setCancelReason]= useState('')
  const [cancelling,   setCancelling]  = useState(false)
  const [invoiceSale,  setInvoiceSale] = useState(null)
  const [activeTab,    setActiveTab]   = useState('detalle') // 'detalle' | 'diario'
  const [dailyBranch,  setDailyBranch] = useState('all')

  useEffect(() => {
    supabase.from('branches').select('*').eq('active', true).order('name').then(({ data }) => setBranches(data ?? []))
  }, [])

  useEffect(() => { fetchSales() }, [dateFrom, dateTo, statusFilter, branchFilter])

  async function fetchSales() {
    setLoading(true)
    const { from, to } = localDayRange(dateFrom, dateTo)
    let q = supabase
      .from('sales')
      .select('*, sale_items(*)')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter)
    const { data } = await q
    setSales(data ?? [])
    setLoading(false)
  }

  async function cancelSale() {
    setCancelling(true)
    await supabase.from('sales').update({
      status:        'cancelled',
      cancel_reason: cancelReason || null,
      cancelled_at:  new Date().toISOString(),
    }).eq('id', cancelId)
    setCancelId(null); setCancelReason(''); setCancelling(false)
    fetchSales()
  }

  // Filtro de método aplicado en cliente
  const methodFiltered = filter === 'all'
    ? sales
    : sales.filter(s => s.payment_method === filter)

  const filtered = methodFiltered.filter(s =>
    !search || s.cashier_name?.toLowerCase().includes(search.toLowerCase()) || mxn(s.total).includes(search)
  )

  // Resumen de tarjetas
  const totals = sales.filter(s => s.status === 'completed').reduce((acc, s) => {
    acc.ventas     += Number(s.total)
    acc.descuentos += Number(s.discount ?? 0)
    acc.count      += 1
    return acc
  }, { ventas: 0, descuentos: 0, count: 0 })

  // Desglose por método
  const breakdown = sales.filter(s => s.status === 'completed').reduce((acc, s) => {
    if (s.payment_method === 'mixto' && Array.isArray(s.payments)) {
      for (const p of s.payments) {
        if (p.method === 'efectivo')      acc.efectivo      += Number(p.amount)
        if (p.method === 'tarjeta')       acc.tarjeta       += Number(p.amount)
        if (p.method === 'transferencia') acc.transferencia += Number(p.amount)
        if (p.method === 'plataforma')    acc.plataforma    += Number(p.amount)
      }
    } else {
      if (s.payment_method === 'efectivo')      acc.efectivo      += Number(s.total)
      if (s.payment_method === 'tarjeta')       acc.tarjeta       += Number(s.total)
      if (s.payment_method === 'transferencia') acc.transferencia += Number(s.total)
      if (s.payment_method === 'plataforma')    acc.plataforma    += Number(s.total)
    }
    return acc
  }, { efectivo: 0, tarjeta: 0, transferencia: 0, plataforma: 0 })

  // ── Cobros por Día ──────────────────────────────────────────────────────────
  // Agrupa ventas completadas por fecha + sucursal
  const dailyRows = useMemo(() => {
    const completedSales = sales.filter(s => s.status === 'completed')
    const branchMap = Object.fromEntries(branches.map(b => [b.id, b.name]))
    const map = {}

    for (const s of completedSales) {
      if (dailyBranch !== 'all' && s.branch_id !== dailyBranch) continue
      const day = s.created_at.slice(0, 10)
      const key = `${day}|${s.branch_id}`
      if (!map[key]) map[key] = {
        date: day,
        branch_id: s.branch_id,
        branch_name: branchMap[s.branch_id] ?? s.branch_id,
        efectivo: 0, tarjeta: 0, transferencia: 0, plataforma: 0, total: 0,
      }
      const row = map[key]
      if (s.payment_method === 'mixto' && Array.isArray(s.payments)) {
        for (const p of s.payments) {
          if (p.method === 'efectivo')      row.efectivo      += Number(p.amount)
          if (p.method === 'tarjeta')       row.tarjeta       += Number(p.amount)
          if (p.method === 'transferencia') row.transferencia += Number(p.amount)
          if (p.method === 'plataforma')    row.plataforma    += Number(p.amount)
        }
      } else {
        if (s.payment_method === 'efectivo')      row.efectivo      += Number(s.total)
        if (s.payment_method === 'tarjeta')       row.tarjeta       += Number(s.total)
        if (s.payment_method === 'transferencia') row.transferencia += Number(s.total)
        if (s.payment_method === 'plataforma')    row.plataforma    += Number(s.total)
      }
      row.total += Number(s.total)
    }

    return Object.values(map).sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date)
      return a.branch_name.localeCompare(b.branch_name)
    })
  }, [sales, branches, dailyBranch])

  const dailyTotals = useMemo(() => dailyRows.reduce((acc, r) => {
    acc.efectivo      += r.efectivo
    acc.tarjeta       += r.tarjeta
    acc.transferencia += r.transferencia
    acc.plataforma    += r.plataforma
    acc.total         += r.total
    return acc
  }, { efectivo: 0, tarjeta: 0, transferencia: 0, plataforma: 0, total: 0 }), [dailyRows])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Cuentas Cobradas</h1>

      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        <span className="text-gray-400">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />

        <div className="flex gap-1">
          {['all','efectivo','tarjeta','transferencia','plataforma','mixto'].map(m => (
            <button key={m} onClick={() => setFilter(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === m ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {m === 'all' ? 'Todos' : METHOD_LABELS[m]}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {[
            { id: 'completed', label: 'Completadas' },
            { id: 'cancelled', label: 'Canceladas'  },
            { id: 'all',       label: 'Todas'       },
          ].map(s => (
            <button key={s.id} onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white">
          <option value="all">Todas las sucursales</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <div className="flex-1 min-w-36 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
            className="w-full pl-8 pr-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none" />
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total ventas', value: mxn(totals.ventas),     color: 'text-gray-900' },
          { label: 'Órdenes',      value: totals.count,            color: 'text-blue-600' },
          { label: 'Descuentos',   value: mxn(totals.descuentos), color: 'text-amber-600'},
        ].map(item => (
          <div key={item.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-gray-500 text-xs mb-1">{item.label}</p>
            <p className={`text-xl font-black ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Desglose por método */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Efectivo',      value: breakdown.efectivo,      color: 'text-green-700',  bg: 'bg-green-50'  },
          { label: 'Tarjeta',       value: breakdown.tarjeta,       color: 'text-blue-700',   bg: 'bg-blue-50'   },
          { label: 'Transferencia', value: breakdown.transferencia, color: 'text-cyan-700',   bg: 'bg-cyan-50'   },
          { label: 'Plataformas',   value: breakdown.plataforma,    color: 'text-purple-700', bg: 'bg-purple-50' },
        ].map(item => (
          <div key={item.label} className={`${item.bg} rounded-xl p-3 text-center`}>
            <p className="text-gray-500 text-xs mb-1">{item.label}</p>
            <p className={`text-base font-bold ${item.color}`}>{mxn(item.value)}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'detalle', label: 'Detalle de ventas' },
          { id: 'diario',  label: 'Cobros por día'    },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Detalle de ventas ── */}
      {activeTab === 'detalle' && (
        <>
          {/* Modal cancelar */}
          {cancelId && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                    <h2 className="font-bold text-gray-800">Cancelar venta</h2>
                  </div>
                  <button onClick={() => { setCancelId(null); setCancelReason('') }}>
                    <X className="w-5 h-5 text-gray-400 hover:text-gray-700" />
                  </button>
                </div>
                <p className="text-sm text-gray-600">Esta acción marcará la venta como cancelada.</p>
                <input value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                  placeholder="Motivo (opcional)"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
                <div className="flex gap-2">
                  <button onClick={() => { setCancelId(null); setCancelReason('') }}
                    className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm font-medium transition-colors">
                    Volver
                  </button>
                  <button onClick={cancelSale} disabled={cancelling}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold rounded-xl py-2.5 text-sm transition-colors">
                    {cancelling ? 'Cancelando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-gray-400">Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-gray-400">Sin ventas en el período seleccionado</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Fecha/Hora','Cajero','Método','Subtotal','Descuento','Total','Estado',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(sale => {
                    const isCancelled = sale.status === 'cancelled'
                    return (
                      <>
                        <tr key={sale.id} className={`hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-3 text-gray-600">{fmtDateTime(sale.created_at)}</td>
                          <td className={`px-4 py-3 font-medium ${isCancelled ? 'line-through text-gray-400' : 'text-gray-800'}`}>{sale.cashier_name}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${METHOD_COLORS[sale.payment_method]}`}>
                              {sale.payment_method === 'plataforma' ? (sale.platform_name ?? 'Plataforma') : METHOD_LABELS[sale.payment_method]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{mxn(sale.subtotal)}</td>
                          <td className="px-4 py-3 text-amber-600">{sale.discount > 0 ? `-${mxn(sale.discount)}` : '—'}</td>
                          <td className={`px-4 py-3 font-bold ${isCancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>{mxn(sale.total)}</td>
                          <td className="px-4 py-3">
                            {isCancelled
                              ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Cancelada</span>
                              : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Completada</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {!isCancelled && (
                                <button
                                  onClick={() => setInvoiceSale({
                                    total: sale.total,
                                    payment_method: sale.payment_method,
                                    items: (sale.sale_items ?? []).map(i => ({
                                      name: i.product_name,
                                      quantity: i.quantity,
                                      unit_price: i.unit_price ?? (i.quantity > 0 ? i.subtotal / i.quantity : 0),
                                    })),
                                  })}
                                  className="text-gray-300 hover:text-blue-500 transition-colors" title="Facturar">
                                  <FileText className="w-4 h-4" />
                                </button>
                              )}
                              {!isCancelled && (
                                <button onClick={() => setCancelId(sale.id)}
                                  className="text-gray-300 hover:text-red-500 transition-colors" title="Cancelar venta">
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => setExpanded(expanded === sale.id ? null : sale.id)}
                                className="text-gray-400 hover:text-gray-700">
                                {expanded === sale.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded === sale.id && (
                          <tr key={`${sale.id}-detail`} className="bg-gray-50">
                            <td colSpan={8} className="px-8 py-3">
                              <div className="space-y-1">
                                {sale.sale_items?.map(item => (
                                  <div key={item.id} className="flex justify-between text-xs text-gray-600">
                                    <span>{item.product_name} × {item.quantity}</span>
                                    <span>{mxn(item.subtotal)}</span>
                                  </div>
                                ))}
                                {sale.payment_method === 'mixto' && Array.isArray(sale.payments) && (
                                  <div className="mt-2 pt-2 border-t border-gray-200 space-y-0.5">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Desglose de pago:</p>
                                    {sale.payments.map((p, i) => (
                                      <div key={i} className="flex justify-between text-xs text-gray-600">
                                        <span className="capitalize">{METHOD_LABELS[p.method] ?? p.method}</span>
                                        <span>{mxn(p.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {sale.discount_reason && (
                                  <p className="text-xs text-amber-600 mt-1">Descuento: {sale.discount_reason}</p>
                                )}
                                {sale.cancel_reason && (
                                  <p className="text-xs text-red-500 mt-1">Cancelada: {sale.cancel_reason}</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── TAB: Cobros por Día ── */}
      {activeTab === 'diario' && (
        <div className="space-y-4">
          {/* Filtro de sucursal para este panel */}
          <div className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3">
            <span className="text-sm text-gray-500 font-medium">Sucursal:</span>
            <div className="flex gap-1">
              <button onClick={() => setDailyBranch('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  dailyBranch === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                Todas
              </button>
              {branches.map(b => (
                <button key={b.id} onClick={() => setDailyBranch(b.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    dailyBranch === b.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl py-12 text-center text-gray-400 shadow-sm">Cargando...</div>
          ) : dailyRows.length === 0 ? (
            <div className="bg-white rounded-2xl py-12 text-center text-gray-400 shadow-sm">Sin ventas en el período seleccionado</div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Sucursal</th>
                    <th className="text-right px-3 py-3 text-xs text-green-600 font-medium">Efectivo</th>
                    <th className="text-right px-3 py-3 text-xs text-green-400 font-medium">%</th>
                    <th className="text-right px-3 py-3 text-xs text-blue-600 font-medium">Tarjeta</th>
                    <th className="text-right px-3 py-3 text-xs text-blue-400 font-medium">%</th>
                    <th className="text-right px-3 py-3 text-xs text-cyan-600 font-medium">Transferencia</th>
                    <th className="text-right px-3 py-3 text-xs text-cyan-400 font-medium">%</th>
                    <th className="text-right px-3 py-3 text-xs text-purple-600 font-medium">Plataforma</th>
                    <th className="text-right px-3 py-3 text-xs text-purple-400 font-medium">%</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-900 font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dailyRows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-700 font-medium whitespace-nowrap">
                        {new Date(row.date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {row.branch_name}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-green-700 font-medium">{row.efectivo > 0 ? mxn(row.efectivo) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-green-500 text-xs">{row.efectivo > 0 ? pct(row.efectivo, row.total) : ''}</td>
                      <td className="px-3 py-2.5 text-right text-blue-700 font-medium">{row.tarjeta > 0 ? mxn(row.tarjeta) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-blue-400 text-xs">{row.tarjeta > 0 ? pct(row.tarjeta, row.total) : ''}</td>
                      <td className="px-3 py-2.5 text-right text-cyan-700 font-medium">{row.transferencia > 0 ? mxn(row.transferencia) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-cyan-400 text-xs">{row.transferencia > 0 ? pct(row.transferencia, row.total) : ''}</td>
                      <td className="px-3 py-2.5 text-right text-purple-700 font-medium">{row.plataforma > 0 ? mxn(row.plataforma) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-purple-400 text-xs">{row.plataforma > 0 ? pct(row.plataforma, row.total) : ''}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">{mxn(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                {/* Fila de totales */}
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">
                      TOTAL ({dailyRows.length} {dailyRows.length === 1 ? 'día' : 'días'})
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-green-700">{mxn(dailyTotals.efectivo)}</td>
                    <td className="px-3 py-3 text-right text-xs text-green-500">{pct(dailyTotals.efectivo, dailyTotals.total)}</td>
                    <td className="px-3 py-3 text-right font-bold text-blue-700">{mxn(dailyTotals.tarjeta)}</td>
                    <td className="px-3 py-3 text-right text-xs text-blue-400">{pct(dailyTotals.tarjeta, dailyTotals.total)}</td>
                    <td className="px-3 py-3 text-right font-bold text-cyan-700">{mxn(dailyTotals.transferencia)}</td>
                    <td className="px-3 py-3 text-right text-xs text-cyan-400">{pct(dailyTotals.transferencia, dailyTotals.total)}</td>
                    <td className="px-3 py-3 text-right font-bold text-purple-700">{mxn(dailyTotals.plataforma)}</td>
                    <td className="px-3 py-3 text-right text-xs text-purple-400">{pct(dailyTotals.plataforma, dailyTotals.total)}</td>
                    <td className="px-4 py-3 text-right font-black text-gray-900 text-base">{mxn(dailyTotals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de facturación */}
      {invoiceSale && (
        <InvoiceModal sale={invoiceSale} onClose={() => setInvoiceSale(null)} />
      )}
    </div>
  )
}
