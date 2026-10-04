import { computed, ref, type Ref } from 'vue'

export type SortDir = 'asc' | 'desc'
export type SortValue = string | number | null

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

/** Compara dos valores de celda; los vacíos (null) van siempre al final. */
export function compareSortValues(a: SortValue, b: SortValue, dir: SortDir): number {
  if (a === null || b === null) {
    if (a === b) return 0
    return a === null ? 1 : -1
  }
  const diff =
    typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b))
  return dir === 'asc' ? diff : -diff
}

/**
 * Orden por columna igual en todas las tablas: el clic recorre
 * ascendente → descendente → sin orden (vuelve al orden por defecto).
 */
export function useTableSort<T, K extends string>(
  rows: Ref<T[]>,
  getValue: (row: T, key: K) => SortValue,
  options: {
    /** Orden cuando ninguna columna está activa. Sin esto se respeta el orden de `rows`. */
    defaultCompare?: (a: T, b: T) => number
  } = {},
) {
  const sortKey = ref<K | null>(null) as Ref<K | null>
  const sortDir = ref<SortDir | null>(null)

  function toggleSort(key: K) {
    if (sortKey.value !== key) {
      sortKey.value = key
      sortDir.value = 'asc'
    } else if (sortDir.value === 'asc') {
      sortDir.value = 'desc'
    } else {
      sortKey.value = null
      sortDir.value = null
    }
  }

  function dirFor(key: K): SortDir | null {
    return sortKey.value === key ? sortDir.value : null
  }

  const sorted = computed(() => {
    const key = sortKey.value
    const dir = sortDir.value
    const fallback = options.defaultCompare
    if (!key || !dir) return fallback ? [...rows.value].sort(fallback) : rows.value
    return [...rows.value].sort(
      (a, b) =>
        compareSortValues(getValue(a, key), getValue(b, key), dir) || (fallback ? fallback(a, b) : 0),
    )
  })

  return { sortKey, sortDir, toggleSort, dirFor, sorted }
}
