<script setup lang="ts">
defineProps<{
  colspan: number
  /** Hay datos pero los filtros los ocultan todos. */
  filtered: boolean
  /** Texto cuando todavía no hay registros, p. ej. "No hay ventas registradas". */
  emptyText: string
}>()

const emit = defineEmits<{
  clear: []
}>()
</script>

<template>
  <tr>
    <td :colspan="colspan" class="px-4 py-12 text-center text-zinc-500">
      <template v-if="filtered">
        <p>Sin resultados para la búsqueda o los filtros.</p>
        <button
          type="button"
          class="mt-2 text-sm text-accent transition hover:text-accent-hover"
          @click="emit('clear')"
        >
          Limpiar filtros
        </button>
      </template>
      <p v-else>{{ emptyText }}</p>
    </td>
  </tr>
</template>
