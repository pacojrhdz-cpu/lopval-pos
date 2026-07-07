import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ClipboardCheck, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, Printer } from 'lucide-react'

function printRequisition(req) {
  const date = new Date(req.created_at).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })
  const STATUS_TEXT  = { pendiente: 'PENDIENTE', aprobada: 'APROBADA', rechazada: 'RECHAZADA' }
  const STATUS_COLOR = { pendiente: '#d97706',   aprobada: '#16a34a',   rechazada: '#dc2626'   }

  const itemRows = (req.requisition_items ?? []).map(ri => `
    <tr>
      <td style="padding:6px 4px;border-bottom:1px solid #eee">${ri.ingredient_name || ri.ingredients?.name || ''}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${ri.quantity_requested}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:center">${ri.unit || ri.ingredients?.unit || ''}</td>
    </tr>`).join('')

  const body = `
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:20px;font-weight:bold;letter-spacing:1px">REQUISICIÓN DE INSUMOS</div>
      <div style="font-size:12px;color:#666;margin-top:4px">${req.branch_name ?? 'Grupo Lopval'}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px">
      <tr><td style="padding:5px 0;color:#666">Folio</td>
          <td style="padding:5px 0;text-align:right;font-weight:bold">#${req.id.slice(0,8).toUpperCase()}</td></tr>
      <tr><td style="padding:5px 0;color:#666">Fecha</td>
          <td style="padding:5px 0;text-align:right">${date}</td></tr>
      <tr><td style="padding:5px 0;color:#666">Solicitó</td>
          <td style="padding:5px 0;text-align:right">${req.cashier_name ?? 'Cajero'}</td></tr>
      <tr><td style="padding:5px 0;color:#666">Estado</td>
          <td style="padding:5px 0;text-align:right;font-weight:bold;color:${STATUS_COLOR[req.status] ?? '#333'}">
            ${STATUS_TEXT[req.status] ?? req.status}</td></tr>
    </table>

    <div style="font-weight:bold;font-size:13px;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:8px">INSUMOS SOLICITADOS</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:2px solid #eee;color:#666;font-size:11px">
          <th style="text-align:left;padding:5px 4px">Insumo</th>
          <th style="text-align:right;padding:5px 4px">Cant.</th>
          <th style="text-align:center;padding:5px 4px">Unidad</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    ${req.notes ? `
    <div style="margin-top:14px;padding:10px;background:#f9f9f9;border-left:3px solid #ccc;font-size:12px">
      <strong>Nota del cajero:</strong><br><span style="color:#555">${req.notes}</span>
    </div>` : ''}

    ${req.review_note ? `
    <div style="margin-top:10px;padding:10px;background:${req.status === 'aprobada' ? '#f0fdf4' : '#fef2f2'};border-left:3px solid ${req.status === 'aprobada' ? '#86efac' : '#fca5a5'};font-size:12px">
      <strong>Nota del responsable:</strong><br><span style="color:#555">${req.review_note}</span>
    </div>` : ''}

    <div style="margin-top:40px;display:flex;gap:40px">
      <div style="flex:1;border-top:1px solid #000;padding-top:6px;text-align:center;font-size:11px;color:#666">Solicitó</div>
      <div style="flex:1;border-top:1px solid #000;padding-top:6px;text-align:center;font-size:11px;color:#666">Autorizó</div>
    </div>`

  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:0;border:none'
  document.body.appendChild(frame)
  const doc = frame.contentDocument ?? frame.contentWindow.document
  doc.open()
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;padding:15mm 20mm}
    @page{size:A4;margin:0}
  </style></head><body>${body}</body></html>`)
  doc.close()
  setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print() } catch {}
    setTimeout(() => { try { document.body.removeChild(frame) } catch {} }, 2000)
  }, 300)
}

const STATUS_LABEL = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  aprobada:  { label: 'Aprobada',  cls: 'bg-green-100 text-green-700' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100   text-red-700'   },
}

export default function AdminRequisitions() {
  const [requisitions, setRequisitions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [expanded,     setExpanded]     = useState(null)
  const [filter,       setFilter]       = useState('pendiente')
  const [reviewing,    setReviewing]    = useState(null) // id being reviewed
  const [reviewNote,   setReviewNote]   = useState('')
  const [saving,       setSaving]       = useState(false)

  useEffect(() => { fetchAll() }, [filter])

  async function fetchAll() {
    setLoading(true)
    const query = supabase
      .from('requisitions')
      .select('*, requisition_items(*, ingredients(name,unit))')
      .order('created_at', { ascending: false })

    if (filter !== 'todas') query.eq('status', filter)

    const { data } = await query
    setRequisitions(data ?? [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    setSaving(true)
    await supabase.from('requisitions').update({
      status,
      review_note:  reviewNote || null,
      reviewed_at:  new Date().toISOString(),
    }).eq('id', id)
    setReviewing(null)
    setReviewNote('')
    setSaving(false)
    fetchAll()
  }

  const pending = requisitions.filter(r => r.status === 'pendiente').length

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-6 h-6 text-gray-800" />
          <h1 className="text-2xl font-bold text-gray-900">Requisiciones</h1>
          {pending > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending} pendiente{pending > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {[
          { id: 'pendiente', label: 'Pendientes' },
          { id: 'aprobada',  label: 'Aprobadas'  },
          { id: 'rechazada', label: 'Rechazadas' },
          { id: 'todas',     label: 'Todas'      },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : requisitions.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Sin requisiciones {filter !== 'todas' ? STATUS_LABEL[filter]?.label.toLowerCase() : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requisitions.map(req => {
            const st    = STATUS_LABEL[req.status] ?? STATUS_LABEL.pendiente
            const isExp = expanded === req.id
            const isRev = reviewing === req.id

            return (
              <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Header */}
                <button
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setExpanded(isExp ? null : req.id)}
                >
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${st.cls}`}>{st.label}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{req.cashier_name ?? 'Cajero'}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(req.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">{req.requisition_items?.length ?? 0} insumo{req.requisition_items?.length !== 1 ? 's' : ''}</span>
                  {isExp ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>

                {/* Detalle */}
                {isExp && (
                  <div className="border-t px-5 py-4 space-y-3 bg-gray-50">
                    <div className="flex justify-end">
                      <button onClick={() => printRequisition(req)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
                        <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
                      </button>
                    </div>
                    {/* Items */}
                    <div className="space-y-1">
                      {req.requisition_items?.map(ri => (
                        <div key={ri.id} className="flex justify-between items-center text-sm py-1.5 border-b border-gray-100 last:border-0">
                          <span className="text-gray-700 font-medium">{ri.ingredient_name || ri.ingredients?.name}</span>
                          <span className="text-gray-600 font-bold">{ri.quantity_requested} {ri.unit || ri.ingredients?.unit}</span>
                        </div>
                      ))}
                    </div>

                    {req.notes && (
                      <div className="bg-white rounded-xl p-3 border border-gray-100">
                        <p className="text-xs text-gray-500 mb-1">Nota del cajero:</p>
                        <p className="text-sm text-gray-700">{req.notes}</p>
                      </div>
                    )}

                    {req.review_note && req.status !== 'pendiente' && (
                      <div className={`rounded-xl p-3 border ${req.status === 'aprobada' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                        <p className="text-xs text-gray-500 mb-1">Nota del admin:</p>
                        <p className="text-sm">{req.review_note}</p>
                      </div>
                    )}

                    {/* Acciones si está pendiente */}
                    {req.status === 'pendiente' && (
                      <div className="space-y-2 pt-1">
                        {isRev ? (
                          <>
                            <textarea
                              value={reviewNote}
                              onChange={e => setReviewNote(e.target.value)}
                              placeholder="Nota para el cajero (opcional)"
                              rows={2}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => updateStatus(req.id, 'rechazada')}
                                disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                              >
                                <XCircle className="w-4 h-4" /> Rechazar
                              </button>
                              <button
                                onClick={() => updateStatus(req.id, 'aprobada')}
                                disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                              >
                                <CheckCircle className="w-4 h-4" /> Aprobar
                              </button>
                            </div>
                            <button onClick={() => { setReviewing(null); setReviewNote('') }}
                              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setReviewing(req.id)}
                            className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
                          >
                            Revisar solicitud
                          </button>
                        )}
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
