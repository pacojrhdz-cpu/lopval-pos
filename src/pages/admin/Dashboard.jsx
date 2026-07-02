import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { mxn, fmtTime } from '../../utils/format'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { TrendingUp, ShoppingBag, Tag, Clock, Zap, Calendar, Building2 } from 'lucide-react'

const PIE_COLORS = {
  efectivo:      '#16A34A',
  tarjeta:       '#2563EB',
  transferencia: '#EA580C',
  plataforma:    '#9333EA',
}

// Convierte "2026-07-02" a rango UTC respetando hora local (evita bug de timezone)
function localDayRange(dateStr) {
  const start = new Date(dateStr + 'T00:00:00')
  const end   = new Date(dateStr + 'T23:59:59.999')
  return { from: start.toISOString(), to: end.toISOString() }
}

export default function Dashboard() {
  const [branches,    setBranches]    = useState([])
  const [selBranch,   setSelBranch]   = useState('')
  const [selDate,     setSelDate]     = useState(new Date().toISOString().split('T')[0])
  const [stats,       setStats]       = useState({ total: 0, count: 0, discount: 0, avgTicket: 0 })
  const [hourlyData,  setHourlyData]  = useState([])
  const [methodData,  setMethodData]  = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [liveFeed,    setLiveFeed]    = useState([])

  useEffect(() => { fetchBranches() }, [])
  useEffect(() => { fetchStats() }, [selDate, selBranch])

  useEffect(() => {
    const channel = supabase
      .channel('sales-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, () => {
        fetchStats()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [selDate, selBranch])

  async function fetchBranches() {
    const { data } = await supabase.from('branches').select('id, name').eq('active', true)
    setBranches(data ?? [])
  }

  async function fetchStats() {
    const { from, to } = localDayRange(selDate)

    let q = supabase
      .from('sales')
      .select('id, total, discount, payment_method, platform_name, created_at, cashier_name, branch_id')
      .gte('created_at', from)
      .lte('created_at', to)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })

    if (selBranch) q = q.eq('branch_id', selBranch)

    const { data: sales } = await q
    if (!sales) return

    // KPIs
    const totalVentas   = sales.reduce((s, v) => s + Number(v.total), 0)
    const totalDiscount = sales.reduce((s, v) => s + Number(v.discount), 0)
    setStats({
      total:     totalVentas,
      count:     sales.length,
      discount:  totalDiscount,
      avgTicket: sales.length ? totalVentas / sales.length : 0,
    })

    setLiveFeed(sales.slice(0, 10))

    // Histograma por hora (hora local)
    const hourBuckets = Array(24).fill(0)
    sales.forEach(s => {
      const h = new Date(s.created_at).getHours()
      hourBuckets[h] += Number(s.total)
    })
    setHourlyData(hourBuckets.map((val, i) => ({ hora: `${String(i).padStart(2,'0')}h`, ventas: val })))

    // Por método de pago
    const methodMap = {}
    sales.forEach(s => {
      const key = s.payment_method === 'plataforma' ? (s.platform_name ?? 'Plataforma') : s.payment_method
      methodMap[key] = (methodMap[key] || 0) + Number(s.total)
    })
    setMethodData(Object.entries(methodMap).map(([name, value]) => ({ name: capitalize(name), value })))

    // Top productos (usando sale_ids directamente)
    const saleIds = sales.map(s => s.id)
    if (saleIds.length > 0) {
      const { data: items } = await supabase
        .from('sale_items')
        .select('product_name, quantity, subtotal')
        .in('sale_id', saleIds)
      if (items) {
        const productMap = {}
        items.forEach(i => {
          if (!productMap[i.product_name]) productMap[i.product_name] = { qty: 0, revenue: 0 }
          productMap[i.product_name].qty     += i.quantity
          productMap[i.product_name].revenue += Number(i.subtotal)
        })
        setTopProducts(
          Object.entries(productMap)
            .sort((a, b) => b[1].qty - a[1].qty)
            .slice(0, 8)
            .map(([name, data]) => ({ name, ...data }))
        )
      }
    } else {
      setTopProducts([])
    }
  }

  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)

  const pieColor = (name) => {
    const n = name.toLowerCase()
    if (n.includes('efectivo'))      return PIE_COLORS.efectivo
    if (n.includes('tarjeta'))       return PIE_COLORS.tarjeta
    if (n.includes('transferencia')) return PIE_COLORS.transferencia
    return PIE_COLORS.plataforma
  }

  const displayDate = new Date(selDate + 'T12:00:00').toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm capitalize">{displayDate}</p>
        </div>
        <div className="flex items-center gap-2 bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-sm font-medium">
          <Zap className="w-4 h-4" /> En vivo
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2 shadow-sm">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={selDate}
            onChange={e => setSelDate(e.target.value)}
            className="text-sm text-gray-700 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2 shadow-sm">
          <Building2 className="w-4 h-4 text-gray-400" />
          <select
            value={selBranch}
            onChange={e => setSelBranch(e.target.value)}
            className="text-sm text-gray-700 focus:outline-none bg-transparent"
          >
            <option value="">Todas las sucursales</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={TrendingUp}  label="Ventas del día"   value={mxn(stats.total)}     color="red"    />
        <KPICard icon={ShoppingBag} label="Órdenes"          value={stats.count}           color="blue"   />
        <KPICard icon={Clock}       label="Ticket promedio"  value={mxn(stats.avgTicket)}  color="purple" />
        <KPICard icon={Tag}         label="Descuentos"       value={mxn(stats.discount)}   color="amber"  />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Histograma por hora */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Ventas por hora</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v/1000}k`} />
              <Tooltip formatter={v => mxn(v)} labelFormatter={l => `Hora: ${l}`} />
              <Bar dataKey="ventas" fill="#DC2626" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Métodos de pago */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Métodos de pago</h2>
          {methodData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={methodData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                  {methodData.map((entry, idx) => (
                    <Cell key={idx} fill={pieColor(entry.name)} />
                  ))}
                </Pie>
                <Legend formatter={v => <span className="text-xs">{v}</span>} />
                <Tooltip formatter={v => mxn(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Sin ventas</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top productos */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Productos más vendidos</h2>
          {topProducts.length > 0 ? (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-lg font-black text-gray-200 w-6">{i+1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-sm font-medium text-gray-800 truncate">{p.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{p.qty} pzas</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-red-500 h-1.5 rounded-full"
                        style={{ width: `${(p.qty / topProducts[0].qty) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-red-600 w-20 text-right">{mxn(p.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-300 text-sm">Sin datos todavía</div>
          )}
        </div>

        {/* Feed en tiempo real */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Ventas en tiempo real
          </h2>
          {liveFeed.length > 0 ? (
            <div className="space-y-2">
              {liveFeed.map(sale => (
                <div key={sale.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{mxn(sale.total)}</p>
                    <p className="text-xs text-gray-400">{sale.cashier_name} · {fmtTime(sale.created_at)}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    sale.payment_method === 'efectivo'      ? 'bg-green-100 text-green-700'   :
                    sale.payment_method === 'tarjeta'       ? 'bg-blue-100 text-blue-700'     :
                    sale.payment_method === 'transferencia' ? 'bg-orange-100 text-orange-700' :
                                                              'bg-purple-100 text-purple-700'
                  }`}>
                    {sale.payment_method === 'plataforma' ? sale.platform_name ?? 'Plataforma' : sale.payment_method}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-300 text-sm">
              <Zap className="w-8 h-8 mb-2" />
              Esperando ventas...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KPICard({ icon: Icon, label, value, color }) {
  const colors = {
    red:    'bg-red-50 text-red-600',
    blue:   'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    amber:  'bg-amber-50 text-amber-600',
  }
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className="text-xl font-black text-gray-900">{value}</p>
    </div>
  )
}
