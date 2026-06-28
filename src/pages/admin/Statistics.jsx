import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { mxn, startOfDay, endOfDay, startOfWeek, startOfMonth, startOfYear } from '../../utils/format'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'

const PERIODS = [
  { id: 'today',   label: 'Hoy' },
  { id: 'week',    label: 'Esta semana' },
  { id: 'month',   label: 'Este mes' },
  { id: 'year',    label: 'Este año' },
  { id: 'custom',  label: 'Personalizado' },
]

const PIE_COLORS = ['#DC2626', '#2563EB', '#9333EA', '#16A34A', '#CA8A04']

export default function Statistics() {
  const [period,    setPeriod]    = useState('week')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [sales,     setSales]     = useState([])
  const [items,     setItems]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const now = new Date()

  useEffect(() => { fetchData() }, [period, dateFrom, dateTo])

  function getRange() {
    switch (period) {
      case 'today':  return { from: startOfDay(now),   to: endOfDay(now) }
      case 'week':   return { from: startOfWeek(now),  to: endOfDay(now) }
      case 'month':  return { from: startOfMonth(now), to: endOfDay(now) }
      case 'year':   return { from: startOfYear(now),  to: endOfDay(now) }
      case 'custom': return { from: dateFrom + 'T00:00:00', to: dateTo + 'T23:59:59' }
      default: return { from: startOfWeek(now), to: endOfDay(now) }
    }
  }

  async function fetchData() {
    if (period === 'custom' && (!dateFrom || !dateTo)) return
    setLoading(true)
    const { from, to } = getRange()

    const [{ data: s }, { data: i }] = await Promise.all([
      supabase.from('sales').select('*').gte('created_at', from).lte('created_at', to).eq('status','completed'),
      supabase.from('sale_items').select('*, sales!inner(created_at,status)').gte('sales.created_at', from).lte('sales.created_at', to).eq('sales.status','completed'),
    ])
    setSales(s ?? [])
    setItems(i ?? [])
    setLoading(false)
  }

  // ── Métricas ──────────────────────────────────────────────
  const totalRevenue  = sales.reduce((s, v) => s + Number(v.total), 0)
  const totalDiscount = sales.reduce((s, v) => s + Number(v.discount), 0)
  const avgTicket     = sales.length ? totalRevenue / sales.length : 0
  const totalItems    = items.reduce((s, i) => s + i.quantity, 0)

  // ── Ventas por día ────────────────────────────────────────
  const dayMap = {}
  sales.forEach(s => {
    const day = new Date(s.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })
    dayMap[day] = (dayMap[day] || 0) + Number(s.total)
  })
  const dailyData = Object.entries(dayMap).map(([day, total]) => ({ day, total }))

  // ── Por hora (solo para hoy/semana) ──────────────────────
  const hourBuckets = Array(24).fill(0)
  sales.forEach(s => { hourBuckets[new Date(s.created_at).getHours()] += Number(s.total) })
  const hourlyData = hourBuckets.map((v,i) => ({ hora: `${String(i).padStart(2,'0')}h`, ventas: v })).filter(h => h.ventas > 0)

  // ── Por método ────────────────────────────────────────────
  const methodMap = {}
  sales.forEach(s => {
    const k = s.payment_method === 'plataforma' ? (s.platform_name ?? 'Plataforma') : s.payment_method
    if (!methodMap[k]) methodMap[k] = { count: 0, total: 0 }
    methodMap[k].count++
    methodMap[k].total += Number(s.total)
  })
  const methodData = Object.entries(methodMap).map(([name, d]) => ({ name: capitalize(name), ...d }))

  // ── Top productos ─────────────────────────────────────────
  const prodMap = {}
  items.forEach(i => {
    if (!prodMap[i.product_name]) prodMap[i.product_name] = { qty: 0, revenue: 0 }
    prodMap[i.product_name].qty     += i.quantity
    prodMap[i.product_name].revenue += Number(i.subtotal)
  })
  const topProds = Object.entries(prodMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([name, d]) => ({ name, ...d }))

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Estadísticas</h1>

      {/* Selector de período */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-2 items-center">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              period === p.id ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            <span className="text-gray-400">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Cargando estadísticas...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Ingresos totales', value: mxn(totalRevenue), sub: `${sales.length} ventas` },
              { label: 'Ticket promedio',  value: mxn(avgTicket),    sub: 'por orden' },
              { label: 'Productos vendidos',value: totalItems,        sub: 'unidades' },
              { label: 'Descuentos',        value: mxn(totalDiscount), sub: 'aplicados' },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-gray-500 text-xs mb-1">{k.label}</p>
                <p className="text-xl font-black text-gray-900">{k.value}</p>
                <p className="text-gray-400 text-xs mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Gráfica de ventas diarias */}
          {dailyData.length > 1 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Ventas por día</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => mxn(v)} />
                  <Line type="monotone" dataKey="total" stroke="#DC2626" strokeWidth={2} dot={{ fill: '#DC2626' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Histograma horario */}
          {hourlyData.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Histograma de ventas por hora</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourlyData}>
                  <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => mxn(v)} />
                  <Bar dataKey="ventas" fill="#DC2626" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Métodos de pago */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Desglose por método de pago</h2>
              {methodData.length > 0 ? (
                <>
                  <div className="space-y-3 mb-4">
                    {methodData.map((m, i) => (
                      <div key={m.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-sm text-gray-700">{m.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-800">{mxn(m.total)}</p>
                          <p className="text-xs text-gray-400">{m.count} ventas</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={methodData} dataKey="total" cx="50%" cy="50%" outerRadius={65}>
                        {methodData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => mxn(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </>
              ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>}
            </div>

            {/* Top productos */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Top 10 productos por ingresos</h2>
              {topProds.length > 0 ? (
                <div className="space-y-2">
                  {topProds.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className="text-sm font-black text-gray-200 w-5">{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between">
                          <span className="text-xs font-medium text-gray-700 truncate">{p.name}</span>
                          <span className="text-xs text-gray-400 ml-1">{p.qty} pzas</span>
                        </div>
                        <div className="mt-0.5 bg-gray-100 rounded-full h-1.5">
                          <div className="bg-red-500 h-1.5 rounded-full"
                            style={{ width: `${(p.revenue / topProds[0].revenue) * 100}%` }} />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-red-600 w-16 text-right">{mxn(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
