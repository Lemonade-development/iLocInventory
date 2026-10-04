/**
 * Lectura de planillas (.ods / .xlsx / .xls / .csv) compartida por los
 * importadores. SheetJS se carga solo al usarse.
 */

export type Cell = string | number | boolean | Date | null | undefined

export interface SheetRows {
  sheetName: string
  /** Fila de la planilla (0 = primera) donde empieza `rows`. */
  startRow: number
  rows: Cell[][]
}

/** Minúsculas, sin acentos y con espacios simples. */
export function norm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return ''
  if (cell instanceof Date) return cell.toISOString()
  if (typeof cell === 'number') return String(cell)
  return String(cell).replace(/\s+/g, ' ').trim()
}

/** Número de una celda: acepta "1200", "1200,50", "1.200,50" y "7.500" (miles). */
export function parseNumber(cell: Cell): number | undefined {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : undefined
  const text = cellText(cell).replace(/\s/g, '').replace(/^bs\.?/i, '')
  if (!text) return undefined
  let cleaned = text
  if (text.includes(',')) cleaned = text.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) cleaned = text.replace(/\./g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

export async function readSheets(file: File): Promise<SheetRows[]> {
  const XLSX = await import('xlsx')
  const isCsv = /\.csv$/i.test(file.name)
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: isCsv })
  const result: SheetRows[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet || !sheet['!ref']) continue
    result.push({
      sheetName,
      startRow: XLSX.utils.decode_range(sheet['!ref']).s.r,
      rows: XLSX.utils.sheet_to_json<Cell[]>(sheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      }),
    })
  }
  return result
}

/**
 * Busca la fila de cabeceras en las primeras 30 filas y devuelve el índice de
 * cada columna. Las cabeceras se comparan sin acentos ni mayúsculas.
 */
export function findHeader<C extends string>(
  rows: Cell[][],
  aliases: Record<C, string[]>,
  required: C[],
): { headerIndex: number; columns: Partial<Record<C, number>> } | null {
  const limit = Math.min(rows.length, 30)
  for (let r = 0; r < limit; r++) {
    const columns: Partial<Record<C, number>> = {}
    ;(rows[r] ?? []).forEach((cell, c) => {
      const text = norm(cellText(cell))
      if (!text) return
      for (const [column, names] of Object.entries(aliases) as [C, string[]][]) {
        if (columns[column] === undefined && names.includes(text)) {
          columns[column] = c
          break
        }
      }
    })
    if (required.every((col) => columns[col] !== undefined)) {
      return { headerIndex: r, columns }
    }
  }
  return null
}
