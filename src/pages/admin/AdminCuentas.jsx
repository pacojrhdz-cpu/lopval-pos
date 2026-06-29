import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { mxn } from '../../utils/format'
import { BookOpen, ChevronDown, ChevronRight, Clock, XCircle, AlertTriangle, X } from 'lucide-react'

const STATUS = {
  open:      { label: 'Abierta',   cls: 'bg-green-100 text-green-700' },
  closed:    { label: 'Cobrada',   cls: 'bg-blue-100 text-blue-700'   },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-700'     },
}

export default function AdminCuentas() {
  const [accounts,     setAccounts]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [expanded,     setExpanded]     = useState(null)
  const [filter,       setFilter]       = useState('todas')
  const [cancelId,     setCancelId]     = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [dateFrom,     setDateFrom]     = useState(() => new Date().toISOString().split('T')[0])
  const [dateTo,       setDateTo]       = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => { fetchAccounts() }, [filter, dateFrom, dateTo])

  async function fetchAccounts() {
    setLoading(true)
    let q = supabase
      .from('accounts')
      .select('*, account_items(product_name, quantity, unit_price)')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo   + 'T23:59:59')
      .order('created_at', { ascending: false })
    if (filter !== 'todas') q = q.eq('status', filter)
    const { data } = await q
    setAccounts(data ?? [])
    setLoading(false)
  }

  async function cancelAccount() {
    setSaving(true)
    await supabase.from('accounts').update({
      status:        'cancelled',
      closed_at:     new Date().toISOString(),
      cancel_reason: cancelReason || null,
    }).eq('id', cancelId)
    setCancelId(null); setCancelReason(''); setSaving(false)
    fetchAccounts()
  }

  const openCount = accounts.filter(a => a.status === 'open').length

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-gray-800" />
        <h1 className="text-2xl font-bold text-gray-900">Cuentas</h1>
        {openCount > 0 && (
          <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {openCount} abierta{openCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        <span className="text-gray-400">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        <div className="flex gap-1">
          {[
            { id: 'todas',     label: 'Todas'     },
            { id: 'open',      label: 'Abiertas'  },
            { id: 'closed',    label: 'Cobradas'  },
            { id: 'cancelled', label: 'Canceladas'},
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Modal cancelar */}
      {cancelId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-red-500" />
                <h2 className="font-bold text-gray-800">Cancelar cuenta</h2>
              </div>
              <button onClick={() => { setCancelId(null); setCancelReason('') }}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-700" />
              </button>
            </div>
            <p className="text-sm text-gray-600">Esta acción cancelará la cuenta seleccionada.</p>
            <input value={cancelReason} onChange={e => setCancelReason(e.target.value)}
              placeholder="Motivo (opcional)"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
            <div className="flex gap-2">
              <button onClick={() => { setCancelId(null); setCancelReason('') }}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm font-medium transition-colors">
                Volver
              </button>
              <button onClick={cancelAccount} disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold rounded-xl py-2.5 text-sm transition-colors">
                {saving ? 'Cancelando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Sin cuentas en el período seleccionado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => {
            const st    = STATUS[acc.status] ?? STATUS.open
            const isExp = expanded === acc.id
            const total = (acc.account_items ?? []).reduce((s, i) => s + (Number(i.unit_price) * i.quantity), 0)
            return (
              <div key={acc.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setExpanded(isExp ? null : acc.id)}
                >
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${st.cls}`}>{st.label}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{acc.table_name}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(acc.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                      {acc.cashier_name ? ` · ${acc.cashier_name}` : ''}
                    </p>
                  </div>
                  <p className="font-bold text-gray-900">{mxn(total)}</p>
                  {isExp ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {isExp && (
                  <div className="border-t px-5 py-4 bg-gray-50 space-y-3">
                    <div className="space-y-1">
                      {(acc.account_items ?? []).map((ai, idx) => (
                        <div key={idx} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                          <span className="text-gray-700">{ai.product_name}</span>
                          <span className="text-gray-600">{ai.quantity} × {mxn(ai.unit_price)} = <strong>{mxn(ai.quantity * Number(ai.unit_price))}</strong></span>
                        </div>
                      ))}
                      {(acc.account_items ?? []).length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-2">Sin productos</p>
                      )}
                    </div>

                    {acc.cancel_reason && (
                      <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-600">{acc.cancel_reason}</p>
                      </div>
                    )}

                    {acc.status === 'open' && (
                      <button onClick={() => setCancelId(acc.id)}
                        className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors w-full justify-center">
                        <XCircle className="w-4 h-4" /> Cancelar cuenta
                      </button>
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
