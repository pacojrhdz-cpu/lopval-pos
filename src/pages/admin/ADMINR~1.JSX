import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  ClipboardCheck, ChevronDown, ChevronRight,
  CheckCircle, XCircle, Clock, Printer, Package, PackageCheck, X
} from 'lucide-react'

const BRANCH_LOGO_MAP = {
  'aaaaaaaa-0000-0000-0000-000000000001': '/logo.svg',
  'aaaaaaaa-0000-0000-0000-000000000002': '/logo-foviste.svg',
  'aaaaaaaa-0000-0000-0000-000000000003': '/logo.svg',
  'aaaaaaaa-0000-0000-0000-000000000004': '/logo.svg',
}

async function toBase64Req(url) {
  if (!url) return null
  try {
    const abs = url.startsWith('http') ? url : window.location.origin + url
    const res  = await fetch(abs)
    const blob = await res.blob()
    return await new Promise(resolve => {
      const r = new FileReader()
      r.onloadend = () => resolve(r.result)
      r.readAsDataURL(blob)
    })
  } catch { return null }
}

async function printRequisition(req, logoUrl = null) {
  const logoB64 = await toBase64Req(logoUrl)
  const date    = new Date(req.created_at).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })

  const STATUS_TEXT  = { pendiente: 'PENDIENTE', aprobada: 'APROBADA', recibida: 'RECIBIDA', rechazada: 'RECHAZADA' }
  const STATUS_COLOR = { pendiente: '#f59e0b', aprobada: '#22c55e', recibida: '#3b82f6', rechazada: '#ef4444' }
  const statusColor  = STATUS_COLOR[req.status] ?? '#6b7280'

  const itemRows = (req.requisition_items ?? []).map((ri, idx) => `
    <tr style="background:${idx % 2 === 0 ? '#fff' : '#f9fafb'}">
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-size:12px">${ri.ingredient_name ?? ''}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;font-size:12px">${ri.quantity_requested}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:12px">${ri.unit ?? ''}</td>
      ${ri.received_qty != null ? `<td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:right;color:#16a34a;font-weight:700;font-size:12px">${ri.received_qty}</td>` : '<td></td>'}
    </tr>`).join('')

  const logoHtml = logoB64
    ? `<img src="${logoB64}" style="height:56px;filter:invert(1) brightness(2);opacity:0.9">`
    : `<div style="width:52px;height:52px;background:#222;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#fff">${(req.branch_name ?? 'L').charAt(0)}</div>`

  const body = `
    <div style="background:#111;color:#fff;padding:22px 32px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">Grupo Lopval</div>
        <div style="font-size:22px;font-weight:900;line-height:1">Requisición</div>
        <div style="font-size:13px;color:#d1d5db;margin-top:4px">de Insumos</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:8px">${req.branch_name ?? 'Sucursal'}</div>
      </div>
      ${logoHtml}
    </div>
    <div style="background:#f3f4f6;padding:14px 32px;display:flex;border-bottom:2px solid #e5e7eb">
      <div style="flex:0 0 auto;padding-right:24px;margin-right:24px;border-right:1px solid #d1d5db">
        <div style="font-size:9px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">Folio</div>
        <div style="font-size:14px;font-weight:800;font-family:monospace">#${req.id.slice(0,8).toUpperCase()}</div>
      </div>
      <div style="flex:2;padding-right:24px;margin-right:24px;border-right:1px solid #d1d5db">
        <div style="font-size:9px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">Fecha</div>
        <div style="font-size:12px;font-weight:500">${date}</div>
      </div>
      <div style="flex:1.5;padding-right:24px;margin-right:24px;border-right:1px solid #d1d5db">
        <div style="font-size:9px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">Solicitó</div>
        <div style="font-size:12px;font-weight:600">${req.cashier_name ?? req.created_by_name ?? '—'}</div>
      </div>
      <div style="flex:1">
        <div style="font-size:9px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">Estado</div>
        <div style="font-size:12px;font-weight:800;color:${statusColor}">${STATUS_TEXT[req.status] ?? req.status}</div>
      </div>
    </div>
    <div style="padding:24px 32px">
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:10px">Insumos solicitados</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
        <thead>
          <tr style="background:#111;color:#fff">
            <th style="text-align:left;padding:10px 14px;font-size:11px">Insumo</th>
            <th style="text-align:right;padding:10px 14px;font-size:11px">Solicitado</th>
            <th style="text-align:center;padding:10px 14px;font-size:11px">Unidad</th>
            <th style="text-align:right;padding:10px 14px;font-size:11px">Recibido</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      ${req.notes ? `<div style="margin-top:16px;padding:12px 16px;background:#f9fafb;border-left:3px solid #111;border-radius:0 6px 6px 0">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Nota</div>
        <div style="font-size:12px">${req.notes}</div></div>` : ''}
      <div style="margin-top:52px;display:flex;gap:48px">
        <div style="flex:1"><div style="border-top:1.5px solid #111;padding-top:8px">
          <div style="font-size:11px;font-weight:700">${req.cashier_name ?? req.created_by_name ?? 'Solicitante'}</div>
          <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Solicitó</div>
        </div></div>
        <div style="flex:1"><div style="border-top:1.5px solid #111;padding-top:8px">
          <div style="font-size:11px;font-weight:700">______________________________</div>
          <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Autorizó</div>
        </div></div>
      </div>
      <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#9ca3af;letter-spacing:1px">
        GRUPO LOPVAL · DOCUMENTO INTERNO
      </div>
    </div>`

  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:0;border:none'
  document.body.appendChild(frame)
  const doc = frame.contentDocument ?? frame.contentWindow.document
  doc.open()
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;background:#fff}@page{size:A4;margin:0}</style></head><body>${body}</body></html>`)
  doc.close()
  setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print() } catch {}
    setTimeout(() => { try { document.body.removeChild(frame) } catch {} }, 2000)
  }, 500)
}

const STATUS_LABEL = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  aprobada:  { label: 'Aprobada',  cls: 'bg-green-100 text-green-700' },
  recibida:  { label: 'Recibida',  cls: 'bg-blue-100 text-blue-700' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-700' },
}

export default function AdminRequisitions() {
  const { activeBranch, isAdmin, isManager } = useAuth()
  const [requisitions, setRequisitions] = useState([])
  const [stockMap,     setStockMap]     = useState({}) // ingredient_id → quantity
  const [loading,      setLoading]      = useState(true)
  const [expanded,     setExpanded]     = useState(null)
  const [filter,       setFilter]       = useState('pendiente')
  const [reviewing,    setReviewing]    = useState(null)
  const [reviewNote,   setReviewNote]   = useState('')
  const [receiving,    setReceiving]    = useState(null)  // req a confirmar recepción
  const [saving,       setSaving]       = useState(false)
  const [dbError,      setDbError]      = useState('')

  useEffect(() => { fetchAll() }, [filter, activeBranch])

  async function fetchAll() {
    setLoading(true)

    // Requisiciones filtradas
    let q = supabase
      .from('requisitions')
      .select('*, requisition_items(*)')
      .order('created_at', { ascending: false })

    if (filter !== 'todas') q = q.eq('status', filter)
    // Manager solo ve su sucursal; admin ve todas
    if (!isAdmin && isManager && activeBranch?.id) q = q.eq('branch_id', activeBranch.id)

    const { data: reqs, error: reqErr } = await q
    console.log('[AdminRequisitions] filter:', filter, '| count:', reqs?.length, '| error:', reqErr)
    if (reqErr) setDbError(reqErr.message)
    else setDbError('')

    // Stock actual de esta sucursal (para mostrar contexto)
    const branchId = activeBranch?.id
    if (branchId) {
      const { data: inv } = await supabase
        .from('inventory')
        .select('ingredient_id, quantity')
        .eq('branch_id', branchId)
      const sm = {}
      for (const r of (inv ?? [])) sm[r.ingredient_id] = r.quantity
      setStockMap(sm)
    }

    setRequisitions(reqs ?? [])
    setLoading(false)
  }

  async function approve(req) {
    setSaving(true)
    const { error } = await supabase.from('requisitions').update({
      status:      'aprobada',
      review_note: reviewNote || null,
    }).eq('id', req.id)
    if (error) { setDbError('Error al aprobar: ' + error.message); setSaving(false); return }
    setReviewing(null); setReviewNote(''); setSaving(false); fetchAll()
  }

  async function cancel(id) {
    setSaving(true)
    const { error } = await supabase.from('requisitions').update({ status: 'rechazada' }).eq('id', id)
    if (error) { setDbError('Error al rechazar: ' + error.message); setSaving(false); return }
    setReviewing(null); setReviewNote(''); setSaving(false); fetchAll()
  }

  const pending = requisitions.filter(r => r.status === 'pendiente').length

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-6 h-6 text-gray-800" />
          <h1 className="text-2xl font-bold text-gray-900">Requisiciones</h1>
          {pending > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pending} pendiente{pending > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'pendiente', label: 'Pendientes' },
          { id: 'aprobada',  label: 'Aprobadas'  },
          { id: 'recibida',  label: 'Recibidas'  },
          { id: 'rechazada', label: 'Rechazadas' },
          { id: 'todas',     label: 'Todas'      },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Error de BD */}
      {dbError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          Error Supabase: {dbError}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : requisitions.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Sin requisiciones</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requisitions.map(req => {
            const st    = STATUS_LABEL[req.status] ?? STATUS_LABEL.pending
            const isExp = expanded === req.id
            const isRev = reviewing === req.id

            return (
              <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setExpanded(isExp ? null : req.id)}>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${st.cls}`}>{st.label}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">
                      {req.branch_name ?? 'Sucursal'} — {req.cashier_name ?? req.created_by_name ?? 'Usuario'}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(req.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {req.requisition_items?.length ?? 0} insumo{req.requisition_items?.length !== 1 ? 's' : ''}
                  </span>
                  {isExp ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>

                {isExp && (
                  <div className="border-t px-5 py-4 space-y-3 bg-gray-50">
                    <div className="flex justify-end">
                      <button onClick={() => printRequisition(req, BRANCH_LOGO_MAP[req.branch_id] ?? null)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
                        <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
                      </button>
                    </div>

                    {/* Tabla items: Insumo | Solicitado | Stock actual | Recibido */}
                    <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Insumo</th>
                            <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Solicitado</th>
                            <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium flex items-center justify-end gap-1">
                              <Package className="w-3 h-3" /> Stock actual
                            </th>
                            {req.status === 'recibida' && (
                              <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Recibido</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {req.requisition_items?.map(ri => {
                            const currentStock = stockMap[ri.ingredient_id]
                            const isLow = currentStock != null && currentStock < ri.quantity_requested
                            return (
                              <tr key={ri.id} className={isLow ? 'bg-amber-50' : ''}>
                                <td className="px-4 py-2.5 font-medium text-gray-800">{ri.ingredient_name}</td>
                                <td className="px-4 py-2.5 text-right font-bold text-gray-700">
                                  {ri.quantity_requested} {ri.unit}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {currentStock != null ? (
                                    <span className={`font-medium ${isLow ? 'text-amber-600' : 'text-gray-600'}`}>
                                      {currentStock} {ri.unit}
                                      {isLow && ' ⚠️'}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                {req.status === 'recibida' && (
                                  <td className="px-4 py-2.5 text-right font-bold text-green-700">
                                    {ri.received_qty ?? '—'} {ri.received_qty ? ri.unit : ''}
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {req.notes && (
                      <div className="bg-white rounded-xl p-3 border border-gray-100">
                        <p className="text-xs text-gray-500 mb-1">Nota:</p>
                        <p className="text-sm text-gray-700">{req.notes}</p>
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
                              placeholder="Nota para la sucursal (opcional)"
                              rows={2}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => cancel(req.id)} disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
                                <XCircle className="w-4 h-4" /> Rechazar
                              </button>
                              <button onClick={() => approve(req)} disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
                                <CheckCircle className="w-4 h-4" /> Aprobar
                              </button>
                            </div>
                            <button onClick={() => { setReviewing(null); setReviewNote('') }}
                              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setReviewing(req.id)}
                            className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">
                            Revisar solicitud
                          </button>
                        )}
                      </div>
                    )}

                    {/* Acción si está aprobada — admin confirma entrega */}
                    {req.status === 'aprobada' && (
                      <div className="pt-1">
                        <button
                          onClick={() => setReceiving(req)}
                          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">
                          <PackageCheck className="w-4 h-4" /> Confirmar entrega a sucursal
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de recepción (admin confirma entrega) */}
      {receiving && (
        <AdminReceiveModal
          req={receiving}
          onClose={() => setReceiving(null)}
          onDone={() => { setReceiving(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ─── Modal Confirmar Entrega (admin) ─────────────────────────────
function AdminReceiveModal({ req, onClose, onDone }) {
  const initial = Object.fromEntries(
    (req.requisition_items ?? []).map(ri => [ri.id, {
      qty: String(ri.quantity_requested),
      ok:  true,
    }])
  )
  const [received, setReceived] = useState(initial)
  const [notes,    setNotes]    = useState('')
  const [saving,   setSaving]   = useState(false)

  function toggleOk(id) {
    setReceived(prev => ({ ...prev, [id]: { ...prev[id], ok: !prev[id].ok } }))
  }
  function setQty(id, v) {
    setReceived(prev => ({ ...prev, [id]: { ...prev[id], qty: v } }))
  }
  function checkAll() {
    setReceived(prev =>
      Object.fromEntries(Object.entries(prev).map(([id, v]) => [id, { ...v, ok: true }]))
    )
  }

  async function handleConfirm() {
    setSaving(true)
    const items = req.requisition_items ?? []

    // Actualizar received_qty en cada item
    for (const ri of items) {
      const r = received[ri.id]
      await supabase.from('requisition_items')
        .update({ received_qty: parseFloat(r?.qty) || 0 })
        .eq('id', ri.id)
    }

    // Resumen y cambio de status
    const lines = items.map(ri => {
      const r    = received[ri.id]
      const name = ri.ingredient_name || ''
      const diff = (parseFloat(r?.qty) || 0) - ri.quantity_requested
      const diffStr = diff !== 0 ? ` (dif. ${diff > 0 ? '+' : ''}${diff.toFixed(1)})` : ''
      return `${r?.ok ? '✓' : '✗'} ${name}: ${r?.qty ?? ri.quantity_requested}/${ri.quantity_requested} ${ri.unit}${diffStr}`
    })
    const summary = `Entregado el ${new Date().toLocaleDateString('es-MX')}.\n${lines.join('\n')}${notes ? `\nNotas: ${notes}` : ''}`

    await supabase.from('requisitions').update({
      status:      'recibida',
      review_note: summary,
    }).eq('id', req.id)

    setSaving(false)
    onDone()
  }

  const allOk = Object.values(received).every(v => v.ok)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <div>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-green-600" /> Confirmar entrega
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {req.branch_name} · #{req.id.slice(0,6).toUpperCase()}
            </p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">Ajusta lo que realmente se entrega</p>
            {!allOk && (
              <button onClick={checkAll} className="text-xs text-blue-600 hover:underline">
                Marcar todo ✓
              </button>
            )}
          </div>

          {(req.requisition_items ?? []).map(ri => {
            const r = received[ri.id] ?? { qty: String(ri.quantity_requested), ok: true }
            const hasDiff = parseFloat(r.qty) !== ri.quantity_requested
            return (
              <div key={ri.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border-2 transition-all ${
                r.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <button
                  onClick={() => toggleOk(ri.id)}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    r.ok ? 'bg-green-500 border-green-500 text-white' : 'border-red-300 bg-white'
                  }`}
                >
                  {r.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4 text-red-400" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{ri.ingredient_name}</p>
                  <p className="text-xs text-gray-400">Pedido: {ri.quantity_requested} {ri.unit}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input
                    type="number" min="0" step="0.5"
                    value={r.qty}
                    onChange={e => setQty(ri.id, e.target.value)}
                    className={`w-16 border rounded-lg px-2 py-1 text-sm text-center focus:outline-none ${
                      hasDiff ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                    }`}
                  />
                  <span className="text-xs text-gray-400 w-6">{ri.unit}</span>
                </div>
              </div>
            )
          })}

          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notas de discrepancias (opcional)"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400 mt-2"
          />
        </div>

        <div className="p-4 border-t">
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-xl py-3 transition-colors flex items-center justify-center gap-2"
          >
            <PackageCheck className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Confirmar entrega'}
          </button>
        </div>
      </div>
    </div>
  )
}
