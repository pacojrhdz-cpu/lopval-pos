import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { mxn } from '../../utils/format'
import { Scissors, ChevronDown, ChevronRight, Clock } from 'lucide-react'

export default function AdminCorteCaja() {
  const [registers, setRegisters] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [expanded,  setExpanded]  = useState(null)
  const [dateFrom,  setDateFrom]  = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => { fetchRegisters() }, [dateFrom, dateTo])

  async function fetchRegisters() {
    setLoading(true)
    const { data } = await supabase
      .from('cash_registers')
      .select('*')
      .gte('opening_at', dateFrom + 'T00:00:00')
      .lte('opening_at', dateTo   + 'T23:59:59')
      .order('opening_at', { ascending: false })
    setRegisters(data ?? [])
    setLoading(false)
  }

  const totalVentas = registers.reduce((s, r) => s + Number(r.total_sales ?? 0), 0)

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
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(reg.opening_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                      {reg.closing_at ? ` → ${new Date(reg.closing_at).toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'})}` : ' (en curso)'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{mxn(reg.total_sales ?? 0)}</p>
                    <p className="text-xs text-gray-400">en ventas</p>
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
                      <Row label="Efectivo"    value={mxn(reg.total_cash     ?? 0)} cls="text-green-700" />
                      <Row label="Tarjeta"     value={mxn(reg.total_card     ?? 0)} cls="text-blue-700" />
                      <Row label="Plataformas" value={mxn(reg.total_platform ?? 0)} cls="text-purple-700" />
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
