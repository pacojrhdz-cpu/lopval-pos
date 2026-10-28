import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { mxn } from '../../utils/format'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, PlusCircle, X, CheckCircle, AlertTriangle } from 'lucide-react'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const BRANCH_COLORS = { Cholula: '#2563eb', Pachuca: '#16a34a' }

function pct(a, b) {
  if (!b) return 0
  return ((a - b) / b * 100)
}

function TrendBadge({ val }) {
  if (val > 2)  return <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold"><TrendingUp className="w-3 h-3" />+{val.toFixed(1)}%</span>
  if (val < -2) return <span className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold"><TrendingDown className="w-3 h-3" />{val.toFixed(1)}%</span>
  return <span className="inline-flex items-center gap-1 text-gray-400 text-xs"><Minus className="w-3 h-3" />{val.toFixed(1)}%</span>
}

const currencyFmt = v => `$${(v/1000).toFixed(0)}k`

export default function HistoricalSales() {
  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [branch,     setBranch]     = useState('Cholula') // 'Cholula' | 'Pachuca' | 'ambas'
  const [view,       setView]       = useState('anual')    // 'anual' | 'mensual'
  const [yearA,      setYearA]      = useState(2024)
  const [yearB,      setYearB]      = useState(2025)
  // Cierre de mes
  const [showCierre, setShowCierre] = useState(false)
  const [cierreYear, setCierreYear] = useState(new Date().getFullYear())
  const [cierreMes,  setCierreMes]  = useState(new Date().getMonth() + 1) // 1-12
  const [preview,    setPreview]    = useState(null)  // [{branch_name, efectivo, tarjeta, plataforma, total}]
  const [calculating,setCalculating]= useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveMsg,    setSaveMsg]    = useState(null)  // {type:'ok'|'error', text}

  function loadHistory() {
    supabase
      .from('monthly_sales_history')
      .select('*')
      .order('year').order('month_num')
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }

  useEffect(() => { loadHistory() }, [])

  async function calcularCierre() {
    setCalculating(true)
    setPreview(null)
    setSaveMsg(null)

    const start = new Date(cierreYear, cierreMes - 1, 1).toISOString()
    const end   = new Date(cierreYear, cierreMes, 0, 23, 59, 59, 999).toISOString()

    const { data: sales } = await supabase
      .from('sales')
      .select('branch_id, total, payment_method, payments')
      .eq('status', 'completed')
      .gte('created_at', start)
      .lte('created_at', end)
      .limit(10000)

    const { data: brs } = await supabase.from('branches').select('id, name').eq('active', true)
    const branchMap = Object.fromEntries((brs ?? []).map(b => [b.id, b.name]))

    const map = {}
    for (const s of (sales ?? [])) {
      const bn = branchMap[s.branch_id] ?? s.branch_id
      if (!map[bn]) map[bn] = { branch_name: bn, efectivo: 0, tarjeta: 0, transferencia: 0, plataforma: 0, total: 0 }
      const row = map[bn]
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
    setPreview(Object.values(map))
    setCalculating(false)
  }

  async function guardarCierre() {
    if (!preview?.length) return
    setSaving(true)
    setSaveMsg(null)
    const upserts = preview.map(p => ({
      year:       cierreYear,
      month_num:  cierreMes,
      month_name: MONTHS[cierreMes - 1],
      branch_name:  p.branch_name,
      efectivo:     p.efectivo,
      tarjeta:      p.tarjeta,
      plataforma:   p.plataforma,
      otros:        0,
      total:        p.total,
    }))
    const { error } = await supabase
      .from('monthly_sales_history')
      .upsert(upserts, { onConflict: 'year,month_num,branch_name' })
    if (error) {
      setSaveMsg({ type: 'error', text: error.message })
    } else {
      setSaveMsg({ type: 'ok', text: `${MONTHS[cierreMes - 1]} ${cierreYear} guardado correctamente.` })
      loadHistory()
    }
    setSaving(false)
  }

  const years = useMemo(() => [...new Set(rows.map(r => r.year))].sort(), [rows])
  const branches = useMemo(() => [...new Set(rows.map(r => r.branch_name))].sort(), [rows])

  // Totales anuales por sucursal
  const annualData = useMemo(() => {
    const map = {}
    for (const r of rows) {
      if (!map[r.year]) map[r.year] = { year: r.year }
      const key = r.branch_name
      map[r.year][key] = (map[r.year][key] ?? 0) + Number(r.total)
    }
    return Object.values(map).sort((a, b) => a.year - b.year)
  }, [rows])

  // Comparativa mensual entre dos años (filtrado por sucursal)
  const monthlyCompare = useMemo(() => {
    const filtered = rows.filter(r =>
      (branch === 'ambas' || r.branch_name === branch) &&
      (r.year === yearA || r.year === yearB)
    )
    const byMonthYear = {}
    for (const r of filtered) {
      const m = r.month_num
      if (!byMonthYear[m]) byMonthYear[m] = { month: MONTHS[m - 1], monthNum: m }
      const k = `${r.branch_name}_${r.year}`
      byMonthYear[m][k] = (byMonthYear[m][k] ?? 0) + Number(r.total)
      // Also total per year
      byMonthYear[m][`total_${r.year}`] = (byMonthYear[m][`total_${r.year}`] ?? 0) + Number(r.total)
    }
    return Object.values(byMonthYear).sort((a, b) => a.monthNum - b.monthNum)
  }, [rows, branch, yearA, yearB])

  // Tabla de crecimiento anual por sucursal
  const growthTable = useMemo(() => {
    return branches.map(br => {
      const byYear = {}
      rows.filter(r => r.branch_name === br).forEach(r => {
        byYear[r.year] = (byYear[r.year] ?? 0) + Number(r.total)
      })
      return { branch: br, byYear }
    })
  }, [rows, branches])

  // Desglose mensual para un año+sucursal
  const monthlyBreakdown = useMemo(() => {
    return rows
      .filter(r => r.branch_name === branch && r.year === yearA && branch !== 'ambas')
      .sort((a, b) => a.month_num - b.month_num)
  }, [rows, branch, yearA])

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64 text-gray-400">Cargando históricos...</div>
  )

  if (rows.length === 0) return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Histórico de Ventas</h1>
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
        <p className="text-amber-700 font-medium">No hay datos históricos cargados aún.</p>
        <p className="text-amber-600 text-sm mt-1">Ejecuta el SQL <code>sql-historicos.sql</code> en Supabase para importar los datos.</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Histórico de Ventas</h1>
        <button onClick={() => { setShowCierre(true); setPreview(null); setSaveMsg(null) }}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          <PlusCircle className="w-4 h-4" /> Registrar mes
        </button>
      </div>

      {/* Modal Cierre de Mes */}
      {showCierre && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Registrar cierre de mes</h2>
              <button onClick={() => setShowCierre(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-700" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <p className="text-sm text-gray-500">Selecciona el mes y año que quieres agregar al histórico. Se tomarán las ventas completadas de ese período del sistema actual.</p>
              <div className="flex gap-3 items-center">
                <select value={cierreMes} onChange={e => { setCierreMes(Number(e.target.value)); setPreview(null) }}
                  className="border rounded-xl px-3 py-2 text-sm focus:outline-none bg-white flex-1">
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <input type="number" value={cierreYear} min="2019" max="2030"
                  onChange={e => { setCierreYear(Number(e.target.value)); setPreview(null) }}
                  className="border rounded-xl px-3 py-2 text-sm focus:outline-none w-24" />
                <button onClick={calcularCierre} disabled={calculating}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium text-sm px-4 py-2 rounded-xl transition-colors whitespace-nowrap">
                  {calculating ? 'Calculando...' : 'Calcular'}
                </button>
              </div>

              {preview && preview.length === 0 && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-xl p-3 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  No hay ventas completadas en ese período.
                </div>
              )}

              {preview && preview.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vista previa — {MONTHS[cierreMes - 1]} {cierreYear}</p>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs text-gray-500">Sucursal</th>
                          <th className="text-right px-3 py-2 text-xs text-green-600">Efectivo</th>
                          <th className="text-right px-3 py-2 text-xs text-blue-600">Tarjeta</th>
                          <th className="text-right px-3 py-2 text-xs text-purple-600">Plataforma</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-700 font-bold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {preview.map((p, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-medium text-gray-800">{p.branch_name}</td>
                            <td className="px-3 py-2 text-right text-green-700">{p.efectivo > 0 ? mxn(p.efectivo) : '—'}</td>
                            <td className="px-3 py-2 text-right text-blue-700">{p.tarjeta > 0 ? mxn(p.tarjeta) : '—'}</td>
                            <td className="px-3 py-2 text-right text-purple-700">{p.plataforma > 0 ? mxn(p.plataforma) : '—'}</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900">{mxn(p.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-400">Si ya existe un registro para este mes/sucursal se sobreescribirá.</p>
                </div>
              )}

              {saveMsg && (
                <div className={`flex items-center gap-2 rounded-xl p-3 text-sm ${saveMsg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {saveMsg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {saveMsg.text}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex gap-2">
              <button onClick={() => setShowCierre(false)}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm font-medium transition-colors">
                Cerrar
              </button>
              <button onClick={guardarCierre} disabled={!preview?.length || saving}
                className="flex-1 bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white font-bold rounded-xl py-2.5 text-sm transition-colors">
                {saving ? 'Guardando...' : 'Guardar en histórico'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controles */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {['Cholula','Pachuca','ambas'].map(b => (
            <button key={b} onClick={() => setBranch(b)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                branch === b ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {b === 'ambas' ? 'Ambas' : b}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {['anual','mensual'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                view === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {v === 'anual' ? 'Vista anual' : 'Comparar años'}
            </button>
          ))}
        </div>
        {view === 'mensual' && (
          <div className="flex items-center gap-2">
            <select value={yearA} onChange={e => setYearA(Number(e.target.value))}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-gray-400 text-sm">vs</span>
            <select value={yearB} onChange={e => setYearB(Number(e.target.value))}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {view === 'anual' && branch !== 'ambas' && (
          <select value={yearA} onChange={e => setYearA(Number(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {/* ── Vista Anual ── */}
      {view === 'anual' && (
        <>
          {/* Gráfica de barras anuales */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Total por año</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={annualData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={currencyFmt} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => mxn(v)} />
                <Legend />
                {branches.map(br => (
                  <Bar key={br} dataKey={br} name={br} fill={BRANCH_COLORS[br] ?? '#6b7280'} radius={[4,4,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla de crecimiento */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Sucursal</th>
                  {years.map(y => (
                    <th key={y} className="text-right px-4 py-3 text-xs text-gray-500 font-medium">{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {growthTable.map(({ branch: br, byYear }) => (
                  <tr key={br} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{br}</td>
                    {years.map((y, i) => {
                      const val = byYear[y]
                      const prev = byYear[years[i - 1]]
                      const growth = prev ? pct(val, prev) : null
                      return (
                        <td key={y} className="px-4 py-3 text-right">
                          {val ? (
                            <div>
                              <span className="font-medium text-gray-900">{mxn(val)}</span>
                              {growth !== null && (
                                <div className="mt-0.5"><TrendBadge val={growth} /></div>
                              )}
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Desglose mensual del año seleccionado para una sola sucursal */}
          {branch !== 'ambas' && monthlyBreakdown.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">{branch} · {yearA} · Desglose mensual</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyBreakdown} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month_name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={currencyFmt} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, n) => [mxn(v), n]} />
                  <Legend />
                  <Bar dataKey="efectivo"   name="Efectivo"   fill="#16a34a" stackId="a" radius={[0,0,0,0]} />
                  <Bar dataKey="tarjeta"    name="Tarjeta"    fill="#2563eb" stackId="a" />
                  <Bar dataKey="plataforma" name="Plataforma" fill="#9333ea" stackId="a" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ── Comparativa Mensual ── */}
      {view === 'mensual' && (
        <>
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              {branch === 'ambas' ? 'Ambas sucursales' : branch} · {yearA} vs {yearB}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyCompare}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={currencyFmt} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => mxn(v)} />
                <Legend />
                {branch !== 'ambas' ? (
                  <>
                    <Line type="monotone" dataKey={`total_${yearA}`} name={String(yearA)} stroke="#2563eb" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey={`total_${yearB}`} name={String(yearB)} stroke="#16a34a" strokeWidth={2} dot={false} />
                  </>
                ) : (
                  branches.flatMap(br => [
                    <Line key={`${br}_${yearA}`} type="monotone" dataKey={`${br}_${yearA}`} name={`${br} ${yearA}`} stroke={BRANCH_COLORS[br]} strokeWidth={2} dot={false} strokeDasharray="4 2" />,
                    <Line key={`${br}_${yearB}`} type="monotone" dataKey={`${br}_${yearB}`} name={`${br} ${yearB}`} stroke={BRANCH_COLORS[br]} strokeWidth={2} dot={false} />,
                  ])
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla comparativa */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Mes</th>
                  <th className="text-right px-4 py-3 text-xs text-blue-600 font-medium">{yearA}</th>
                  <th className="text-right px-4 py-3 text-xs text-green-600 font-medium">{yearB}</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Variación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthlyCompare.map((row, i) => {
                  const a = row[`total_${yearA}`] ?? 0
                  const b = row[`total_${yearB}`] ?? 0
                  const diff = pct(b, a)
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700">{row.month}</td>
                      <td className="px-4 py-2.5 text-right text-blue-700 font-medium">{a ? mxn(a) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-green-700 font-medium">{b ? mxn(b) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">{a && b ? <TrendBadge val={diff} /> : '—'}</td>
                    </tr>
                  )
                })}
                {/* Totales */}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-4 py-3 text-gray-700">TOTAL</td>
                  <td className="px-4 py-3 text-right text-blue-700">
                    {mxn(monthlyCompare.reduce((s, r) => s + (r[`total_${yearA}`] ?? 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-green-700">
                    {mxn(monthlyCompare.reduce((s, r) => s + (r[`total_${yearB}`] ?? 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <TrendBadge val={pct(
                      monthlyCompare.reduce((s, r) => s + (r[`total_${yearB}`] ?? 0), 0),
                      monthlyCompare.reduce((s, r) => s + (r[`total_${yearA}`] ?? 0), 0)
                    )} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
