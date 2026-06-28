/** Formatea un número como moneda MXN */
export const mxn = (amount) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount ?? 0)

/** Formatea fecha legible */
export const fmtDate = (dateStr) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Formatea hora */
export const fmtTime = (dateStr) => {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

/** Formatea fecha+hora corta */
export const fmtDateTime = (dateStr) => `${fmtDate(dateStr)} ${fmtTime(dateStr)}`

/** Obtiene inicio del día ISO */
export const startOfDay = (date = new Date()) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Obtiene fin del día ISO */
export const endOfDay = (date = new Date()) => {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

/** Obtiene inicio de semana (lunes) */
export const startOfWeek = (date = new Date()) => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Obtiene inicio del mes */
export const startOfMonth = (date = new Date()) => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  return d.toISOString()
}

/** Obtiene inicio del año */
export const startOfYear = (date = new Date()) => {
  const d = new Date(date.getFullYear(), 0, 1)
  return d.toISOString()
}
