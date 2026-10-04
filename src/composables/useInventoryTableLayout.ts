import { ref, watch } from 'vue'
import type { InventoryTableColumn } from '@/types'

export const ALL_TABLE_COLUMNS: InventoryTableColumn[] = [
  'product',
  'batteryHealth',
  'category',
  'condition',
  'price',
  'stock',
]

export const COLUMN_WIDTHS: Record<InventoryTableColumn, number> = {
  product: 280,
  batteryHealth: 120,
  category: 110,
  condition: 120,
  price: 100,
  stock: 80,
}

const VISIBLE_COLUMNS_KEY = 'iloc-inventory-visible-columns'
// Anchos guardados cuando las columnas se podían redimensionar; ya no se usan.
const LEGACY_COLUMN_WIDTHS_KEY = 'iloc-inventory-column-widths'

function isValidColumn(col: string): col is InventoryTableColumn {
  return ALL_TABLE_COLUMNS.includes(col as InventoryTableColumn)
}

/** Las columnas siempre siguen el orden fijo de la tabla. */
function inTableOrder(columns: string[]): InventoryTableColumn[] {
  return ALL_TABLE_COLUMNS.filter((col) => columns.includes(col))
}

function loadVisibleColumns(): InventoryTableColumn[] {
  try {
    localStorage.removeItem(LEGACY_COLUMN_WIDTHS_KEY)
    const raw = localStorage.getItem(VISIBLE_COLUMNS_KEY)
    if (!raw) return [...ALL_TABLE_COLUMNS]
    const parsed = JSON.parse(raw) as string[]
    // La columna SKU pasó a ser el porcentaje de batería.
    const valid = parsed.map((col) => (col === 'sku' ? 'batteryHealth' : col)).filter(isValidColumn)
    const ordered = inTableOrder(valid)
    return ordered.length > 0 ? ordered : [...ALL_TABLE_COLUMNS]
  } catch {
    return [...ALL_TABLE_COLUMNS]
  }
}

export function useInventoryTableLayout() {
  const visibleColumns = ref<InventoryTableColumn[]>(loadVisibleColumns())

  watch(
    visibleColumns,
    (cols) => {
      try {
        localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(cols))
      } catch {
        // localStorage no disponible
      }
    },
    { deep: true },
  )

  function toggleColumnVisibility(key: InventoryTableColumn): void {
    if (visibleColumns.value.includes(key)) {
      if (visibleColumns.value.length <= 1) return
      visibleColumns.value = visibleColumns.value.filter((c) => c !== key)
    } else {
      visibleColumns.value = inTableOrder([...visibleColumns.value, key])
    }
  }

  function isColumnVisible(key: InventoryTableColumn): boolean {
    return visibleColumns.value.includes(key)
  }

  return {
    visibleColumns,
    toggleColumnVisibility,
    isColumnVisible,
  }
}
