export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-BO', {
    style: 'currency',
    currency: 'BOB',
  }).format(amount)
}

/** Formatea un monto ya expresado en dólares estadounidenses. */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Convierte el texto en fecha. Una fecha sin hora (YYYY-MM-DD, la de los
 * campos de calendario) se lee en hora local: `new Date('2026-10-20')` la
 * toma como medianoche UTC y en Bolivia (UTC−4) mostraría el día anterior.
 */
function toDate(date: string | Date): Date {
  if (typeof date !== 'string') return date
  const match = DATE_ONLY.exec(date)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Date(date)
}

/** Fecha local de hoy como YYYY-MM-DD (para campos de calendario y nombres de archivo). */
export function todayIsoDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function formatDate(date: string | Date): string {
  const d = toDate(date)
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

export function formatDateTime(date: string | Date): string {
  const d = toDate(date)
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}