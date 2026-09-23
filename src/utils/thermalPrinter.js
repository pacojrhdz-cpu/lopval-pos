/**
 * thermalPrinter.js
 * Integración con JSPrintManager para impresión directa en impresora térmica (ESC/POS)
 * Fallback automático a window.print() si JSPrintManager no está disponible
 */

// ─── Carga JSPrintManager desde CDN ───────────────────────────
function loadJSPM() {
  return new Promise((resolve, reject) => {
    if (window.JSPM) return resolve()
    const script = document.createElement('script')
    script.src = 'https://cdn.neodynamic.com/products/printing/jspm/5.0/jspm.min.js'
    script.onload  = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

// Conecta a JSPrintManager (app local en ws://localhost:8282)
async function connectJSPM() {
  await loadJSPM()
  if (!window.JSPM) throw new Error('JSPrintManager no disponible')
  window.JSPM.JSPrintManager.auto_reconnect = true
  await window.JSPM.JSPrintManager.start()
  // Espera conexión
  await new Promise((resolve, reject) => {
    let tries = 0
    const check = setInterval(() => {
      const status = window.JSPM.JSPrintManager.websocket_status
      if (status === window.JSPM.WSStatus.Open) { clearInterval(check); resolve() }
      if (++tries > 20) { clearInterval(check); reject(new Error('JSPrintManager no conectó')) }
    }, 200)
  })
}

// ─── Constantes ESC/POS ───────────────────────────────────────
const ESC = '\x1B'
const GS  = '\x1D'

const INIT         = ESC + '@'
const CUT          = GS  + 'V' + '\x00'
const ALIGN_CENTER = ESC + 'a' + '\x01'
const ALIGN_LEFT   = ESC + 'a' + '\x00'
const BOLD_ON      = ESC + 'E' + '\x01'
const BOLD_OFF     = ESC + 'E' + '\x00'
const DOUBLE_ON    = GS  + '!' + '\x11'
const DOUBLE_OFF   = GS  + '!' + '\x00'
const LF           = '\n'

function line(txt = '')       { return txt + LF }
function dashes(n = 32)       { return '-'.repeat(n) + LF }
function spaceBetween(l, r, total = 32) {
  const spaces = Math.max(1, total - String(l).length - String(r).length)
  return l + ' '.repeat(spaces) + r + LF
}

// ─── Construye ticket ESC/POS ─────────────────────────────────
function buildTicket(sale, branchInfo) {
  const now   = new Date()
  const fecha = now.toLocaleDateString('es-MX')
  const hora  = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const mxn   = n => `$${Number(n ?? 0).toFixed(2)}`
  const iva   = (sale.total ?? 0) * 16 / 116
  const base  = (sale.total ?? 0) - iva

  const METHOD_LABEL = {
    efectivo: 'Efectivo', tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    plataforma: sale.platform_name ?? 'Plataforma',
    mixto: 'Mixto',
  }

  let cmd = INIT

  // Encabezado
  cmd += ALIGN_CENTER
  cmd += BOLD_ON + DOUBLE_ON + line(sale.branchName ?? 'Pizza & Totó') + DOUBLE_OFF + BOLD_OFF
  cmd += line('Grupo Lopval')
  if (branchInfo?.address) cmd += line(branchInfo.address)
  if (branchInfo?.phone)   cmd += line('Tel: ' + branchInfo.phone)
  cmd += line(`${fecha}  ${hora}`)
  if (sale.cashier)        cmd += line('Cajero: ' + sale.cashier)
  if (sale.customerName)   cmd += line('Cliente: ' + sale.customerName)
  cmd += ALIGN_LEFT + dashes()

  // Productos
  for (const item of (sale.items ?? [])) {
    cmd += BOLD_ON + spaceBetween(`${item.name} x${item.qty}`, mxn((item.price ?? 0) * (item.qty ?? 1))) + BOLD_OFF
    if (item.mods?.length)  cmd += line('  + ' + item.mods.map(m => m.name).join(', '))
    if (item.note)          cmd += line('  * ' + item.note)
  }

  cmd += dashes()

  // Totales
  if (sale.discount > 0) cmd += spaceBetween('Descuento', '-' + mxn(sale.discount))
  cmd += BOLD_ON + DOUBLE_ON + spaceBetween('TOTAL', mxn(sale.total)) + DOUBLE_OFF + BOLD_OFF
  cmd += dashes()

  // IVA desglosado
  cmd += spaceBetween('Subtotal s/IVA', mxn(base))
  cmd += spaceBetween('IVA 16%', mxn(iva))
  cmd += line('* Precios con IVA incluido · MXN')
  cmd += dashes()

  // Pago
  cmd += spaceBetween('Pago:', METHOD_LABEL[sale.payment_method] ?? '')
  if (sale.change > 0) cmd += spaceBetween('Cambio:', mxn(sale.change))
  cmd += dashes()

  // Pie
  cmd += ALIGN_CENTER + line('¡Gracias por su visita!') + line('Vuelva pronto')
  cmd += LF + LF + LF + CUT

  return cmd
}

// ─── Función principal de impresión ──────────────────────────
export async function printTicket(sale, branchInfo) {
  try {
    await connectJSPM()
    const { JSPrintManager, WSStatus, ClientPrintJob, InstalledPrinter, DefaultPrinter } = window.JSPM

    if (JSPrintManager.websocket_status !== WSStatus.Open) throw new Error('JSPM no conectado')

    const cpj = new ClientPrintJob()
    // Intenta encontrar impresora Samas; si no, usa la predeterminada
    try {
      const printers = await JSPrintManager.getPrinters()
      const samas = printers.find(p => p.toLowerCase().includes('samas'))
      cpj.clientPrinter = samas ? new InstalledPrinter(samas) : new DefaultPrinter()
    } catch {
      cpj.clientPrinter = new DefaultPrinter()
    }

    cpj.printerCommands = buildTicket(sale, branchInfo)
    await cpj.sendToClient()
    return true
  } catch (err) {
    console.warn('JSPrintManager no disponible, usando window.print():', err.message)
    return false
  }
}

// ─── Impresión de comanda (cocina) ────────────────────────────
export async function printComanda(branchName, ticketLabel, items) {
  try {
    await connectJSPM()
    const { JSPrintManager, WSStatus, ClientPrintJob, InstalledPrinter, DefaultPrinter } = window.JSPM

    if (JSPrintManager.websocket_status !== WSStatus.Open) throw new Error('JSPM no conectado')

    const now  = new Date()
    const hora = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

    let cmd = INIT
    cmd += ALIGN_CENTER + BOLD_ON + DOUBLE_ON + line('** COCINA **') + DOUBLE_OFF + BOLD_OFF
    cmd += line(branchName ?? '')
    cmd += line(ticketLabel ?? hora)
    cmd += ALIGN_LEFT + dashes()

    for (const item of items) {
      cmd += BOLD_ON + DOUBLE_ON + `${item.qty}x ${item.name}` + LF + DOUBLE_OFF + BOLD_OFF
      if (item.notes) cmd += line('   * ' + item.notes)
    }

    cmd += dashes() + LF + LF + CUT

    const cpj = new ClientPrintJob()
    try {
      const printers = await JSPrintManager.getPrinters()
      const samas = printers.find(p => p.toLowerCase().includes('samas'))
      cpj.clientPrinter = samas ? new InstalledPrinter(samas) : new DefaultPrinter()
    } catch {
      cpj.clientPrinter = new DefaultPrinter()
    }

    cpj.printerCommands = cmd
    await cpj.sendToClient()
    return true
  } catch (err) {
    console.warn('JSPrintManager no disponible para comanda:', err.message)
    return false
  }
}
