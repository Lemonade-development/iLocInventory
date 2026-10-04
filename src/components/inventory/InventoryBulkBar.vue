<script setup lang="ts">
import { PackageMinus, Trash2, X } from 'lucide-vue-next'

defineProps<{
  count: number
  /** Total que coincide con los filtros (todas las páginas). */
  totalCount?: number
}>()

const emit = defineEmits<{
  adjustStock: []
  delete: []
  clear: []
  selectAll: []
}>()
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3"
  >
    <div class="flex items-center gap-3">
      <span class="text-sm font-medium text-zinc-200">
        {{ count }} producto{{ count !== 1 ? 's' : '' }} seleccionado{{ count !== 1 ? 's' : '' }}
      </span>
      <button
        type="button"
        class="text-xs text-zinc-400 transition hover:text-zinc-200"
        @click="emit('clear')"
      >
        <X :size="14" class="inline" /> Deseleccionar
      </button>
      <button
        v-if="totalCount && count < totalCount"
        type="button"
        class="text-xs text-accent transition hover:text-accent-hover"
        @click="emit('selectAll')"
      >
        Seleccionar los {{ totalCount }} del filtro
      </button>
    </div>
    <div class="flex gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-zinc-200 transition hover:border-accent hover:text-accent"
        @click="emit('adjustStock')"
      >
        <PackageMinus :size="16" />
        Ajustar stock
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger transition hover:bg-danger/20"
        @click="emit('delete')"
      >
        <Trash2 :size="16" />
        Eliminar
      </button>
    </div>
  </div>
</template>