<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-vue-next'
import type { SortDir } from '@/composables/useTableSort'

const props = defineProps<{
  label: string
  /** Dirección activa en esta columna; null si la tabla se ordena por otra. */
  dir: SortDir | null
  align?: 'left' | 'right'
}>()

const emit = defineEmits<{
  sort: []
}>()

const icon = computed(() => (props.dir === 'asc' ? ArrowUp : props.dir === 'desc' ? ArrowDown : ArrowUpDown))
const ariaSort = computed(() =>
  props.dir === 'asc' ? 'ascending' : props.dir === 'desc' ? 'descending' : undefined,
)
</script>

<template>
  <th
    class="group select-none px-4 py-3 font-medium transition"
    :class="[
      align === 'right' ? 'text-right' : 'text-left',
      dir ? 'text-accent' : 'text-zinc-500 hover:text-zinc-300',
    ]"
    :aria-sort="ariaSort"
  >
    <button type="button" class="inline-flex items-center gap-1.5 uppercase" @click="emit('sort')">
      {{ label }}
      <component
        :is="icon"
        :size="14"
        class="shrink-0 transition-opacity"
        :class="dir ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'"
      />
    </button>
  </th>
</template>
