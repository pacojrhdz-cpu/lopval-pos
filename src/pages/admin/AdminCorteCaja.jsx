import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { mxn } from '../../utils/format'
import { Scissors, ChevronDown, ChevronRight, Clock, Printer } from 'lucide-react'

export default function AdminCorteCaja() {
  const [registers,    setRegisters]    = useState([])
  const [branches,     setBranches]     = useState([])
  const [branchFilter, setBranchFilter] = useState('all')
  const [loading,      setLoading]      = useState(true)
  const [expanded,     setExpanded]     = useState(null)
  const [dateFrom,     setDateFrom]     = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => {
    supabase.from('branches').select('*').eq('active', true).order('name').then(({ data }) => setBranches(data ?? []))
  }, [])

  useEffect(() => { fetchRegisters() }, [dateFrom, dateTo, branchFilter])

  async function fetchRegisters() {
    setLoading(true)
    let q = supabase
      .from('cash_registers')
      .select('*')
      .gte('opening_at', dateFrom + 'T00:00:00')
      .lte('opening_at', dateTo   + 'T23:59:59')
      .order('opening_at', { ascending: false })
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter)
    const { data: regs } = await q
    const base = regs ?? []

    // Para cajas ABIERTAS: calcular totales en tiempo real desde sales
    const openIds = base.filter(r => r.status === 'open').map(r => r.id)
    let liveMap = {}
    if (openIds.length > 0) {
      const { data: liveSales } = await supabase
        .from('sales')
        .select('cash_register_id, total, payment_method, payments')
        .in('cash_register_id', openIds)
        .eq('status', 'completed')

      for (const s of liveSales ?? []) {
        const id = s.cash_register_id
        if (!liveMap[id]) liveMap[id] = { total_sales: 0, total_cash: 0, total_card: 0, total_transfer: 0, total_platform: 0 }
        liveMap[id].total_sales += Number(s.total ?? 0)
        // Detectar método de pago (mixto usa el array payments)
        if (s.payment_method === 'mixto' && Array.isArray(s.payments)) {
          for (const p of s.payments) {
            const amt = Number(p.amount ?? 0)
            if (p.method === 'efectivo')       liveMap[id].total_cash     += amt
            else if (p.method === 'tarjeta')   liveMap[id].total_card     += amt
            else if (p.method === 'transferencia') liveMap[id].total_transfer += amt
            else                               liveMap[id].total_platform += amt
          }
        } else {
          const amt = Number(s.total ?? 0)
          if (s.payment_method === 'efectivo')       liveMap[id].total_cash     += amt
          else if (s.payment_method === 'tarjeta')   liveMap[id].total_card     += amt
          else if (s.payment_method === 'transferencia') liveMap[id].total_transfer += amt
          else                                       liveMap[id].total_platform += amt
        }
      }
    }

    // Mezclar: para cajas abiertas usar totales en vivo; para cerradas usar los guardados
    setRegisters(base.map(r =>
      r.status === 'open' && liveMap[r.id] ? { ...r, ...liveMap[r.id] } : r
    ))
    setLoading(false)
  }

  const totalVentas = registers.reduce((s, r) => s + Number(r.total_sales ?? 0), 0)

  function printCorte(reg) {
    const LOGOS = {
      'aaaaaaaa-0000-0000-0000-000000000001': '/logo.svg',
      'aaaaaaaa-0000-0000-0000-000000000002': '/logo-foviste.svg',
      'aaaaaaaa-0000-0000-0000-000000000003': '/logo.svg',
      'aaaaaaaa-0000-0000-0000-000000000004': '/logo.svg',
    }
    const BRANCH_INFO = {
      'aaaaaaaa-0000-0000-0000-000000000001': { address: 'Santa Matilde, Privadas Santa Matilde, Hgo.' },
      'aaaaaaaa-0000-0000-0000-000000000002': {
        address: 'La Cintal 30, Fovissste III, 29050 Tuxtla Gutiérrez, Chis.',
        phone:   '961 386 3750',
        hours:   'Miércoles a lunes · 3 p.m. a 10:30 p.m.',
      },
      'aaaaaaaa-0000-0000-0000-000000000003': { address: 'Calle Ignacio Allende, Santiago Momoxpan, San Andrés Cholula, Pue.' },
      'aaaaaaaa-0000-0000-0000-000000000004': { address: 'Av. La Principal, San Antonio, Pachuca de Soto, Hgo.' },
    }

    const branchName = branches.find(b => b.id === reg.branch_id)?.name ?? 'Sucursal'
    const apertura   = new Date(reg.opening_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
    const cierre     = reg.closing_at
      ? new Date(reg.closing_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
      : 'En curso'
    const diff     = reg.difference ?? 0
    const logoPath = LOGOS[reg.branch_id]
    const info     = BRANCH_INFO[reg.branch_id]
    const origin   = window.location.origin
    const logoTag  = logoPath
      ? `<img src="${origin}${logoPath}" alt="Logo" style="display:block;margin:0 auto 4px;height:48px;object-fit:contain;">`
      : ''
    const infoBlock = info
      ? `<p class="sub">${info.address}</p><p class="sub">Tel: ${info.phone}</p><p class="sub">${info.hours}</p>`
      : ''

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Corte de Caja</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; width: 74mm; margin: 0 auto; padding: 2mm 1mm; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h2 { text-align: center; font-size: 17px; font-weight: 900; margin: 0 0 2px; }
      .sub { text-align: center; font-size: 12px; font-weight: 700; color: #111; margin: 2px 0; }
      .divider { border-top: 2px dashed #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 13px; font-weight: 700; }
      .bold { font-weight: 900; font-size: 14px; }
      .diff-ok { color: green; } .diff-neg { color: red; } .diff-pos { color: #b45309; }
      img { display: block; margin: 0 auto; }
    </style></head><body>
    ${logoTag}
    <h2>${branchName}</h2>
    <p class="sub">Grupo Lopval</p>
    ${infoBlock}
    <p class="sub">Corte de Caja</p>
    <p class="sub">Apertura: ${apertura}</p>
    <p class="sub">Cierre: ${cierre}</p>
    <div class="divider"></div>
    <div class="row"><span>Cajero</span><span>${reg.cashier_name ?? ''}</span></div>
    <div class="row"><span>Apertura caja</span><span>$${Number(reg.opening_amount ?? 0).toFixed(2)}</span></div>
    <div class="divider"></div>
    <div class="row"><span>Efectivo</span><span>$${Number(reg.total_cash     ?? 0).toFixed(2)}</span></div>
    <div class="row"><span>Tarjeta</span><span>$${Number(reg.total_card     ?? 0).toFixed(2)}</span></div>
    <div class="row"><span>Transferencia</span><span>$${Number(reg.total_transfer ?? 0).toFixed(2)}</span></div>
    <div class="row"><span>Plataformas</span><span>$${Number(reg.total_platform ?? 0).toFixed(2)}</span></div>
    <div class="divider"></div>
    <div class="row bold"><span>Total ventas</span><span>$${Number(reg.total_sales ?? 0).toFixed(2)}</span></div>
    ${reg.closing_at ? `
    <div class="row"><span>Efectivo contado</span><span>$${Number(reg.closing_amount ?? 0).toFixed(2)}</span></div>
    <div class="row bold ${Math.abs(diff) < 1 ? 'diff-ok' : diff < 0 ? 'diff-neg' : 'diff-pos'}">
      <span>Diferencia</span><span>${diff >= 0 ? '+' : ''}$${diff.toFixed(2)}</span></div>` : ''}
    ${reg.notes ? `<div class="divider"></div><p style="font-size:10px">Notas: ${reg.notes}</p>` : ''}
    <div class="divider"></div>
    </body></html>`

    const w = window.open('', '_blank', 'width=400,height=600')
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Scissors className="w-6 h-6 text-gray-800" />
        <h1 className="text-2xl font-bold text-gray-900">Cortes de Caja</h1>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        <span className="text-gray-400">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white">
          <option value="all">Todas las sucursales</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        {registers.length > 0 && (
          <div className="ml-auto text-sm text-gray-600">
            <span className="font-bold text-gray-900">{registers.length}</span> turno{registers.length !== 1 ? 's' : ''} ·
            Total: <span className="font-bold text-gray-900">{mxn(totalVentas)}</span>
          </div>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : registers.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <Scissors className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Sin turnos en el período seleccionado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registers.map(reg => {
            const isOpen = reg.status === 'open'
            const isExp  = expanded === reg.id
            return (
              <div key={reg.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setExpanded(isExp ? null : reg.id)}
                >
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    isOpen ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isOpen ? '● Abierto' : 'Cerrado'}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{reg.cashier_name}</p>
                    <p className="text-xs text-blue-600 font-medium">
                      {branches.find(b => b.id === reg.branch_id)?.name ?? 'Sucursal'}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(reg.opening_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                      {reg.closing_at ? ` → ${new Date(reg.closing_at).toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'})}` : ' (en curso)'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{mxn(reg.total_sales ?? 0)}</p>
                    <p className="text-xs text-gray-400">{isOpen ? '🔴 en vivo' : 'en ventas'}</p>
                  </div>
                  {isExp ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {isExp && (
                  <div className="border-t px-5 py-4 bg-gray-50 grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-white rounded-xl p-3 space-y-1.5">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Caja</p>
                      <Row label="Apertura" value={mxn(reg.opening_amount)} />
                      {!isOpen && (
                        <>
                          <Row label="Conteo final" value={mxn(reg.closing_amount ?? 0)} />
                          <div className="border-t pt-1.5">
                            <Row
                              label="Diferencia"
                              value={`${(reg.difference ?? 0) >= 0 ? '+' : ''}${mxn(reg.difference ?? 0)}`}
                              cls={(reg.difference ?? 0) >= 0 ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="bg-white rounded-xl p-3 space-y-1.5">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Ventas</p>
                      <Row label="Efectivo"      value={mxn(reg.total_cash     ?? 0)} cls="text-green-700" />
                      <Row label="Tarjeta"       value={mxn(reg.total_card     ?? 0)} cls="text-blue-700" />
                      <Row label="Transferencia" value={mxn(reg.total_transfer ?? 0)} cls="text-cyan-700" />
                      <Row label="Plataformas"   value={mxn(reg.total_platform ?? 0)} cls="text-purple-700" />
                      <div className="border-t pt-1.5">
                        <Row label="Total" value={mxn(reg.total_sales ?? 0)} cls="font-bold text-gray-900" />
                      </div>
                    </div>
                    {reg.notes && (
                      <div className="col-span-2 bg-white rounded-xl p-3 text-sm text-gray-600">
                        <p className="text-xs text-gray-400 mb-1">Notas:</p>
                        {reg.notes}
                      </div>
                    )}
                    <div className="col-span-2 flex justify-end">
                      <button
                        onClick={() => printCorte(reg)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 text-white text-sm hover:bg-gray-700 transition-colors"
                      >
                        <Printer className="w-4 h-4" /> Reimprimir corte
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, cls = 'text-gray-800' }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  )
}
