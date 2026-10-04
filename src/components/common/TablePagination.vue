<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  total: number
  pageSize: number
  pageCount: number
}>()

const page = defineModel<number>('page', { required: true })

const rootRef = ref<HTMLElement | null>(null)

const from = computed(() => (props.total === 0 ? 0 : (page.value - 1) * props.pageSize + 1))
const to = computed(() => Math.min(page.value * props.pageSize, props.total))

/** Primera, última y las vecinas de la actual; el resto se resume con "…". */
const pages = computed<(number | '…')[]>(() => {
  const count = props.pageCount
  const current = page.value
  const shown = new Set([1, count, current - 1, current, current + 1])
  const list: (number | '…')[] = []
  let last = 0
  for (let n = 1; n <= count; n++) {
    if (!shown.has(n)) continue
    if (n - last > 1) list.push('…')
    list.push(n)
    last = n
  }
  return list
})

function go(next: number) {
  if (next < 1 || next > props.pageCount || next === page.value) return
  page.value = next
  // La tabla está justo antes del paginador: si su comienzo quedó arriba, se vuelve a él.
  const table = rootRef.value?.previousElementSibling
  if (table && table.getBoundingClientRect().top < 0) table.scrollIntoView({ block: 'start' })
}
</script>

<template>
  <div
    v-if="pageCount > 1"
    ref="rootRef"
    class="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500"
  >
    <span>Mostrando {{ from }}–{{ to }} de {{ total }}</span>
    <nav class="flex items-center gap-1" aria-label="Paginación">
      <button
        type="button"
        class="rounded-lg p-1.5 text-zinc-400 transition hover:bg-surface-overlay hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="page <= 1"
        aria-label="Página anterior"
        @click="go(page - 1)"
      >
        <ChevronLeft :size="16" />
      </button>
      <template v-for="(item, index) in pages" :key="`${item}-${index}`">
        <span v-if="item === '…'" class="px-1.5 text-zinc-600">…</span>
        <button
          v-else
          type="button"
          class="min-w-8 rounded-lg px-2 py-1 tabular-nums transition"
          :class="item === page ? 'bg-accent/15 font-medium text-accent' : 'text-zinc-400 hover:bg-surface-overlay hover:text-zinc-100'"
          :aria-current="item === page ? 'page' : undefined"
          @click="go(item)"
        >
          {{ item }}
        </button>
      </template>
      <button
        type="button"
        class="rounded-lg p-1.5 text-zinc-400 transition hover:bg-surface-overlay hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="page >= pageCount"
        aria-label="Página siguiente"
        @click="go(page + 1)"
      >
        <ChevronRight :size="16" />
      </button>
    </nav>
  </div>
</template>
