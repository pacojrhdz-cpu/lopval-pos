import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  FileText, ChevronLeft, ChevronRight, Printer,
  TrendingUp, Users, Wallet, DollarSign,
  Share2, BarChart2, Calendar, ShoppingBag,
  TrendingDown, Globe
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

const METHOD_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mixto: 'Mixto' }
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7) // 7am–10pm

// ── Histograma de barras CSS ─────────────────────────────────────────────────
function Histograma({ data, color = 'bg-gray-800', label = '' }) {
  if (!data || data.length === 0) return (
    <div className="text-center py-8 text-sm text-gray-400">Sin datos</div>
  )
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-1 h-28 w-full">
      {data.map((d, i) => {
        const pct = Math.round((d.value / max) * 100)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            {d.value > 0 && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                {label === 'mxn' ? mxn(d.value) : d.value}
              </div>
            )}
            <div className="w-full flex flex-col justify-end h-24">
              <div
                className={`w-full rounded-t-sm transition-all ${color} ${d.value === 0 ? 'opacity-10' : ''}`}
                style={{ height: `${Math.max(pct, d.value > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 leading-none">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── PDF semanal ──────────────────────────────────────────────────────────────
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

async function printWeekPDF({ branch, mon, sun, weekData }) {
  const logoB64 = await toBase64(LOGOS[branch?.id] ?? null)
  const logoHtml = logoB64
    ? `<img src="${logoB64}" style="height:48px;filter:invert(1) brightness(2)">`
    : `<div style="width:48px;height:48px;background:#333;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff">${(branch?.name ?? 'L').charAt(0)}</div>`

  const {
    totalVentas, numVentas, avgTicket,
    efectivo, tarjeta, transferencia,
    gastos, remanente,
    totalNomina, utilidad,
    gastosRows, nomRows
  } = weekData

  const gastosTabla = gastosRows.map((g, i) => `
    <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
      <td style="padding:7px 12px;font-size:12px">${new Date(g.created_at).toLocaleDateString('es-MX',{day:'numeric',month:'short'})}</td>
      <td style="padding:7px 12px;font-size:12px">${g.category ?? '—'}</td>
      <td style="padding:7px 12px;font-size:12px">${g.description ?? '—'}</td>
      <td style="padding:7px 12px;font-size:12px">${g.cashier_name ?? '—'}</td>
      <td style="padding:7px 12px;text-align:right;font-weight:700;font-size:12px;color:#dc2626">-${mxn(g.amount)}</td>
    </tr>`).join('')

  const nomTabla = (nomRows ?? []).map((row, i) => `
    <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
      <td style="padding:7px 12px;font-size:12px;font-weight:600">${row.emp.name}</td>
      <td style="padding:7px 12px;font-size:12px;color:#6b7280">${row.emp.position ?? '—'}</td>
      <td style="padding:7px 12px;text-align:center;font-size:12px">${row.dias}/6</td>
      <td style="padding:7px 12px;text-align:center;font-size:12px;color:${row.faltas>0?'#b45309':'#16a34a'}">${row.faltas>0?row.faltas:'—'}</td>
      <td style="padding:7px 12px;text-align:right;font-weight:700;font-size:12px">${mxn(row.pago)}</td>
    </tr>`).join('')

  const body = `
    <div style="background:#111;color:#fff;padding:20px 28px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#9ca3af">Grupo Lopval</div>
        <div style="font-size:20px;font-weight:900;margin-top:2px">Reporte Semanal</div>
        <div style="font-size:12px;color:#d1d5db;margin-top:3px">${branch?.name ?? 'Sucursal'} · ${fmtDate(mon,{day:'numeric',month:'short'})} – ${fmtDate(sun,{day:'numeric',month:'short',year:'numeric'})}</div>
      </div>${logoHtml}
    </div>
    <div style="padding:20px 28px;space-y:20px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
        ${[
          ['Ventas totales', mxn(totalVentas), `${numVentas} transacciones`],
          ['Ticket promedio', mxn(avgTicket), ''],
          ['Efectivo remanente', mxn(remanente), `${mxn(efectivo)} efectivo − ${mxn(gastos)} gastos`],
        ].map(([l,v,s]) => `
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px">
            <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px">${l}</div>
            <div style="font-size:20px;font-weight:900">${v}</div>
            ${s ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px">${s}</div>` : ''}
          </div>`).join('')}
      </div>

      <div style="margin-bottom:18px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#6b7280;margin-bottom:8px">Ventas por método de pago</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
          <thead><tr style="background:#111;color:#fff">
            <th style="text-align:left;padding:8px 12px;font-size:11px">Método</th>
            <th style="text-align:right;padding:8px 12px;font-size:11px">Total</th>
            <th style="text-align:right;padding:8px 12px;font-size:11px">%</th>
          </tr></thead>
          <tbody>
            ${[['Efectivo',efectivo],['Tarjeta',tarjeta],['Transferencia',transferencia]]
              .filter(([,v])=>v>0)
              .map(([l,v])=>`<tr><td style="padding:7px 12px;font-size:12px">${l}</td><td style="padding:7px 12px;text-align:right;font-weight:700;font-size:12px">${mxn(v)}</td><td style="padding:7px 12px;text-align:right;color:#9ca3af;font-size:11px">${totalVentas>0?((v/totalVentas)*100).toFixed(1):0}%</td></tr>`)
              .join('')}
          </tbody>
          <tfoot><tr style="background:#f9fafb;border-top:2px solid #e5e7eb">
            <td style="padding:8px 12px;font-size:12px;font-weight:700">Total</td>
            <td style="padding:8px 12px;text-align:right;font-weight:900;font-size:13px">${mxn(totalVentas)}</td>
            <td style="padding:8px 12px;text-align:right;color:#9ca3af;font-size:11px">100%</td>
          </tr></tfoot>
        </table>
      </div>

      ${gastosRows.length > 0 ? `
      <div style="margin-bottom:18px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#6b7280;margin-bottom:8px">Gastos del período — Total: ${mxn(gastos)}</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
          <thead><tr style="background:#dc2626;color:#fff">
            <th style="text-align:left;padding:8px 12px;font-size:11px">Fecha</th>
            <th style="text-align:left;padding:8px 12px;font-size:11px">Categoría</th>
            <th style="text-align:left;padding:8px 12px;font-size:11px">Descripción</th>
            <th style="text-align:left;padding:8px 12px;font-size:11px">Registró</th>
            <th style="text-align:right;padding:8px 12px;font-size:11px">Monto</th>
          </tr></thead>
          <tbody>${gastosTabla}</tbody>
          <tfoot><tr style="background:#fef2f2;border-top:2px solid #fecaca">
            <td colspan="4" style="padding:8px 12px;font-size:12px;font-weight:700">Total gastos</td>
            <td style="padding:8px 12px;text-align:right;font-weight:900;font-size:13px;color:#dc2626">-${mxn(gastos)}</td>
          </tr></tfoot>
        </table>
      </div>
      <div style="margin-bottom:18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:2px">Efectivo remanente</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px">${mxn(efectivo)} efectivo − ${mxn(gastos)} gastos</div>
        </div>
        <div style="font-size:24px;font-weight:900;color:#15803d">${mxn(remanente)}</div>
      </div>` : ''}

      ${nomRows?.length > 0 ? `
      <div style="margin-bottom:18px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#6b7280;margin-bottom:8px">Nómina semanal</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
          <thead><tr style="background:#111;color:#fff">
            <th style="text-align:left;padding:8px 12px;font-size:11px">Empleado</th>
            <th style="text-align:left;padding:8px 12px;font-size:11px">Puesto</th>
            <th style="text-align:center;padding:8px 12px;font-size:11px">Asistencias</th>
            <th style="text-align:center;padding:8px 12px;font-size:11px">Faltas</th>
            <th style="text-align:right;padding:8px 12px;font-size:11px">A pagar</th>
          </tr></thead>
          <tbody>${nomTabla}</tbody>
          <tfoot><tr style="background:#f9fafb;border-top:2px solid #e5e7eb">
            <td colspan="4" style="padding:8px 12px;font-size:12px;font-weight:700">Total nómina</td>
            <td style="padding:8px 12px;text-align:right;font-weight:900;font-size:13px">${mxn(totalNomina)}</td>
          </tr></tfoot>
        </table>
      </div>` : ''}

      <div style="background:${utilidad>=0?'#f0fdf4':'#fef2f2'};border:1px solid ${utilidad>=0?'#bbf7d0':'#fecaca'};border-radius:12px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:2px">Utilidad estimada</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px">${mxn(totalVentas)} ventas − ${mxn(gastos)} gastos − ${mxn(totalNomina)} nómina</div>
        </div>
        <div style="font-size:24px;font-weight:900;color:${utilidad>=0?'#15803d':'#dc2626'}">${mxn(utilidad)}</div>
      </div>

      <div style="margin-top:40px;display:flex;gap:48px">
        <div style="flex:1;border-top:1px solid #111;padding-top:8px">
          <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Gerente de Sucursal</div>
        </div>
        <div style="flex:1;border-top:1px solid #111;padding-top:8px">
          <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Director / Administrador</div>
        </div>
      </div>
      <div style="margin-top:20px;text-align:center;font-size:9px;color:#d1d5db;border-top:1px solid #e5e7eb;padding-top:10px">
        GRUPO LOPVAL · DOCUMENTO CONFIDENCIAL · USO INTERNO
      </div>
    </div>`

  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:0;border:none'
  document.body.appendChild(frame)
  const doc = frame.contentDocument ?? frame.contentWindow.document
  doc.open()
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;background:#fff}@page{size:A4;margin:0}</style>
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
  const [mode,       setMode]       = useState('day')
  const [weekAnchor, setWeekAnchor] = useState(new Date())
  const [branches,   setBranches]   = useState([])
  const [selBranch,  setSelBranch]  = useState(null)

  // Day data
  const [dayData,  setDayData]  = useState(null)
  const [dayLoad,  setDayLoad]  = useState(false)
  const [dayErr,   setDayErr]   = useState(null)

  // Week data
  const [weekData, setWeekData] = useState(null)
  const [weekLoad, setWeekLoad] = useState(false)
  const [weekErr,  setWeekErr]  = useState(null)

  // Global data
  const [globalData,  setGlobalData]  = useState(null)
  const [globalLoad,  setGlobalLoad]  = useState(false)

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
    if (!selBranch) return
    if (mode === 'day')    fetchDay()
    if (mode === 'week')   fetchWeek()
    if (mode === 'global') fetchGlobal()
  }, [selBranch, mode, weekAnchor])

  // ── Reporte del Día ────────────────────────────────────────────────────────
  async function fetchDay() {
    setDayLoad(true); setDayErr(null)
    try {
      const start = new Date(); start.setHours(0,0,0,0)
      const end   = new Date(); end.setHours(23,59,59,999)

      const [{ data: sales, error: eS }, { data: gastos, error: eG }] = await Promise.all([
        supabase.from('sales')
          .select('id, total, payment_method, created_at')
          .eq('branch_id', selBranch.id)
          .eq('status', 'completed')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString()),
        supabase.from('cash_movements')
          .select('amount, category, description, created_at')
          .eq('branch_id', selBranch.id)
          .eq('type', 'gasto')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString()),
      ])
      if (eS) throw eS
      // Fetch sale_items separately (avoid join issues)
      const saleIds = (sales ?? []).map(s => s.id)
      let topProducts = []
      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from('sale_items')
          .select('product_name, quantity, unit_price, subtotal')
          .in('sale_id', saleIds)
        const pmap = {}
        ;(items ?? []).forEach(it => {
          const k = it.product_name ?? 'Sin nombre'
          if (!pmap[k]) pmap[k] = { name: k, qty: 0, total: 0 }
          pmap[k].qty   += Number(it.quantity ?? 1)
          pmap[k].total += Number(it.subtotal ?? it.unit_price ?? 0) * Number(it.quantity ?? 1)
        })
        topProducts = Object.values(pmap).sort((a, b) => b.qty - a.qty).slice(0, 10)
      }

      const arr = sales ?? []
      const totalVentas = arr.reduce((s, r) => s + Number(r.total ?? 0), 0)
      const numVentas   = arr.length
      const avgTicket   = numVentas > 0 ? totalVentas / numVentas : 0
      const byMethod    = arr.reduce((acc, r) => {
        const m = r.payment_method ?? 'otro'
        acc[m] = (acc[m] ?? 0) + Number(r.total ?? 0)
        return acc
      }, {})

      // Histograma por hora
      const hourMap = {}
      arr.forEach(s => {
        const h = new Date(s.created_at).getHours()
        hourMap[h] = (hourMap[h] ?? 0) + 1
      })
      const histHoras = HOURS.map(h => ({
        label: h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`,
        value: hourMap[h] ?? 0
      }))

      // Histograma de ventas acumuladas (cada hora)
      const histMonto = HOURS.map(h => {
        const v = arr
          .filter(s => new Date(s.created_at).getHours() === h)
          .reduce((s, r) => s + Number(r.total ?? 0), 0)
        return {
          label: h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`,
          value: v
        }
      })

      const totalGastos = (gastos ?? []).reduce((s, g) => s + Number(g.amount ?? 0), 0)

      setDayData({ totalVentas, numVentas, avgTicket, byMethod, histHoras, histMonto, topProducts, gastos: gastos ?? [], totalGastos })
    } catch (e) {
      console.error('fetchDay', e)
      setDayErr('Error al cargar datos del día')
    } finally {
      setDayLoad(false)
    }
  }

  // ── Reporte Semanal ────────────────────────────────────────────────────────
  async function fetchWeek() {
    setWeekLoad(true); setWeekErr(null)
    try {
      const [
        { data: sales,      error: eS },
        { data: gastosMov,  error: eG },
        { data: employees,  error: eE },
        { data: attendance, error: eA },
        { data: cashRegs,   error: eCR },
      ] = await Promise.all([
        supabase.from('sales')
          .select('id, total, payment_method, payments')
          .eq('branch_id', selBranch.id)
          .eq('status', 'completed')
          .gte('created_at', mon.toISOString())
          .lte('created_at', sun.toISOString())
          .limit(5000),
        supabase.from('cash_movements')
          .select('id, amount, category, description, cashier_name, created_at')
          .eq('branch_id', selBranch.id)
          .eq('type', 'gasto')
          .gte('created_at', mon.toISOString())
          .lte('created_at', sun.toISOString())
          .order('created_at', { ascending: false }),
        supabase.from('employees')
          .select('id, name, position, weekly_salary')
          .eq('branch_id', selBranch.id)
          .eq('active', true)
          .order('name'),
        supabase.from('attendance')
          .select('employee_id, check_in')
          .eq('branch_id', selBranch.id)
          .gte('work_date', isoDate(mon))
          .lte('work_date', isoDate(sun)),
        supabase.from('cash_registers')
          .select('opening_amount, closing_amount')
          .eq('branch_id', selBranch.id)
          .gte('opening_at', mon.toISOString())
          .lte('opening_at', sun.toISOString()),
      ])
      if (eS) throw eS

      const arr = sales ?? []
      const totalVentas = arr.reduce((s, r) => s + Number(r.total ?? 0), 0)
      const numVentas   = arr.length
      const avgTicket   = numVentas > 0 ? totalVentas / numVentas : 0

      // Desglosar mixto via payments JSON
      let efectivo = 0, tarjeta = 0, transferencia = 0, otro = 0
      arr.forEach(s => {
        if (s.payment_method === 'mixto') {
          let pmts = []
          try { pmts = typeof s.payments === 'string' ? JSON.parse(s.payments) : (s.payments ?? []) } catch {}
          pmts.forEach(p => {
            const amt = Number(p.amount ?? 0)
            if (p.method === 'efectivo') efectivo += amt
            else if (p.method === 'tarjeta') tarjeta += amt
            else if (p.method === 'transferencia') transferencia += amt
            else otro += amt
          })
        } else {
          const t = Number(s.total ?? 0)
          if (s.payment_method === 'efectivo') efectivo += t
          else if (s.payment_method === 'tarjeta') tarjeta += t
          else if (s.payment_method === 'transferencia') transferencia += t
          else otro += t
        }
      })

      const gastosArr  = gastosMov ?? []
      const gastos     = gastosArr.reduce((s, g) => s + Number(g.amount ?? 0), 0)
      const remanente  = efectivo - gastos

      // Nómina
      const nomRows = (employees ?? []).map(emp => {
        const sueldo = Number(emp.weekly_salary ?? 0)
        const dias   = (attendance ?? []).filter(a => a.employee_id === emp.id && a.check_in).length
        const faltas = Math.max(0, 6 - dias)
        const pago   = dias === 0 ? 0 : Math.round((sueldo - faltas * (sueldo / 7)) * 100) / 100
        return { emp, dias, faltas, pago }
      })
      const totalNomina = nomRows.reduce((s, r) => s + r.pago, 0)
      const utilidad    = totalVentas - gastos - totalNomina

      const openTotal  = (cashRegs ?? []).reduce((s, r) => s + Number(r.opening_amount ?? 0), 0)
      const closeTotal = (cashRegs ?? []).reduce((s, r) => s + Number(r.closing_amount ?? 0), 0)
      const diffCaja   = closeTotal - openTotal - efectivo

      setWeekData({
        totalVentas, numVentas, avgTicket,
        efectivo, tarjeta, transferencia, otro,
        gastos, remanente, gastosRows: gastosArr,
        totalNomina, nomRows, utilidad,
        openTotal, closeTotal, diffCaja,
      })
    } catch (e) {
      console.error('fetchWeek', e)
      setWeekErr('Error al cargar datos de la semana')
    } finally {
      setWeekLoad(false)
    }
  }

  // ── Global: utilidad por sucursal ──────────────────────────────────────────
  async function fetchGlobal() {
    if (!isAdmin || branches.length === 0) return
    setGlobalLoad(true)
    try {
      const allBranches = branches
      const results = await Promise.all(allBranches.map(async b => {
        const [{ data: sales }, { data: gastos }, { data: employees }, { data: attendance }] = await Promise.all([
          supabase.from('sales').select('total')
            .eq('branch_id', b.id).eq('status', 'completed')
            .gte('created_at', mon.toISOString()).lte('created_at', sun.toISOString()),
          supabase.from('cash_movements').select('amount')
            .eq('branch_id', b.id).eq('type', 'gasto')
            .gte('created_at', mon.toISOString()).lte('created_at', sun.toISOString()),
          supabase.from('employees').select('id, weekly_salary').eq('branch_id', b.id).eq('active', true),
          supabase.from('attendance').select('employee_id, check_in')
            .eq('branch_id', b.id)
            .gte('work_date', isoDate(mon)).lte('work_date', isoDate(sun)),
        ])
        const ventas  = (sales   ?? []).reduce((s, r) => s + Number(r.total  ?? 0), 0)
        const gastosT = (gastos  ?? []).reduce((s, g) => s + Number(g.amount ?? 0), 0)
        const nomina  = (employees ?? []).reduce((s, emp) => {
          const sueldo = Number(emp.weekly_salary ?? 0)
          const dias   = (attendance ?? []).filter(a => a.employee_id === emp.id && a.check_in).length
          const faltas = Math.max(0, 6 - dias)
          const pago   = dias === 0 ? 0 : Math.round((sueldo - faltas * (sueldo / 7)) * 100) / 100
          return s + pago
        }, 0)
        return { branch: b.name, ventas, gastos: gastosT, nomina, utilidad: ventas - gastosT - nomina }
      }))
      setGlobalData(results)
    } catch (e) {
      console.error('fetchGlobal', e)
    } finally {
      setGlobalLoad(false)
    }
  }

  function prevWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate()-7); setWeekAnchor(d) }
  function nextWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate()+7); setWeekAnchor(d) }

  // ── WhatsApp día ───────────────────────────────────────────────────────────
  function shareWhatsApp() {
    if (!dayData) return
    const d    = dayData
    const fecha = new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })
    const metodos = Object.entries(d.byMethod)
      .map(([m, v]) => `${METHOD_LABELS[m] ?? m}: ${mxn(v)}`).join('\n')
    const tops = d.topProducts.slice(0, 5).map((p, i) => `  ${i+1}. ${p.name} × ${p.qty}`).join('\n')
    const gastosTxt = d.totalGastos > 0 ? `\n💸 *Gastos del día:* ${mxn(d.totalGastos)}` : ''
    const msg = [
      `📊 *Reporte del Día — ${selBranch?.name ?? ''}*`,
      `📅 ${fecha}`,
      ``,
      `💰 *Total ventas:* ${mxn(d.totalVentas)}`,
      `🧾 *Ticket promedio:* ${mxn(d.avgTicket)}`,
      `🛒 *Transacciones:* ${d.numVentas}`,
      gastosTxt,
      ``,
      `*Métodos de pago:*`,
      metodos,
      ``,
      `🏆 *Top productos:*`,
      tops,
      ``,
      `_Generado desde Grupo Lopval POS_`,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ── PDF Semana ─────────────────────────────────────────────────────────────
  async function handlePrint() {
    if (!weekData || !selBranch) return
    await printWeekPDF({ branch: selBranch, mon, sun, weekData })
  }

  const WeekNavBar = () => (
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
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-gray-800" />
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'day' && dayData && (
            <button onClick={shareWhatsApp}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
              <Share2 className="w-4 h-4" /> WhatsApp
            </button>
          )}
          {mode === 'week' && weekData && (
            <button onClick={handlePrint}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
              <Printer className="w-4 h-4" /> PDF
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { id: 'day',    icon: BarChart2, label: 'Hoy' },
          { id: 'week',   icon: Calendar,  label: 'Semana' },
          ...(isAdmin ? [{ id: 'global', icon: Globe, label: 'Global' }] : []),
        ].map(t => (
          <button key={t.id} onClick={() => setMode(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Selector sucursal */}
      <div className="flex flex-wrap gap-3 items-center">
        {(mode === 'week' || mode === 'global') && <WeekNavBar />}
        {mode === 'day' && (
          <div className="flex items-center gap-2">
            <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700">
              {new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })}
            </div>
            <button onClick={fetchDay}
              className="px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              ↻
            </button>
          </div>
        )}
        {isAdmin && branches.length > 1 && mode !== 'global' && (
          <select value={selBranch?.id ?? ''}
            onChange={e => setSelBranch(branches.find(b => b.id === e.target.value) ?? null)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {/* ══════════════════ REPORTE DEL DÍA ══════════════════ */}
      {mode === 'day' && (
        dayLoad ? <div className="text-center py-16 text-gray-400">Cargando datos de hoy...</div>
        : dayErr  ? <div className="text-center py-10 text-red-500 text-sm">{dayErr}</div>
        : dayData ? (
          <div className="space-y-4">

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total ventas',    value: mxn(dayData.totalVentas), sub: `${dayData.numVentas} transacciones` },
                { label: 'Ticket promedio', value: mxn(dayData.avgTicket),   sub: '' },
                { label: 'Gastos del día',  value: mxn(dayData.totalGastos), sub: '', red: true },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                  <p className={`text-xl font-black ${c.red && dayData.totalGastos > 0 ? 'text-red-600' : 'text-gray-900'}`}>{c.value}</p>
                  {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
                </div>
              ))}
            </div>

            {/* Histograma transacciones por hora */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Órdenes por hora
              </p>
              <Histograma data={dayData.histHoras} color="bg-gray-800" label="count" />
            </div>

            {/* Histograma ventas ($) por hora */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Ventas ($) por hora
              </p>
              <Histograma data={dayData.histMonto} color="bg-green-600" label="mxn" />
            </div>

            {/* Métodos de pago */}
            {Object.keys(dayData.byMethod).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" /> Métodos de pago
                </p>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                  {Object.entries(dayData.byMethod).map(([m, v]) => (
                    <div key={m} className="flex justify-between px-4 py-3 text-sm">
                      <span className="text-gray-600">{METHOD_LABELS[m] ?? m}</span>
                      <div className="text-right">
                        <span className="font-semibold text-gray-800">{mxn(v)}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {dayData.totalVentas > 0 ? ((v / dayData.totalVentas)*100).toFixed(0) : 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top productos */}
            {dayData.topProducts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" /> Productos más vendidos hoy
                </p>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {dayData.topProducts.map((p, i) => {
                    const max = dayData.topProducts[0]?.qty || 1
                    const pct = Math.round((p.qty / max) * 100)
                    return (
                      <div key={p.name} className={`px-4 py-3 ${i < dayData.topProducts.length-1 ? 'border-b border-gray-50' : ''}`}>
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-300 w-5 text-right">{i+1}</span>
                            <span className="text-sm font-semibold text-gray-800">{p.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-gray-800">{p.qty} pzas</span>
                            <span className="text-xs text-gray-400 ml-2">{mxn(p.total)}</span>
                          </div>
                        </div>
                        <div className="ml-7 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gray-800 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Gastos del día */}
            {dayData.gastos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-red-500" /> Gastos registrados hoy
                </p>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                  {dayData.gastos.map((g, i) => (
                    <div key={i} className="flex justify-between items-start px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-800">{g.category ?? '—'}{g.description ? ` · ${g.description}` : ''}</p>
                        <p className="text-xs text-gray-400">{new Date(g.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</p>
                      </div>
                      <span className="font-bold text-red-600 ml-4">-{mxn(g.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-16 text-gray-300">
            <BarChart2 className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-gray-400">Selecciona una sucursal</p>
          </div>
        )
      )}

      {/* ══════════════════ REPORTE SEMANAL ══════════════════ */}
      {mode === 'week' && (
        weekLoad ? <div className="text-center py-16 text-gray-400">Cargando datos de la semana...</div>
        : weekErr  ? <div className="text-center py-10 text-red-500 text-sm">{weekErr}</div>
        : weekData ? (
          <div className="space-y-4">

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Ventas totales',    value: mxn(weekData.totalVentas), sub: `${weekData.numVentas} transacciones` },
                { label: 'Ticket promedio',   value: mxn(weekData.avgTicket),   sub: '' },
                { label: 'Gastos período',    value: mxn(weekData.gastos),       sub: '', red: weekData.gastos > 0 },
                { label: 'Efectivo remanente',value: mxn(weekData.remanente),    sub: `${mxn(weekData.efectivo)} − ${mxn(weekData.gastos)}`, green: weekData.remanente >= 0 },
              ].map(c => (
                <div key={c.label} className={`rounded-2xl border shadow-sm p-4 ${
                  c.green ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100'
                }`}>
                  <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                  <p className={`text-xl font-black ${c.red ? 'text-red-600' : c.green ? 'text-green-700' : 'text-gray-900'}`}>{c.value}</p>
                  {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
                </div>
              ))}
            </div>

            {/* Efectivo vs tarjeta */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" /> Ventas por método de pago
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                {[
                  ['Efectivo',       weekData.efectivo],
                  ['Tarjeta',        weekData.tarjeta],
                  ['Transferencia',  weekData.transferencia],
                  ...(weekData.otro > 0 ? [['Otro', weekData.otro]] : []),
                ].filter(([,v]) => v > 0).map(([l, v]) => (
                  <div key={l} className="flex justify-between items-center px-4 py-3 text-sm">
                    <span className="text-gray-600">{l}</span>
                    <div className="text-right">
                      <span className="font-semibold text-gray-800">{mxn(v)}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        {weekData.totalVentas > 0 ? ((v/weekData.totalVentas)*100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gastos + Remanente */}
            {weekData.gastosRows.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-red-500" /> Gastos del período
                </p>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="divide-y divide-gray-50">
                    {weekData.gastosRows.map((g, i) => (
                      <div key={i} className="flex justify-between items-start px-4 py-3 text-sm">
                        <div>
                          <p className="font-medium text-gray-800">
                            {g.category ?? ''}
                            {g.description ? ` · ${g.description}` : ''}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Date(g.created_at).toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'})}
                            {g.cashier_name ? ` · ${g.cashier_name}` : ''}
                          </p>
                        </div>
                        <span className="font-bold text-red-600 ml-4 whitespace-nowrap">-{mxn(g.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-red-50 border-t border-red-100 px-4 py-3 flex justify-between text-sm font-bold">
                    <span className="text-red-700">Total gastos</span>
                    <span className="text-red-700">-{mxn(weekData.gastos)}</span>
                  </div>
                </div>

                {/* Cálculo efectivo remanente */}
                <div className="mt-3 bg-green-50 border border-green-100 rounded-2xl px-4 py-3 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600">Ventas en efectivo</span>
                    <span className="font-semibold">{mxn(weekData.efectivo)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">− Gastos del período</span>
                    <span className="font-semibold text-red-600">-{mxn(weekData.gastos)}</span>
                  </div>
                  <div className="flex justify-between border-t border-green-200 pt-2">
                    <span className="font-bold text-green-800">Efectivo remanente</span>
                    <span className={`font-black text-lg ${weekData.remanente >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {mxn(weekData.remanente)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Nómina */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Nómina
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                {weekData.nomRows.map(r => (
                  <div key={r.emp.id} className="flex justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{r.emp.name}</p>
                      <p className="text-xs text-gray-400">
                        {r.emp.position ?? ''} · {r.dias}/6 días
                        {r.faltas > 0 ? <span className="text-amber-600"> · {r.faltas} falta{r.faltas>1?'s':''}</span> : ''}
                      </p>
                    </div>
                    <span className="font-bold text-gray-800">{mxn(r.pago)}</span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-3 font-bold bg-gray-50 rounded-b-2xl">
                  <span className="text-gray-700">Total nómina</span>
                  <span className="text-gray-900">{mxn(weekData.totalNomina)}</span>
                </div>
              </div>
            </div>

            {/* Utilidad */}
            <div className={`rounded-2xl border shadow-sm px-4 py-4 ${
              weekData.utilidad >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
            }`}>
              <p className="text-xs text-gray-500 mb-1">Utilidad estimada · ventas − gastos − nómina</p>
              <p className={`text-3xl font-black ${weekData.utilidad >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {mxn(weekData.utilidad)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {mxn(weekData.totalVentas)} − {mxn(weekData.gastos)} − {mxn(weekData.totalNomina)}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-300">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-gray-400">Selecciona una sucursal y período</p>
          </div>
        )
      )}

      {/* ══════════════════ GLOBAL (ADMIN) ══════════════════ */}
      {mode === 'global' && (
        globalLoad ? <div className="text-center py-16 text-gray-400">Calculando utilidad por sucursal...</div>
        : globalData ? (
          <div className="space-y-4">

            {/* Histograma de utilidad */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Utilidad por sucursal — semana {fmtDate(mon,{day:'numeric',month:'short'})}–{fmtDate(sun,{day:'numeric',month:'short',year:'numeric'})}
              </p>
              <Histograma
                data={globalData.map(r => ({ label: r.branch.split(' ')[0], value: Math.max(r.utilidad, 0) }))}
                color="bg-green-600"
                label="mxn"
              />
            </div>

            {/* Tabla por sucursal */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Detalle por sucursal
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="grid grid-cols-5 gap-0 bg-gray-900 text-white text-xs font-semibold uppercase tracking-wider px-4 py-3">
                  <span>Sucursal</span>
                  <span className="text-right">Ventas</span>
                  <span className="text-right">Gastos</span>
                  <span className="text-right">Nómina</span>
                  <span className="text-right">Utilidad</span>
                </div>
                {globalData.map((r, i) => (
                  <div key={r.branch} className={`grid grid-cols-5 gap-0 px-4 py-3 text-sm ${i < globalData.length-1 ? 'border-b border-gray-50' : ''}`}>
                    <span className="font-semibold text-gray-800">{r.branch}</span>
                    <span className="text-right text-gray-700">{mxn(r.ventas)}</span>
                    <span className="text-right text-red-600">-{mxn(r.gastos)}</span>
                    <span className="text-right text-amber-700">-{mxn(r.nomina)}</span>
                    <span className={`text-right font-bold ${r.utilidad >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {mxn(r.utilidad)}
                    </span>
                  </div>
                ))}
                <div className="grid grid-cols-5 gap-0 px-4 py-3 text-sm bg-gray-50 border-t border-gray-200 font-bold">
                  <span className="text-gray-700">Total</span>
                  <span className="text-right">{mxn(globalData.reduce((s,r)=>s+r.ventas,0))}</span>
                  <span className="text-right text-red-600">-{mxn(globalData.reduce((s,r)=>s+r.gastos,0))}</span>
                  <span className="text-right text-amber-700">-{mxn(globalData.reduce((s,r)=>s+r.nomina,0))}</span>
                  <span className={`text-right ${globalData.reduce((s,r)=>s+r.utilidad,0)>=0?'text-green-700':'text-red-600'}`}>
                    {mxn(globalData.reduce((s,r)=>s+r.utilidad,0))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-300">
            <Globe className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-gray-400">Cargando datos globales...</p>
          </div>
        )
      )}
    </div>
  )
}
