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
  return toDateInputValue(new Date().toISOString())
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Fecha guardada (ISO) → valor de un campo `type="date"` (YYYY-MM-DD, hora local). */
export function toDateInputValue(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Fecha guardada (ISO) → valor de un campo `type="datetime-local"` (YYYY-MM-DDTHH:mm, hora local). */
export function toDateTimeInputValue(iso: string): string {
  const d = new Date(iso)
  return `${toDateInputValue(iso)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * Valor de un campo `type="date"` → ISO. Conserva la hora del día de `keepTimeFrom`
 * (la fecha original), para que cambiar solo el día no altere el orden dentro de ese día.
 */
export function fromDateInputValue(value: string, keepTimeFrom: string): string {
  const [y, m, d] = value.split('-').map(Number)
  const t = new Date(keepTimeFrom)
  return new Date(y, m - 1, d, t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds()).toISOString()
}

/** Valor de un campo `type="datetime-local"` → ISO (se interpreta en hora local). */
export function fromDateTimeInputValue(value: string): string {
  return new Date(value).toISOString()
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
/** Fecha de una venta. Las importadas de la planilla no tienen hora real: solo la fecha. */
export function formatSaleDate(sale: { date: string; importKey?: string }): string {
  return sale.importKey ? formatDate(sale.date) : formatDateTime(sale.date)
}
