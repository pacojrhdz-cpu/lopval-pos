import { useState } from 'react'
import { X, FileText, Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'

// Mapa de método de pago POS → código SAT
const PAYMENT_FORM_MAP = {
  efectivo:      '01',
  tarjeta:       '28',
  debito:        '28',
  credito:       '04',
  transferencia: '03',
  transfer:      '03',
}

// Regímenes fiscales más comunes
const REGIMENES = [
  { value: '601', label: '601 - General de Ley Personas Morales' },
  { value: '603', label: '603 - Personas Morales sin fines lucrativos' },
  { value: '605', label: '605 - Sueldos y Salarios' },
  { value: '606', label: '606 - Arrendamiento' },
  { value: '612', label: '612 - Personas Físicas con Actividades Empresariales' },
  { value: '616', label: '616 - Sin obligaciones fiscales' },
  { value: '621', label: '621 - Incorporación Fiscal' },
  { value: '626', label: '626 - Régimen Simplificado de Confianza (RESICO)' },
]

// Usos de CFDI más comunes para restaurante
const USOS_CFDI = [
  { value: 'G01', label: 'G01 - Adquisición de mercancias' },
  { value: 'G03', label: 'G03 - Gastos en general' },
  { value: 'I01', label: 'I01 - Construcciones' },
  { value: 'D01', label: 'D01 - Honorarios médicos y gastos hospitalarios' },
  { value: 'S01', label: 'S01 - Sin efectos fiscales' },
]

// Convierte items de la venta al formato Facturapi
function buildFacturapiItems(saleItems = []) {
  if (!saleItems || saleItems.length === 0) {
    return [{
      quantity: 1,
      product: {
        description: 'Alimentos y bebidas',
        product_key: '90101500',
        unit_key: 'E48',
        price: 0,
        tax_included: true,
        taxes: [{ type: 'IVA', rate: 0.16, factor: 'Tasa' }],
      },
    }]
  }

  return saleItems.map(item => ({
    quantity: item.quantity ?? 1,
    product: {
      description: item.name || item.product_name || 'Alimento/Bebida',
      product_key: '90101500', // Servicios de preparación de alimentos
      unit_key: 'H87',         // Pieza
      price: Number(item.unit_price ?? item.price ?? 0),
      tax_included: true,
      taxes: [{ type: 'IVA', rate: 0.16, factor: 'Tasa' }],
    },
  }))
}

export default function InvoiceModal({ sale, onClose }) {
  const [form, setForm] = useState({
    legal_name: '',
    tax_id: '',        // RFC
    tax_system: '616', // Sin obligaciones fiscales (más común restaurante)
    email: '',
    zip: '',
    use: 'G03',
  })
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const mxn = n => `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: name === 'tax_id' ? value.toUpperCase() : value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    // Determinar forma de pago SAT
    const rawMethod = (sale?.payment_method ?? 'efectivo').toLowerCase()
    const payment_form = PAYMENT_FORM_MAP[rawMethod] ?? '01'

    const payload = {
      customer: {
        legal_name: form.legal_name,
        tax_id:     form.tax_id,
        tax_system: form.tax_system,
        email:      form.email,
        address:    { zip: form.zip },
      },
      items:        buildFacturapiItems(sale?.items),
      payment_form,
      use:          form.use,
    }

    try {
      const res = await fetch('/api/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data?.message || data?.error || 'Error al generar la factura')
        setStatus('error')
        return
      }
      setResult(data)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-bold text-gray-900">Solicitar Factura</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Resumen de la venta */}
        {sale && (
          <div className="px-6 py-3 bg-gray-50 border-b text-sm text-gray-600 flex items-center justify-between">
            <span>Total de la venta</span>
            <span className="font-bold text-gray-900 text-base">{mxn(sale.total)}</span>
          </div>
        )}

        <div className="px-6 py-5">

          {/* ── ÉXITO ── */}
          {status === 'success' && result && (
            <div className="text-center space-y-4">
              <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
              <p className="font-bold text-gray-900 text-lg">¡Factura generada!</p>
              <p className="text-sm text-gray-500">
                Se envió a <strong>{form.email}</strong>
              </p>
              <div className="flex flex-col gap-2 pt-2">
                {result.pdf_url && (
                  <a
                    href={result.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> Descargar PDF
                  </a>
                )}
                {result.xml_url && (
                  <a
                    href={result.xml_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> Descargar XML
                  </a>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* ── FORMULARIO ── */}
          {status !== 'success' && (
            <form onSubmit={handleSubmit} className="space-y-4">

              {status === 'error' && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {errorMsg}
                </div>
              )}

              {/* RFC */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">RFC *</label>
                <input
                  required name="tax_id" value={form.tax_id} onChange={handleChange}
                  placeholder="XAXX010101000"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 uppercase font-mono"
                  maxLength={13}
                />
              </div>

              {/* Nombre fiscal */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre o Razón social *</label>
                <input
                  required name="legal_name" value={form.legal_name} onChange={handleChange}
                  placeholder="Nombre tal como aparece en el SAT"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {/* Régimen fiscal */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Régimen fiscal *</label>
                <select
                  required name="tax_system" value={form.tax_system} onChange={handleChange}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {REGIMENES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Código postal */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Código postal fiscal *</label>
                <input
                  required name="zip" value={form.zip} onChange={handleChange}
                  placeholder="CP del domicilio fiscal"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  maxLength={5} inputMode="numeric"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Correo para enviar la factura *</label>
                <input
                  required type="email" name="email" value={form.email} onChange={handleChange}
                  placeholder="cliente@correo.com"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {/* Uso del CFDI */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Uso del CFDI</label>
                <select
                  name="use" value={form.use} onChange={handleChange}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {USOS_CFDI.map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>

              {/* Acciones */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button" onClick={onClose}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={status === 'loading'}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors"
                >
                  {status === 'loading'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                    : 'Generar factura'
                  }
                </button>
              </div>

            </form>
          )}
        </div>
      </div>
    </div>
  )
}
