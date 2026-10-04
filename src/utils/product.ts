import type { Product, ProductCondition } from '@/types'
import { CATEGORY_LABELS } from '@/utils/category'

export const CONDITION_LABELS: Record<ProductCondition, string> = {
  nuevo: 'Nuevo',
  segunda_mano: 'Segunda mano',
}

/** Mínimo de stock cuando el producto no tiene uno propio. */
export const DEFAULT_MIN_STOCK = 5

export function minStockOf(product: Pick<Product, 'minStock'>): number {
  return product.minStock ?? DEFAULT_MIN_STOCK
}

/** Stock bajo: llegó al mínimo. Un mínimo 0 desactiva el aviso. */
export function isLowStock(product: Pick<Product, 'stock' | 'minStock'>): boolean {
  const min = minStockOf(product)
  return min > 0 && product.stock <= min
}

export function getConditionLabel(condition?: ProductCondition): string | null {
  if (!condition) return null
  return CONDITION_LABELS[condition]
}

/** La batería aplica a cualquier producto de segunda mano, de cualquier marca. */
export function acceptsBatteryHealth(product: { condition?: ProductCondition }): boolean {
  return product.condition === 'segunda_mano'
}

/** Entero 1–100. Vacío o fuera de rango devuelve undefined. */
export function parseBatteryHealth(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return undefined
  const rounded = Math.round(n)
  if (rounded < 1 || rounded > 100) return undefined
  return rounded
}

export function batteryHealthBadgeClass(percent: number): string {
  if (percent >= 90) return 'bg-success/15 text-success'
  if (percent >= 80) return 'bg-warning/15 text-warning'
  return 'bg-danger/15 text-danger'
}

export function batteryHealthTextClass(percent: number): string {
  if (percent >= 90) return 'text-success'
  if (percent >= 80) return 'text-warning'
  return 'text-danger'
}

/**
 * Sufijo de la nota de venta.
 * "Nuevo" solo en celulares. La batería solo en celulares de segunda mano.
 * El texto "segunda mano" no se imprime.
 */
export function productConditionSuffix(
  product: Pick<Product, 'category' | 'condition' | 'batteryHealth'>,
): string {
  const parts: string[] = []
  if (product.category === 'celular' && product.condition === 'nuevo') {
    parts.push(CONDITION_LABELS.nuevo)
  }
  if (product.category === 'celular' && product.condition === 'segunda_mano') {
    const battery = parseBatteryHealth(product.batteryHealth)
    if (battery !== undefined) parts.push(`Bat. ${battery}%`)
  }
  return parts.length ? ` (${parts.join(' · ')})` : ''
}

/** Quita "segunda mano" de un nombre ya guardado, para reimprimir la nota. */
export function saleNoteProductName(name: string): string {
  return name
    .replace(/\s*\(([^)]*)\)/g, (_match, inner: string) => {
      const parts = inner
        .split('·')
        .map((part) => part.trim())
        .filter((part) => part.toLowerCase() !== 'segunda mano')
      return parts.length ? ` (${parts.join(' · ')})` : ''
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function formatProductName(
  product: Pick<Product, 'brand' | 'model' | 'variant' | 'category' | 'condition' | 'batteryHealth'>,
): string {
  const base = `${product.brand} ${product.model}${product.variant ? ` ${product.variant}` : ''}`
  return `${base}${productConditionSuffix(product)}`
}

/** Minúsculas y sin acentos, para comparar búsquedas. */
function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Todo lo que se puede buscar de un producto: nombre, variante, condición, categoría, specs, batería e IMEI. */
function productSearchText(product: Product): string {
  const parts: unknown[] = [
    product.brand,
    product.model,
    product.variant,
    product.condition ? CONDITION_LABELS[product.condition] : undefined,
    CATEGORY_LABELS[product.category],
    product.imei,
    product.batteryHealth != null ? `${product.batteryHealth}%` : undefined,
    ...Object.values(product.specs ?? {}),
  ]
  return normalizeSearch(parts.filter((part) => part != null && part !== '').join(' '))
}

/**
 * Cada palabra de la búsqueda tiene que aparecer en algún dato del producto,
 * en cualquier orden: "13 pro azul 256" encuentra "iPhone 13 Pro Azul sierra 256GB".
 */
export function matchesProductSearch(product: Product, query: string): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = productSearchText(product)
  return words.every((word) => text.includes(word))
}

/**
 * Identifica un producto: marca, modelo, variante, condición y, en usados, la
 * batería. Sin importar mayúsculas ni acentos. La usan la importación de
 * inventario y la recepción de órdenes de compra para no duplicar productos.
 */
export function productMatchKey(p: {
  brand: string
  model: string
  variant?: string
  condition?: ProductCondition
  batteryHealth?: unknown
}): string {
  const condition = p.condition ?? 'nuevo'
  const battery = condition === 'segunda_mano' ? (parseBatteryHealth(p.batteryHealth) ?? '') : ''
  return [p.brand, p.model, p.variant ?? '', condition, battery]
    .map((part) => normalizeSearch(String(part)).replace(/\s+/g, ' ').trim())
    .join('|')
}
