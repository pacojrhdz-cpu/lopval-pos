/**
 * thermalPrinter.js
 * Integración con QZ Tray para impresión directa en impresora térmica Samas (ESC/POS)
 * Si QZ Tray no está disponible, cae automáticamente a window.print()
 */

// Carga el script de QZ Tray dinámicamente desde CDN
function loadQZScript() {
  return new Promise((resolve, reject) => {
    if (window.qz) return resolve()
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js'
    script.onload  = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

// Conecta a QZ Tray (app local en puerto 8181)
async function connectQZ() {
  await loadQZScript()
  if (!window.qz) throw new Error('QZ Tray no disponible')
  if (window.qz.websocket.isActive()) return
  await window.qz.websocket.connect({ retries: 1, delay: 1 })
}

// Encuentra la impresora (busca "Samas" o usa la predeterminada)
async function findPrinter() {
  try {
    const found = await window.qz.printers.find('Samas')
    if (found && found.length > 0) return found[0]
  } catch (_) { /* no encontró por nombre, usa default */ }
  return await window.qz.printers.getDefault()
}

// ─── Constantes ESC/POS ───────────────────────────────────────
const ESC  = '\x1B'
const GS   = '\x1D'
const INIT = ESC + '@'              // Inicializar impresora
const CUT  = GS  + 'V' + '\x00'    // Corte completo

const ALIGN_CENTER = ESC + 'a' + '\x01'
const ALIGN_LEFT   = ESC + 'a' + '\x00'
const BOLD_ON      = ESC + 'E' + '\x01'
const BOLD_OFF     = ESC + 'E' + '\x00'
const DOUBLE_ON    = GS  + '!' + '\x11'   // Doble alto y ancho
const DOUBLE_OFF   = GS  + '!' + '\x00'
const LF           = '\n'

function line(txt = '')  { return txt + LF }
function dashes(n = 32)  { return '-'.repeat(n) + LF }
function spaceBetween(left, right, total = 32) {
  const spaces = Math.max(1, total - left.length - right.length)
  return left + ' '.repeat(spaces) + right + LF
}

// ─── Construye el ticket en ESC/POS ───────────────────────────
function buildTicket(sale, branchInfo) {
  const now   = new Date()
  const fecha = now.toLocaleDateString('es-MX')
  const hora  = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const mxn   = n => `$${Number(n ?? 0).toFixed(2)}`

  const METHOD_LABEL = {
    efectivo:      'Efectivo',
    tarjeta:       'Tarjeta',
    transferencia: 'Transferencia',
    plataforma:    sale.platform_name ?? 'Plataforma',
    mixto:         'Mixto',
  }

  let cmd = INIT

  // ── Encabezado ──
  cmd += ALIGN_CENTER
  cmd += BOLD_ON + DOUBLE_ON
  cmd += line(sale.branchName ?? 'Pizza & Totó')
  cmd += DOUBLE_OFF + BOLD_OFF
  cmd += line('Grupo Lopval')
  if (branchInfo?.address) cmd += line(branchInfo.address)
  if (branchInfo?.phone)   cmd += line('Tel: ' + branchInfo.phone)
  cmd += line(`${fecha}  ${hora}`)
  if (sale.cashier)        cmd += line('Cajero: ' + sale.cashier)
  cmd += ALIGN_LEFT
  cmd += dashes()

  // ── Productos ──
  for (const item of (sale.items ?? [])) {
    const name = item.name ?? 'Producto'
    const subtotal = mxn((item.price ?? 0) * (item.qty ?? 1))
    cmd += BOLD_ON + spaceBetween(`${name} x${item.qty}`, subtotal) + BOLD_OFF
    if (item.mods?.length) {
      cmd += line('  + ' + item.mods.map(m => m.name).join(', '))
    }
  }

  cmd += dashes()

  // ── Totales ──
  if (sale.discount > 0) {
    cmd += spaceBetween('Descuento', '-' + mxn(sale.discount))
  }
  cmd += BOLD_ON + DOUBLE_ON
  cmd += spaceBetween('TOTAL', mxn(sale.total), 32)
  cmd += DOUBLE_OFF + BOLD_OFF
  cmd += spaceBetween('Pago:', METHOD_LABEL[sale.payment_method] ?? '')
  if (sale.change > 0) {
    cmd += spaceBetween('Cambio:', mxn(sale.change))
  }

  cmd += dashes()

  // ── Pie ──
  cmd += ALIGN_CENTER
  cmd += line('¡Gracias por su visita!')
  cmd += line('Vuelva pronto')
  cmd += LF + LF + LF

  // ── Corte ──
  cmd += CUT

  return cmd
}

// ─── Función principal ────────────────────────────────────────
export async function printTicket(sale, branchInfo) {
  try {
    await connectQZ()
    const printer = await findPrinter()
    const config  = window.qz.configs.create(printer, { encoding: 'UTF-8' })
    const data    = [{ type: 'raw', format: 'plain', data: buildTicket(sale, branchInfo) }]
    await window.qz.print(config, data)
    return true // imprimió con QZ Tray
  } catch (err) {
    console.warn('QZ Tray no disponible, usando window.print():', err.message)
    return false // fallback a window.print()
  }
}
