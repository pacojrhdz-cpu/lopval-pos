import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { mxn, fmtDateTime } from '../../utils/format'
import { Search, ChevronDown, ChevronUp, XCircle, AlertTriangle, X } from 'lucide-react'

const METHOD_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', plataforma: 'Plataforma' }
const METHOD_COLORS = {
  efectivo:   'bg-green-100 text-green-700',
  tarjeta:    'bg-blue-100 text-blue-700',
  plataforma: 'bg-purple-100 text-purple-700',
}

export default function SalesHistory() {
  const [sales,        setSales]       = useState([])
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

  useEffect(() => { fetchSales() }, [dateFrom, dateTo, filter, statusFilter])

  async function fetchSales() {
    setLoading(true)
    let q = supabase
      .from('sales')
      .select('*, sale_items(*)')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo   + 'T23:59:59')
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    if (filter !== 'all')       q = q.eq('payment_method', filter)
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

  const filtered = sales.filter(s =>
    !search || s.cashier_name?.toLowerCase().includes(search.toLowerCase()) || mxn(s.total).includes(search)
  )

  const totals = filtered.filter(s => s.status === 'completed').reduce((acc, s) => ({
    ventas:     acc.ventas     + Number(s.total),
    descuentos: acc.descuentos + Number(s.discount),
    count:      acc.count + 1,
  }), { ventas: 0, descuentos: 0, count: 0 })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Historial de Ventas</h1>

      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        <span className="text-gray-400">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />

        <div className="flex gap-1">
          {['all','efectivo','tarjeta','plataforma'].map(m => (
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

      {/* Tabla */}
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
    </div>
  )
}
