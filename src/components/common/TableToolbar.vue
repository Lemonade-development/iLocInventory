<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'

defineProps<{
  searchPlaceholder: string
  /** Hay filtros distintos de los de inicio: muestra "Limpiar filtros". */
  filtered?: boolean
}>()

const search = defineModel<string>('search', { required: true })

const emit = defineEmits<{
  clear: []
}>()
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <div class="relative w-full sm:w-72">
          <Search :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            v-model="search"
            type="search"
            :placeholder="searchPlaceholder"
            class="w-full rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <slot name="filters" />
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
        <slot name="summary" />
        <button
          v-if="filtered"
          type="button"
          class="inline-flex items-center gap-1 text-xs text-zinc-400 transition hover:text-accent"
          @click="emit('clear')"
        >
          <X :size="13" /> Limpiar filtros
        </button>
      </div>
      <!-- Controles de la tabla, debajo del botón principal -->
      <div v-if="$slots.tools" class="ml-auto flex shrink-0 items-center gap-2">
        <slot name="tools" />
      </div>
    </div>
  </div>
</template>
