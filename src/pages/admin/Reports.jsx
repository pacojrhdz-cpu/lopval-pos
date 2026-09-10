import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  FileText, ChevronLeft, ChevronRight, Printer,
  TrendingUp, Users, Wallet, DollarSign
} from 'lucide-react'

const mxn = n => `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

function weekRange(date) {
  const d   = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0,0,0,0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999)
  return { mon, sun }
}

function isoDate(d) { return d.toISOString().split('T')[0] }

function fmtDate(d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return d.toLocaleDateString('es-MX', opts)
}

async function toBase64(url) {
  if (!url) return null
  try {
    const abs = url.startsWith('http') ? url : window.location.origin + url
    const blob = await fetch(abs).then(r => r.blob())
    return new Promise(res => {
      const reader = new FileReader()
      reader.onloadend = () => res(reader.result)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

const LOGOS = {
  'aaaaaaaa-0000-0000-0000-000000000001': '/logo.svg',
  'aaaaaaaa-0000-0000-0000-000000000002': '/logo-foviste.svg',
  'aaaaaaaa-0000-0000-0000-000000000003': '/logo.svg',
  'aaaaaaaa-0000-0000-0000-000000000004': '/logo.svg',
}

function statCard(icon, label, value, sub = '', color = '#111') {
  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px">
      <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px">${label}</div>
      <div style="font-size:24px;font-weight:900;color:${color};line-height:1">${value}</div>
      ${sub ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px">${sub}</div>` : ''}
    </div>`
}

async function generatePDF({ branch, mon, sun, sales, cashRegs, employees, attendance }) {
  const logoUrl = LOGOS[branch?.id] ?? null
  const logoB64 = await toBase64(logoUrl)

  const logoHtml = logoB64
    ? `<img src="${logoB64}" style="height:52px;filter:invert(1) brightness(2)">`
    : `<div style="width:48px;height:48px;background:#333;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff">${(branch?.name ?? 'L').charAt(0)}</div>`

  // ── Ventas ───────────────────────────────────────────────────────────────
  const totalVentas   = sales.reduce((s, r) => s + Number(r.total ?? 0), 0)
  const numVentas     = sales.length
  const avgTicket     = numVentas > 0 ? totalVentas / numVentas : 0

  const byMethod = sales.reduce((acc, r) => {
    const m = r.payment_method ?? 'otro'
    acc[m] = (acc[m] ?? 0) + Number(r.total ?? 0)
    return acc
  }, {})

  const methodLabels = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' }
  const metodosRows = Object.entries(byMethod).map(([m, v]) => `
    <tr>
      <td style="padding:7px 12px;font-size:12px">${methodLabels[m] ?? m}</td>
      <td style="padding:7px 12px;text-align:right;font-weight:700;font-size:12px">${mxn(v)}</td>
      <td style="padding:7px 12px;text-align:right;color:#9ca3af;font-size:11px">${totalVentas > 0 ? ((v / totalVentas)*100).toFixed(1) : 0}%</td>
    </tr>`).join('')

  // ── Caja / Efectivo ───────────────────────────────────────────────────────
  const cashSales   = byMethod['cash'] ?? 0
  const openTotal   = cashRegs.reduce((s, r) => s + Number(r.opening_amount ?? 0), 0)
  const closeTotal  = cashRegs.reduce((s, r) => s + Number(r.closing_amount ?? 0), 0)
  const diffCaja    = closeTotal - openTotal - cashSales

  // ── Nómina ────────────────────────────────────────────────────────────────
  const WORK_DAYS = 6   // días laborales por semana
  const WEEK_DAYS = 7   // divisor para salario diario (incluye día de descanso pagado)
  const nomRows = employees.map(emp => {
    const sueldo    = Number(emp.weekly_salary ?? 0)
    const dias      = attendance.filter(a => a.employee_id === emp.id && a.check_in).length
    const faltas    = Math.max(0, WORK_DAYS - dias)
    const diario    = sueldo / WEEK_DAYS
    const pago      = dias === 0 ? 0 : Math.round((sueldo - faltas * diario) * 100) / 100
    return { emp, dias, faltas, pago }
  })
  const totalNomina = nomRows.reduce((s, r) => s + r.pago, 0)
  const totalSueldo = employees.reduce((s, e) => s + Number(e.weekly_salary ?? 0), 0)

  const nomTabla = nomRows.map((row, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
      <td style="padding:8px 12px;font-size:12px;font-weight:600">${row.emp.name}</td>
      <td style="padding:8px 12px;font-size:12px;color:#6b7280">${row.emp.position ?? '—'}</td>
      <td style="padding:8px 12px;text-align:center;font-size:12px">${row.dias}/6</td>
      <td style="padding:8px 12px;text-align:center;font-size:12px;color:${row.faltas > 0 ? '#b45309' : '#16a34a'}">${row.faltas > 0 ? row.faltas : '—'}</td>
      <td style="padding:8px 12px;text-align:right;font-size:12px">${mxn(row.emp.weekly_salary)}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:700;font-size:12px;color:${row.pago > 0 ? '#111' : '#d1d5db'}">${mxn(row.pago)}</td>
    </tr>`).join('')

  // ── Utilidad estimada ─────────────────────────────────────────────────────
  const utilidad = totalVentas - totalNomina

  const body = `
    <!-- Header -->
    <div style="background:#111;color:#fff;padding:22px 32px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">Grupo Lopval</div>
        <div style="font-size:22px;font-weight:900">Reporte Administrativo</div>
        <div style="font-size:12px;color:#d1d5db;margin-top:4px">${branch?.name ?? 'Sucursal'} · ${fmtDate(mon, { day:'numeric', month:'short' })} – ${fmtDate(sun, { day:'numeric', month:'short', year:'numeric' })}</div>
      </div>
      ${logoHtml}
    </div>

    <!-- Meta -->
    <div style="background:#f3f4f6;padding:10px 32px;font-size:10px;color:#9ca3af;display:flex;gap:32px;border-bottom:1px solid #e5e7eb">
      <span>Generado: ${new Date().toLocaleString('es-MX', { dateStyle:'long', timeStyle:'short' })}</span>
      <span>Período: Semana ${mon.toLocaleDateString('es-MX', { year:'numeric', month:'short', day:'numeric' })} – ${sun.toLocaleDateString('es-MX', { year:'numeric', month:'short', day:'numeric' })}</span>
    </div>

    <div style="padding:24px 32px;space-y:24px">

      <!-- KPIs -->
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#6b7280;margin-bottom:12px">Resumen ejecutivo</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
        ${statCard('', 'Ventas totales',  mxn(totalVentas),  `${numVentas} transacciones`)}
        ${statCard('', 'Ticket promedio', mxn(avgTicket),    '')}
        ${statCard('', 'Nómina a pagar',  mxn(totalNomina),  `vs ${mxn(totalSueldo)} base`, '#b45309')}
        ${statCard('', 'Utilidad est.',   mxn(utilidad),     'ventas − nómina', utilidad >= 0 ? '#15803d' : '#dc2626')}
      </div>

      <!-- Ventas por método -->
      <div style="margin-bottom:24px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#6b7280;margin-bottom:10px">Ventas por método de pago</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
          <thead>
            <tr style="background:#111;color:#fff">
              <th style="text-align:left;padding:9px 12px;font-size:11px">Método</th>
              <th style="text-align:right;padding:9px 12px;font-size:11px">Total</th>
              <th style="text-align:right;padding:9px 12px;font-size:11px">%</th>
            </tr>
          </thead>
          <tbody>${metodosRows}</tbody>
          <tfoot>
            <tr style="background:#f9fafb;border-top:2px solid #e5e7eb">
              <td style="padding:9px 12px;font-size:12px;font-weight:700">Total</td>
              <td style="padding:9px 12px;text-align:right;font-weight:900;font-size:13px">${mxn(totalVentas)}</td>
              <td style="padding:9px 12px;text-align:right;color:#9ca3af;font-size:11px">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Caja / Efectivo -->
      <div style="margin-bottom:24px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#6b7280;margin-bottom:10px">Corte de caja — efectivo</div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
          ${[
            ['Fondo inicial (apertura)', openTotal, ''],
            ['Ventas en efectivo', cashSales, '+'],
            ['Cierre registrado', closeTotal, '='],
            ['Diferencia', diffCaja, diffCaja === 0 ? '✓' : diffCaja > 0 ? '▲' : '▼'],
          ].map(([l, v, icon], i) => `
            <div style="display:flex;justify-content:space-between;padding:10px 16px;${i < 3 ? 'border-bottom:1px solid #f3f4f6' : ''};${i === 3 ? `background:${Math.abs(diffCaja) < 1 ? '#f0fdf4' : '#fff7ed'}` : ''}">
              <span style="font-size:12px;color:#374151">${icon} ${l}</span>
              <span style="font-weight:${i === 3 ? '900' : '700'};font-size:${i === 3 ? '14px' : '12px'};color:${i === 3 ? (Math.abs(diffCaja) < 1 ? '#15803d' : '#b45309') : '#111'}">${mxn(v)}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- Nómina -->
      <div style="margin-bottom:24px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#6b7280;margin-bottom:10px">Nómina semanal por asistencia</div>
        ${employees.length === 0
          ? '<p style="font-size:12px;color:#9ca3af;text-align:center;padding:16px">Sin empleados en este período</p>'
          : `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
            <thead>
              <tr style="background:#111;color:#fff">
                <th style="text-align:left;padding:9px 12px;font-size:11px">Empleado</th>
                <th style="text-align:left;padding:9px 12px;font-size:11px">Puesto</th>
                <th style="text-align:center;padding:9px 12px;font-size:11px">Asistencias</th>
                <th style="text-align:center;padding:9px 12px;font-size:11px">Faltas</th>
                <th style="text-align:right;padding:9px 12px;font-size:11px">Sueldo base</th>
                <th style="text-align:right;padding:9px 12px;font-size:11px">A pagar</th>
              </tr>
            </thead>
            <tbody>${nomTabla}</tbody>
            <tfoot>
              <tr style="background:#f9fafb;border-top:2px solid #e5e7eb">
                <td colspan="4" style="padding:9px 12px;font-size:12px;font-weight:700">Total nómina</td>
                <td style="padding:9px 12px;text-align:right;font-size:12px;color:#6b7280">${mxn(totalSueldo)}</td>
                <td style="padding:9px 12px;text-align:right;font-weight:900;font-size:13px">${mxn(totalNomina)}</td>
              </tr>
            </tfoot>
          </table>`}
      </div>

      <!-- Firma -->
      <div style="margin-top:40px;display:flex;gap:48px">
        <div style="flex:1"><div style="border-top:1.5px solid #111;padding-top:8px">
          <div style="font-size:11px;font-weight:700">______________________________</div>
          <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Gerente de Sucursal</div>
        </div></div>
        <div style="flex:1"><div style="border-top:1.5px solid #111;padding-top:8px">
          <div style="font-size:11px;font-weight:700">______________________________</div>
          <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Director / Administrador</div>
        </div></div>
      </div>

      <div style="margin-top:24px;text-align:center;font-size:9px;color:#d1d5db;letter-spacing:1px;border-top:1px solid #e5e7eb;padding-top:12px">
        GRUPO LOPVAL · DOCUMENTO CONFIDENCIAL · USO INTERNO
      </div>
    </div>`

  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:0;border:none'
  document.body.appendChild(frame)
  const doc = frame.contentDocument ?? frame.contentWindow.document
  doc.open()
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;background:#fff}
    @page{size:A4;margin:0}</style>
    </head><body>${body}</body></html>`)
  doc.close()
  setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print() } catch {}
    setTimeout(() => { try { document.body.removeChild(frame) } catch {} }, 2500)
  }, 600)
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Reports() {
  const { activeBranch, isAdmin } = useAuth()
  const [weekAnchor, setWeekAnchor] = useState(new Date())
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [branches,   setBranches]   = useState([])
  const [selBranch,  setSelBranch]  = useState(null)

  const { mon, sun } = weekRange(weekAnchor)
  const isCurrentWeek = isoDate(mon) === isoDate(weekRange(new Date()).mon)

  useEffect(() => {
    if (isAdmin) {
      supabase.from('branches').select('*').eq('active', true).order('name')
        .then(({ data }) => {
          setBranches(data ?? [])
          if (!selBranch && data?.[0]) setSelBranch(data[0])
        })
    } else {
      setSelBranch(activeBranch)
    }
  }, [isAdmin, activeBranch])

  useEffect(() => {
    if (selBranch) fetchReport()
  }, [selBranch, mon])

  async function fetchReport() {
    if (!selBranch) return
    setLoading(true)

    const [
      { data: sales },
      { data: cashRegs },
      { data: employees },
      { data: attendance },
    ] = await Promise.all([
      supabase.from('sales')
        .select('id, total, payment_method, created_at')
        .eq('branch_id', selBranch.id)
        .eq('status', 'completed')
        .gte('created_at', mon.toISOString())
        .lte('created_at', sun.toISOString()),
      supabase.from('cash_registers')
        .select('opening_amount, closing_amount, status, opening_at')
        .eq('branch_id', selBranch.id)
        .gte('opening_at', mon.toISOString())
        .lte('opening_at', sun.toISOString()),
      supabase.from('employees')
        .select('id, name, position, weekly_salary')
        .eq('branch_id', selBranch.id)
        .eq('active', true)
        .order('name'),
      supabase.from('attendance')
        .select('employee_id, work_date, check_in')
        .eq('branch_id', selBranch.id)
        .gte('work_date', isoDate(mon))
        .lte('work_date', isoDate(sun)),
    ])

    setData({
      sales:      sales ?? [],
      cashRegs:   cashRegs ?? [],
      employees:  employees ?? [],
      attendance: attendance ?? [],
    })
    setLoading(false)
  }

  function prevWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate()-7); setWeekAnchor(d) }
  function nextWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate()+7); setWeekAnchor(d) }

  // Calcular KPIs para vista previa
  const kpis = (() => {
    if (!data) return null
    const { sales, cashRegs, employees, attendance } = data
    const totalVentas  = sales.reduce((s, r) => s + Number(r.total ?? 0), 0)
    const numVentas    = sales.length
    const avgTicket    = numVentas > 0 ? totalVentas / numVentas : 0
    const cashSales    = sales.filter(r => r.payment_method === 'cash').reduce((s, r) => s + Number(r.total ?? 0), 0)
    const openTotal    = cashRegs.reduce((s, r) => s + Number(r.opening_amount ?? 0), 0)
    const closeTotal   = cashRegs.reduce((s, r) => s + Number(r.closing_amount ?? 0), 0)
    const diffCaja     = closeTotal - openTotal - cashSales
    const totalNomina  = employees.reduce((s, emp) => {
      const sueldo  = Number(emp.weekly_salary ?? 0)
      const dias    = attendance.filter(a => a.employee_id === emp.id && a.check_in).length
      const faltas  = Math.max(0, 6 - dias)
      const pago    = dias === 0 ? 0 : Math.round((sueldo - faltas * (sueldo / 7)) * 100) / 100
      return s + pago
    }, 0)
    const utilidad = totalVentas - totalNomina
    return { totalVentas, numVentas, avgTicket, cashSales, openTotal, closeTotal, diffCaja, totalNomina, utilidad }
  })()

  async function handlePrint() {
    if (!data || !selBranch) return
    await generatePDF({ branch: selBranch, mon, sun, ...data })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-gray-800" />
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        </div>
        {data && (
          <button onClick={handlePrint}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <Printer className="w-4 h-4" /> Imprimir / Descargar PDF
          </button>
        )}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Selector de semana */}
        <div className="flex items-center gap-2">
          <button onClick={prevWeek}
            className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 min-w-[200px] text-center">
            {fmtDate(mon, { day:'numeric', month:'short' })} — {fmtDate(sun, { day:'numeric', month:'short', year:'numeric' })}
          </div>
          <button onClick={nextWeek} disabled={isCurrentWeek}
            className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Selector de sucursal (solo admin) */}
        {isAdmin && branches.length > 1 && (
          <select value={selBranch?.id ?? ''}
            onChange={e => setSelBranch(branches.find(b => b.id === e.target.value) ?? null)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {/* KPI cards */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Cargando datos...</div>
      ) : kpis ? (
        <div className="space-y-4">
          {/* Ventas */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Ventas
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Total ventas',    value: mxn(kpis.totalVentas), sub: `${kpis.numVentas} transacciones` },
                { label: 'Ticket promedio', value: mxn(kpis.avgTicket),   sub: '' },
                { label: 'Ventas efectivo', value: mxn(kpis.cashSales),   sub: '' },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                  <p className="text-xl font-black text-gray-900">{c.value}</p>
                  {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Caja */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> Caja — efectivo
            </p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {[
                { l: 'Fondo apertura',       v: mxn(kpis.openTotal)  },
                { l: 'Ventas en efectivo',   v: mxn(kpis.cashSales)  },
                { l: 'Cierre registrado',    v: mxn(kpis.closeTotal) },
              ].map(r => (
                <div key={r.l} className="flex justify-between px-4 py-3 text-sm">
                  <span className="text-gray-600">{r.l}</span>
                  <span className="font-semibold text-gray-800">{r.v}</span>
                </div>
              ))}
              <div className={`flex justify-between px-4 py-3 text-sm rounded-b-2xl font-bold ${
                Math.abs(kpis.diffCaja) < 1 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
              }`}>
                <span>Diferencia de caja</span>
                <span>{mxn(kpis.diffCaja)} {Math.abs(kpis.diffCaja) < 1 ? '✓' : '⚠️'}</span>
              </div>
            </div>
          </div>

          {/* Nómina */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Nómina
            </p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-gray-600">Total a pagar esta semana</span>
              <span className="text-lg font-black text-gray-900">{mxn(kpis.totalNomina)}</span>
            </div>
          </div>

          {/* Utilidad */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Utilidad estimada
            </p>
            <div className={`rounded-2xl border shadow-sm px-4 py-4 ${
              kpis.utilidad >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
            }`}>
              <p className="text-xs text-gray-500 mb-1">Ventas − Nómina</p>
              <p className={`text-3xl font-black ${kpis.utilidad >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {mxn(kpis.utilidad)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {mxn(kpis.totalVentas)} ventas − {mxn(kpis.totalNomina)} nómina
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-gray-300">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-gray-400">Selecciona una sucursal y período</p>
        </div>
      )}
    </div>
  )
}
