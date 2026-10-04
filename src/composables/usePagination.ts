import { computed, ref, watch, type Ref, type WatchSource } from 'vue'

export const DEFAULT_PAGE_SIZE = 50

/**
 * Paginación común de las tablas. Dibujar solo una página mantiene fluida la
 * app en equipos antiguos. Vuelve a la página 1 cuando cambia la búsqueda, un
 * filtro o el orden (`resetOn`); si la lista se achica, ajusta la página.
 */
export function usePagination<T>(
  rows: Ref<T[]>,
  options: { resetOn?: WatchSource[]; pageSize?: number } = {},
) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const page = ref(1)

  const total = computed(() => rows.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

  const pagedRows = computed(() => {
    const start = (page.value - 1) * pageSize
    return rows.value.slice(start, start + pageSize)
  })

  if (options.resetOn?.length) {
    watch(options.resetOn, () => {
      page.value = 1
    }, { deep: true })
  }

  watch(pageCount, (count) => {
    if (page.value > count) page.value = count
  })

  return { page, pageSize, pageCount, total, pagedRows }
}
