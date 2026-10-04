import type { Product, ProductCategory, ProductCondition } from '@/types'
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/utils/category'
import { productMatchKey } from '@/utils/product'
import { parseCategory, parseCondition } from './inventoryImport'
import { cellText, findHeader, parseNumber, readSheets, type Cell } from './spreadsheet'

/**
 * Carga las líneas de una orden de compra desde una planilla, para pedidos
 * grandes. El proveedor, la fecha y las notas se completan en el formulario.
 * Cada línea se vincula a un producto existente cuando coincide.
 */

type Column =
  | 'brand'
  | 'model'
  | 'variant'
  | 'category'
  | 'condition'
  | 'quantity'
  | 'unitCost'
  | 'price'
  | 'notes'

interface TemplateColumn {
  column: Column
  header: string
  required: string
  help: string
  example: string
  width: number
}

const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { column: 'brand', header: 'MARCA', required: 'Sí', help: 'Fabricante.', example: 'Apple', width: 12 },
  { column: 'model', header: 'MODELO', required: 'Sí', help: 'Nombre del modelo.', example: 'iPhone 15', width: 22 },
  {
    column: 'variant',
    header: 'VARIANTE',
    required: 'No',
    help: 'Color y capacidad, u otra diferencia del modelo.',
    example: 'Negro 128GB',
    width: 22,
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
    example: 'Nuevo',
    width: 14,
  },
  { column: 'quantity', header: 'CANTIDAD', required: 'Sí', help: 'Unidades pedidas.', example: '5', width: 11 },
  {
    column: 'unitCost',
    header: 'COSTO UNITARIO',
    required: 'Sí (productos nuevos)',
    help: 'Costo por unidad en Bs. Vacío en un producto existente = su costo actual.',
    example: '5600',
    width: 16,
  },
  {
    column: 'price',
    header: 'PRECIO VENTA',
    required: 'No',
    help: 'Precio de venta en Bs. Se usa al crear el producto o si el existente no tiene precio.',
    example: '6800',
    width: 14,
  },
  { column: 'notes', header: 'NOTAS', required: 'No', help: 'Nota de la línea.', example: 'Caja sellada', width: 24 },
]

const HEADER_ALIASES: Record<Column, string[]> = {
  brand: ['marca'],
  model: ['modelo'],
  variant: ['variante', 'color y capacidad', 'descripcion'],
  category: ['categoria'],
  condition: ['condicion', 'estado'],
  quantity: ['cantidad', 'unidades', 'cant'],
  unitCost: ['costo unitario', 'costo', 'costo unit'],
  price: ['precio venta', 'precio', 'precio de venta'],
  notes: ['notas', 'nota', 'observaciones'],
}

const REQUIRED_COLUMNS: Column[] = ['brand', 'model', 'quantity']

export const ORDER_TEMPLATE_HEADERS = TEMPLATE_COLUMNS.map((c) => c.header).join(', ')

export async function downloadPurchaseOrderTemplate(): Promise<void> {
  const XLSX = await import('xlsx')
  const lines = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map((c) => c.header)])
  lines['!cols'] = TEMPLATE_COLUMNS.map((c) => ({ wch: c.width }))

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Plantilla de orden de compra'],
    ['Completá la hoja "Pedido" desde la fila 2, una línea por modelo. No cambies los nombres de las columnas.'],
    ['El proveedor, la fecha de entrega y las notas de la orden se completan en la app.'],
    ['Si la línea coincide con un producto existente (marca, modelo, variante y condición), se vincula a él y al recibir se le suma el stock.'],
    [],
    ['COLUMNA', 'OBLIGATORIA', 'QUÉ VA', 'EJEMPLO'],
    ...TEMPLATE_COLUMNS.map((c) => [c.header, c.required, c.help, c.example]),
  ])
  instructions['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 90 }, { wch: 16 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, lines, 'Pedido')
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instrucciones')
  XLSX.writeFile(workbook, 'plantilla-orden-de-compra.xlsx')
}

export interface ImportedOrderLine {
  productId?: string
  brand: string
  model: string
  variant?: string
  category: ProductCategory
  condition: ProductCondition
  quantity: number
  unitCost: number
  price?: number
  notes?: string
}

export interface OrderLinesImport {
  lines: ImportedOrderLine[]
  /** Líneas vinculadas a un producto existente. */
  linked: number
  /** "Fila N: motivo" de las filas que no se cargaron. */
  errors: string[]
}

export async function parsePurchaseOrderLines(file: File, products: Product[]): Promise<OrderLinesImport> {
  for (const { startRow, rows } of await readSheets(file)) {
    const header = findHeader(rows, HEADER_ALIASES, REQUIRED_COLUMNS)
    if (!header) continue
    return buildLines(rows, header.headerIndex, header.columns, startRow, products)
  }
  throw new Error(`No se encontraron las cabeceras. Se esperan: ${ORDER_TEMPLATE_HEADERS}`)
}

function buildLines(
  rows: Cell[][],
  headerIndex: number,
  columns: Partial<Record<Column, number>>,
  startRow: number,
  products: Product[],
): OrderLinesImport {
  const byKey = new Map(products.map((p) => [productMatchKey(p), p]))
  const lines: ImportedOrderLine[] = []
  const errors: string[] = []
  let linked = 0

  const get = (row: Cell[], column: Column): Cell => {
    const idx = columns[column]
    return idx === undefined ? null : row[idx]
  }

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (row.every((cell) => cellText(cell) === '')) continue
    const rowErrors: string[] = []

    const brand = cellText(get(row, 'brand'))
    const model = cellText(get(row, 'model'))
    const variant = cellText(get(row, 'variant'))
    const categoryText = cellText(get(row, 'category'))
    const conditionText = cellText(get(row, 'condition'))
    if (!brand) rowErrors.push('falta la marca')
    if (!model) rowErrors.push('falta el modelo')

    const number = (column: Column, label: string, integer = false) => {
      const cell = get(row, column)
      if (cellText(cell) === '') return undefined
      const n = parseNumber(cell)
      if (n === undefined || n < 0 || (integer && !Number.isInteger(n))) {
        rowErrors.push(`${label} no válido (${cellText(cell)})`)
        return undefined
      }
      return n
    }
    const quantity = number('quantity', 'cantidad', true)
    if (quantity === undefined || quantity === 0) {
      if (!rowErrors.some((e) => e.startsWith('cantidad'))) rowErrors.push('falta la cantidad')
    }
    const unitCost = number('unitCost', 'costo')
    const price = number('price', 'precio')

    const condition = parseCondition(conditionText)
    if (!condition) rowErrors.push(`condición no válida (${conditionText})`)
    const category = categoryText ? parseCategory(categoryText) : undefined
    if (categoryText && !category) {
      rowErrors.push(
        `categoría no válida (${categoryText}; usá ${ALL_CATEGORIES.map((c) => CATEGORY_LABELS[c]).join(', ')})`,
      )
    }

    const product =
      rowErrors.length === 0
        ? byKey.get(productMatchKey({ brand, model, variant, condition: condition! }))
        : undefined
    if (rowErrors.length === 0 && !product) {
      if (!category) rowErrors.push('falta la categoría')
      if (unitCost === undefined) rowErrors.push('falta el costo unitario')
    }

    if (rowErrors.length > 0) {
      errors.push(`Fila ${startRow + r + 1}: ${rowErrors.join(', ')}`)
      continue
    }

    // Una línea vinculada usa los datos del producto, así coincide exacto al recibir.
    if (product) linked++
    lines.push({
      productId: product?.id,
      brand: product?.brand ?? brand,
      model: product?.model ?? model,
      variant: (product ? product.variant : variant) || undefined,
      category: product?.category ?? category!,
      condition: product?.condition ?? condition!,
      quantity: quantity!,
      unitCost: unitCost ?? product?.cost ?? 0,
      price: price ?? (product?.price || undefined),
      notes: cellText(get(row, 'notes')) || undefined,
    })
  }

  return { lines, linked, errors }
}
