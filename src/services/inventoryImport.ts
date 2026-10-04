import type { InventoryMovement, Product, ProductCategory, ProductCondition } from '@/types'
import { generateId } from '@/utils/id'
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/utils/category'
import { parseBatteryHealth, productMatchKey as inventoryKey } from '@/utils/product'
import { cellText, findHeader, norm, parseNumber, readSheets, type Cell } from './spreadsheet'

/**
 * Importa productos desde la plantilla de inventario. Una fila que coincide
 * con un producto existente lo actualiza: precio, costo y mínimo se
 * reemplazan, y el stock se suma como entrada. Las celdas vacías no cambian nada.
 */

type Column =
  | 'brand'
  | 'model'
  | 'variant'
  | 'category'
  | 'condition'
  | 'battery'
  | 'price'
  | 'cost'
  | 'stock'
  | 'minStock'

interface TemplateColumn {
  column: Column
  header: string
  required: string
  help: string
  example: string
  width: number
}

/** Columnas de la plantilla, en orden. También documentan la hoja Instrucciones. */
const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { column: 'brand', header: 'MARCA', required: 'Sí', help: 'Fabricante.', example: 'Apple', width: 12 },
  { column: 'model', header: 'MODELO', required: 'Sí', help: 'Nombre del modelo.', example: 'iPhone 13 Pro', width: 22 },
  {
    column: 'variant',
    header: 'VARIANTE',
    required: 'No',
    help: 'Color y capacidad, u otra diferencia del modelo.',
    example: 'Azul sierra 256GB',
    width: 24,
  },
  {
    column: 'category',
    header: 'CATEGORIA',
    required: 'Sí (productos nuevos)',
    help: `Una de: ${ALL_CATEGORIES.map((c) => CATEGORY_LABELS[c]).join(', ')}.`,
    example: 'Celular',
    width: 14,
  },
  {
    column: 'condition',
    header: 'CONDICION',
    required: 'No',
    help: 'Nuevo o Segunda mano. Vacío = Nuevo.',
    example: 'Segunda mano',
    width: 15,
  },
  {
    column: 'battery',
    header: 'BATERIA %',
    required: 'No',
    help: 'Salud de batería de 1 a 100, solo en segunda mano. Un usado con otra batería es otro producto.',
    example: '87',
    width: 11,
  },
  {
    column: 'price',
    header: 'PRECIO VENTA',
    required: 'Sí (productos nuevos)',
    help: 'Precio de venta en Bs, sin símbolo.',
    example: '6500',
    width: 14,
  },
  { column: 'cost', header: 'COSTO', required: 'No', help: 'Costo unitario en Bs.', example: '5200', width: 10 },
  {
    column: 'stock',
    header: 'STOCK',
    required: 'No',
    help: 'Unidades que entran. En un producto existente se suman al stock actual.',
    example: '2',
    width: 9,
  },
  {
    column: 'minStock',
    header: 'STOCK MINIMO',
    required: 'No',
    help: 'Aviso de stock bajo. 0 = sin aviso. Vacío en un producto nuevo = 5.',
    example: '1',
    width: 14,
  },
]

const HEADER_ALIASES: Record<Column, string[]> = {
  brand: ['marca'],
  model: ['modelo'],
  variant: ['variante', 'color y capacidad', 'descripcion'],
  category: ['categoria'],
  condition: ['condicion', 'estado'],
  battery: ['bateria %', 'bateria', 'bateria (%)', 'salud de bateria'],
  price: ['precio venta', 'precio', 'precio de venta'],
  cost: ['costo', 'costo unitario'],
  stock: ['stock', 'cantidad'],
  minStock: ['stock minimo', 'stock min', 'minimo'],
}

const REQUIRED_COLUMNS: Column[] = ['brand', 'model']

export const TEMPLATE_HEADERS = TEMPLATE_COLUMNS.map((c) => c.header).join(', ')

const IMPORT_REASON = 'Importación de inventario'

/** Descarga la plantilla .xlsx con la hoja Inventario y la hoja Instrucciones. */
export async function downloadInventoryTemplate(): Promise<void> {
  const XLSX = await import('xlsx')
  const inventory = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map((c) => c.header)])
  inventory['!cols'] = TEMPLATE_COLUMNS.map((c) => ({ wch: c.width }))

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Plantilla de inventario'],
    ['Completá la hoja "Inventario" desde la fila 2, un producto por fila. No cambies los nombres de las columnas.'],
    ['Si una fila coincide con un producto existente (marca, modelo, variante, condición y batería), se actualiza: las celdas vacías no cambian nada y el stock se suma.'],
    [],
    ['COLUMNA', 'OBLIGATORIA', 'QUÉ VA', 'EJEMPLO'],
    ...TEMPLATE_COLUMNS.map((c) => [c.header, c.required, c.help, c.example]),
  ])
  instructions['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 90 }, { wch: 20 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, inventory, 'Inventario')
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instrucciones')
  XLSX.writeFile(workbook, 'plantilla-inventario.xlsx')
}

export type InventoryRowStatus = 'create' | 'update' | 'error'

export interface InventoryImportRow {
  rowNumber: number
  brand: string
  model: string
  variant: string
  category?: ProductCategory
  condition: ProductCondition
  batteryHealth?: number
  price?: number
  cost?: number
  stock?: number
  minStock?: number
  status: InventoryRowStatus
  /** Error o "Se suma a la fila N". */
  reason?: string
  /** Cambios que aplica la fila, para la vista previa. */
  changes: string[]
}

export interface InventoryImportPlan {
  sheetName: string
  rows: InventoryImportRow[]
  newProducts: Product[]
  updatedProducts: Product[]
  movements: InventoryMovement[]
}

export function parseCategory(text: string): ProductCategory | undefined {
  const key = norm(text).replace(/\s/g, '')
  return ALL_CATEGORIES.find(
    (c) => c === key || norm(CATEGORY_LABELS[c]).replace(/\s/g, '') === key,
  )
}

export function parseCondition(text: string): ProductCondition | undefined {
  const key = norm(text)
  if (!key || key === 'nuevo' || key === 'nueva') return 'nuevo'
  if (['segunda mano', 'segunda_mano', 'usado', 'usada', 'seminuevo'].includes(key)) return 'segunda_mano'
  return undefined
}


function money(n: number): string {
  return `Bs ${n.toLocaleString('es-BO')}`
}

/**
 * Lee la plantilla y arma el plan: qué productos se crean, cuáles se
 * actualizan y qué movimientos de entrada se registran.
 */
export async function parseInventorySheet(file: File, existing: Product[]): Promise<InventoryImportPlan> {
  for (const { sheetName, startRow, rows } of await readSheets(file)) {
    const header = findHeader(rows, HEADER_ALIASES, REQUIRED_COLUMNS)
    if (!header) continue
    return buildPlan(sheetName, rows, header.headerIndex, header.columns, startRow, existing)
  }
  throw new Error(`No se encontraron las cabeceras. Se esperan: ${TEMPLATE_HEADERS}`)
}

function buildPlan(
  sheetName: string,
  rows: Cell[][],
  headerIndex: number,
  columns: Partial<Record<Column, number>>,
  startRow: number,
  existing: Product[],
): InventoryImportPlan {
  const now = new Date().toISOString()
  const byKey = new Map<string, { product: Product; isNew: boolean; firstRow?: number; addedStock: number }>()
  // Copias: el plan no toca los productos del store hasta confirmar.
  for (const p of existing) byKey.set(inventoryKey(p), { product: { ...p }, isNew: false, addedStock: 0 })
  const originals = new Map(existing.map((p) => [p.id, p]))

  const result: InventoryImportRow[] = []
  const get = (row: Cell[], column: Column): Cell => {
    const idx = columns[column]
    return idx === undefined ? null : row[idx]
  }

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (row.every((cell) => cellText(cell) === '')) continue
    const rowNumber = startRow + r + 1

    const brand = cellText(get(row, 'brand'))
    const model = cellText(get(row, 'model'))
    const variant = cellText(get(row, 'variant'))
    const categoryText = cellText(get(row, 'category'))
    const conditionText = cellText(get(row, 'condition'))
    const batteryText = cellText(get(row, 'battery')).replace('%', '')
    const errors: string[] = []

    const number = (column: Column, label: string, opts: { integer?: boolean } = {}) => {
      const cell = get(row, column)
      if (cellText(cell) === '') return undefined
      const n = parseNumber(cell)
      if (n === undefined || n < 0 || (opts.integer && !Number.isInteger(n))) {
        errors.push(`${label} no válido: ${cellText(cell)}`)
        return undefined
      }
      return n
    }

    if (!brand) errors.push('Falta la marca')
    if (!model) errors.push('Falta el modelo')
    const category = categoryText ? parseCategory(categoryText) : undefined
    if (categoryText && !category) {
      errors.push(
        `Categoría no válida: ${categoryText} (usá ${ALL_CATEGORIES.map((c) => CATEGORY_LABELS[c]).join(', ')})`,
      )
    }
    const condition = parseCondition(conditionText)
    if (!condition) errors.push(`Condición no válida: ${conditionText}`)
    let batteryHealth: number | undefined
    if (batteryText) {
      batteryHealth = parseBatteryHealth(batteryText)
      if (batteryHealth === undefined) errors.push(`Batería no válida: ${batteryText}`)
      else if (condition === 'nuevo') errors.push('La batería solo va en productos de segunda mano')
    }
    const price = number('price', 'Precio')
    const cost = number('cost', 'Costo')
    const stock = number('stock', 'Stock', { integer: true })
    const minStock = number('minStock', 'Stock mínimo', { integer: true })

    const base = {
      rowNumber,
      brand,
      model,
      variant,
      category,
      condition: condition ?? 'nuevo',
      batteryHealth,
      price,
      cost,
      stock,
      minStock,
      changes: [] as string[],
    }

    const key = inventoryKey({ brand, model, variant, condition: condition ?? 'nuevo', batteryHealth })
    const target = errors.length === 0 ? byKey.get(key) : undefined

    if (errors.length === 0 && !target) {
      if (!category) errors.push('Falta la categoría')
      if (price === undefined || price <= 0) errors.push('Falta el precio de venta')
    }

    if (errors.length > 0) {
      result.push({ ...base, status: 'error', reason: errors.join(' · ') })
      continue
    }

    if (!target) {
      const product: Product = {
        id: generateId(),
        brand,
        model,
        ...(variant ? { variant } : {}),
        category: category!,
        condition: condition!,
        ...(batteryHealth !== undefined ? { batteryHealth } : {}),
        price: price!,
        cost: cost ?? 0,
        stock: 0,
        ...(minStock !== undefined ? { minStock } : {}),
        createdAt: now,
        updatedAt: now,
      }
      const entry = { product, isNew: true, firstRow: rowNumber, addedStock: stock ?? 0 }
      byKey.set(key, entry)
      const changes = [`Precio ${money(price!)}`]
      if (cost !== undefined) changes.push(`Costo ${money(cost)}`)
      if (stock) changes.push(`Stock ${stock}`)
      result.push({ ...base, status: 'create', changes })
      continue
    }

    // Actualiza un producto existente, o uno nuevo de una fila anterior.
    const p = target.product
    const changes: string[] = []
    if (price !== undefined && price !== p.price) {
      changes.push(`Precio ${money(p.price)} → ${money(price)}`)
      p.price = price
    }
    if (cost !== undefined && cost !== p.cost) {
      changes.push(`Costo ${money(p.cost)} → ${money(cost)}`)
      p.cost = cost
    }
    if (minStock !== undefined && minStock !== p.minStock) {
      changes.push(`Mínimo ${p.minStock ?? '—'} → ${minStock}`)
      p.minStock = minStock
    }
    if (category && category !== p.category) {
      changes.push(`Categoría ${CATEGORY_LABELS[p.category]} → ${CATEGORY_LABELS[category]}`)
      p.category = category
    }
    if (stock) {
      const before = p.stock + target.addedStock
      changes.push(`Stock ${before} → ${before + stock} (+${stock})`)
      target.addedStock += stock
    }
    if (target.isNew) {
      result.push({ ...base, status: 'update', reason: `Se suma a la fila ${target.firstRow}`, changes })
      continue
    }
    result.push({ ...base, status: 'update', reason: changes.length ? undefined : 'Sin cambios', changes })
  }

  const newProducts: Product[] = []
  const updatedProducts: Product[] = []
  const movements: InventoryMovement[] = []
  for (const entry of byKey.values()) {
    const original = originals.get(entry.product.id)
    const changed =
      entry.isNew ||
      entry.addedStock > 0 ||
      (original &&
        (original.price !== entry.product.price ||
          original.cost !== entry.product.cost ||
          original.minStock !== entry.product.minStock ||
          original.category !== entry.product.category))
    if (!changed) continue

    const product = { ...entry.product, stock: entry.product.stock + entry.addedStock, updatedAt: now }
    if (entry.isNew) newProducts.push(product)
    else updatedProducts.push(product)
    if (entry.addedStock > 0) {
      movements.push({
        id: generateId(),
        date: now,
        type: 'in',
        productId: product.id,
        quantity: entry.addedStock,
        reason: IMPORT_REASON,
      })
    }
  }

  return { sheetName, rows: result, newProducts, updatedProducts, movements }
}
