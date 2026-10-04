import type { Contact, Sale } from '@/types'
import { generateId } from '@/utils/id'
import { normalizeImei } from '@/utils/imei'
import { cellText, findHeader, norm, parseNumber, readSheets, type Cell } from './spreadsheet'

/**
 * Importa el registro de caja del cliente (planilla .ods / .xlsx / .csv) como
 * ventas históricas. Cabeceras esperadas: FECHA, NOMBRE CLIENTE, CARNET,
 * MODELO, IMEI, CONTACTO, EFECTIVO, DETALLES e IMEI PERMUTA.
 * Las ventas importadas no tocan el stock ni crean movimientos.
 */

type Column =
  | 'date'
  | 'customer'
  | 'carnet'
  | 'model'
  | 'imei'
  | 'phone'
  | 'amount'
  | 'details'
  | 'tradeInImei'

const HEADER_ALIASES: Record<Column, string[]> = {
  date: ['fecha'],
  customer: ['nombre cliente', 'cliente', 'nombre'],
  carnet: ['carnet', 'ci', 'cedula', 'carnet de identidad'],
  model: ['modelo', 'producto'],
  imei: ['imei'],
  phone: ['contacto', 'contact', 'telefono', 'celular'],
  amount: ['efectivo', 'efectiv', 'monto', 'importe'],
  details: ['detalles', 'detalle', 'observaciones'],
  tradeInImei: ['imei permuta', 'imei de permuta'],
}

const REQUIRED_COLUMNS: Column[] = ['date', 'model', 'amount']

export const EXPECTED_HEADERS =
  'FECHA, NOMBRE CLIENTE, CARNET, MODELO, IMEI, CONTACTO, EFECTIVO, DETALLES, IMEI PERMUTA'

export type ImportStatus = 'import' | 'skip' | 'duplicate'

export interface ImportRow {
  /** Número de fila en la planilla (1 = primera fila). */
  rowNumber: number
  /** Fecha vigente de la fila (YYYY-MM-DD), heredada si la celda está vacía. */
  date?: string
  customer: string
  carnet: string
  model: string
  imei?: string
  phone: string
  amount?: number
  details: string
  tradeInImei?: string
  /** Venta de mostrador ("VENTA ..."): no crea contacto. */
  walkIn: boolean
  status: ImportStatus
  reason?: string
  warnings: string[]
  importKey: string
}

export interface ParsedSheet {
  sheetName: string
  rows: ImportRow[]
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(y: number, m: number, d: number): string | undefined {
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return undefined
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Número de serie de fecha de hoja de cálculo (días desde 1899-12-30). */
function serialToIso(serial: number): string | undefined {
  if (serial < 20000 || serial > 80000) return undefined
  const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000)
  const utc = new Date(ms)
  return isoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
}

function parseDateCell(cell: Cell): string | undefined {
  if (cell instanceof Date) {
    return isoDate(cell.getFullYear(), cell.getMonth() + 1, cell.getDate())
  }
  if (typeof cell === 'number') return serialToIso(cell)
  const text = cellText(cell)
  const match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (!match) return undefined
  const day = Number(match[1])
  const month = Number(match[2])
  let year = Number(match[3])
  if (year < 100) year += 2000
  return isoDate(year, month, day)
}

/**
 * IMEI desde la celda. Un número de 15 dígitos entra exacto; si la planilla lo
 * guardó en notación científica perdió dígitos (termina en muchos ceros).
 */
function parseImei(cell: Cell, label: string, warnings: string[]): string | undefined {
  if (cell === null || cell === undefined || cell === '') return undefined
  const text = typeof cell === 'number' ? cell.toFixed(0) : cellText(cell)
  if (/e\+/i.test(text) || /0{5,}$/.test(text.replace(/\D/g, ''))) {
    warnings.push(`${label} incompleto en la planilla (${cellText(cell)}); no se importa`)
    return undefined
  }
  const imei = normalizeImei(text)
  return imei || undefined
}

function parsePhone(cell: Cell): string {
  if (typeof cell === 'number') return cell.toFixed(0)
  return cellText(cell)
}

const SKIP_KEYWORDS: { pattern: RegExp; reason: string }[] = [
  { pattern: /servicio/, reason: 'Servicio técnico' },
  { pattern: /reserva/, reason: 'Reserva' },
  { pattern: /adelanto/, reason: 'Adelanto' },
  { pattern: /deposito/, reason: 'Depósito' },
]

function isTradeIn(details: string): boolean {
  return norm(details).startsWith('permuta')
}

/**
 * Lee la planilla y clasifica cada fila. `existingKeys` son las `importKey`
 * de ventas ya importadas, para marcar duplicados.
 */
export async function parseSalesSheet(file: File, existingKeys: Set<string>): Promise<ParsedSheet> {
  for (const { sheetName, startRow, rows } of await readSheets(file)) {
    const header = findHeader(rows, HEADER_ALIASES, REQUIRED_COLUMNS)
    if (!header) continue
    return {
      sheetName,
      rows: classifyRows(rows, header.headerIndex, header.columns, startRow, existingKeys),
    }
  }

  throw new Error(`No se encontraron las cabeceras. Se esperan: ${EXPECTED_HEADERS}`)
}

function classifyRows(
  rows: Cell[][],
  headerIndex: number,
  columns: Partial<Record<Column, number>>,
  startRow: number,
  existingKeys: Set<string>,
): ImportRow[] {
  const result: ImportRow[] = []
  const keyCounts = new Map<string, number>()
  let currentDate: string | undefined

  const get = (row: Cell[], column: Column): Cell => {
    const idx = columns[column]
    return idx === undefined ? null : row[idx]
  }

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const rawDate = get(row, 'date')
    const customer = cellText(get(row, 'customer'))
    const model = cellText(get(row, 'model'))
    const details = cellText(get(row, 'details'))
    // Una permuta sin efectivo se registra con 0 Bs.
    const amount = parseNumber(get(row, 'amount')) ?? (isTradeIn(details) ? 0 : undefined)
    const dateText = cellText(rawDate)

    if (!customer && !model && amount === undefined && !details) continue

    const warnings: string[] = []
    let status: ImportStatus = 'import'
    let reason: string | undefined

    const skip = (why: string) => {
      if (status === 'import') {
        status = 'skip'
        reason = why
      }
    }

    if (dateText) {
      const parsed = parseDateCell(rawDate)
      if (parsed) currentDate = parsed
      else skip(norm(dateText).includes('reserv') ? 'Reserva' : `Fecha no reconocida: ${dateText}`)
    }

    const searchable = norm(`${customer} ${model} ${details}`)
    if (amount === undefined) skip('Sin monto')
    else if (amount < 0) skip('Gasto')
    const keyword = SKIP_KEYWORDS.find((k) => k.pattern.test(searchable))
    if (keyword) skip(keyword.reason)
    if (!model) skip('Sin modelo')
    if (amount === 0 && !isTradeIn(details)) skip('Monto 0')
    if (!currentDate) skip('Sin fecha')

    const imei = parseImei(get(row, 'imei'), 'IMEI', warnings)
    const tradeInImei = parseImei(get(row, 'tradeInImei'), 'IMEI de permuta', warnings)
    const walkIn = !customer || norm(customer).startsWith('venta')

    // Dos ventas iguales el mismo día son válidas: la clave lleva su número de aparición.
    const baseKey = [currentDate ?? '', norm(customer), norm(model), amount ?? '', imei ?? ''].join('|')
    const occurrence = (keyCounts.get(baseKey) ?? 0) + 1
    keyCounts.set(baseKey, occurrence)
    const importKey = `${baseKey}#${occurrence}`

    if (status === 'import' && existingKeys.has(importKey)) {
      status = 'duplicate'
      reason = 'Ya importada'
    }

    result.push({
      rowNumber: startRow + r + 1,
      date: currentDate,
      customer,
      carnet: cellText(get(row, 'carnet')),
      model,
      imei,
      phone: parsePhone(get(row, 'phone')),
      amount,
      details,
      tradeInImei,
      walkIn,
      status,
      reason,
      warnings,
      importKey,
    })
  }

  return result
}

function phoneDigits(phone?: string): string {
  return (phone ?? '').replace(/\D/g, '')
}

function tradeInName(details: string): string {
  const match = details.match(/permuta\s+(?:por\s+)?(.+)/i)
  return match?.[1]?.trim() || 'Equipo en permuta'
}

/**
 * Arma las ventas y los contactos nuevos de las filas elegidas. Busca primero
 * un cliente existente por teléfono y después por nombre; no modifica los existentes.
 */
export function buildImport(
  rows: ImportRow[],
  existingContacts: Contact[],
): { sales: Sale[]; contacts: Contact[] } {
  const customers = existingContacts.filter((c) => c.type === 'customer')
  const byPhone = new Map<string, Contact>()
  const byName = new Map<string, Contact>()
  for (const c of customers) {
    const digits = phoneDigits(c.phone)
    if (digits) byPhone.set(digits, c)
    byName.set(norm(c.name), c)
  }

  const newContacts: Contact[] = []
  const sales: Sale[] = []
  const secondsByDay = new Map<string, number>()

  for (const row of rows) {
    if (!row.date || row.amount === undefined) continue
    const [y, m, d] = row.date.split('-').map(Number)
    const seq = secondsByDay.get(row.date) ?? 0
    secondsByDay.set(row.date, seq + 1)
    const date = new Date(y, m - 1, d, 12, 0, seq).toISOString()

    let contact: Contact | undefined
    if (!row.walkIn) {
      const digits = phoneDigits(row.phone)
      contact = (digits && byPhone.get(digits)) || byName.get(norm(row.customer))
      if (!contact) {
        contact = {
          id: generateId(),
          name: row.customer,
          type: 'customer',
          phone: row.phone || undefined,
          notes: row.carnet ? `CI: ${row.carnet}` : undefined,
          createdAt: date,
          updatedAt: date,
        }
        newContacts.push(contact)
        if (digits) byPhone.set(digits, contact)
        byName.set(norm(row.customer), contact)
      } else if (newContacts.includes(contact)) {
        // Completa los datos de un contacto nuevo con filas posteriores.
        if (!contact.phone && row.phone) {
          contact.phone = row.phone
          if (digits) byPhone.set(digits, contact)
        }
        if (!contact.notes && row.carnet) contact.notes = `CI: ${row.carnet}`
      }
    }

    const sale: Sale = {
      id: generateId(),
      date,
      contactId: contact?.id,
      customerName: row.walkIn ? undefined : (contact?.name ?? row.customer),
      customerPhone: row.walkIn ? undefined : row.phone || contact?.phone || undefined,
      items: [
        {
          productId: `hist-${generateId()}`,
          productName: row.model,
          quantity: 1,
          unitPrice: row.amount,
          subtotal: row.amount,
          ...(row.imei ? { imeis: [{ imei: row.imei }] } : {}),
        },
      ],
      subtotal: row.amount,
      total: row.amount,
      paymentMethod: 'efectivo',
      importKey: row.importKey,
      createdAt: date,
    }

    if (isTradeIn(row.details)) {
      sale.tradeInItems = [
        {
          productId: `hist-${generateId()}`,
          productName: tradeInName(row.details),
          quantity: 1,
          unitValue: 0,
          ...(row.tradeInImei ? { imeis: [{ imei: row.tradeInImei }] } : {}),
        },
      ]
      sale.tradeInValue = 0
    }

    if (row.details && norm(row.details) !== 'compra directa') sale.notes = row.details

    sales.push(sale)
  }

  return { sales, contacts: newContacts }
}
