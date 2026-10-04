<script setup lang="ts">
import { FileDown, Printer } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    /** Íconos chicos para filas dentro de una ficha (devoluciones, abonos). */
    compact?: boolean
    /** Qué se imprime, p. ej. "ticket" o "nota de devolución". */
    documentName?: string
  }>(),
  { compact: false, documentName: 'documento' },
)

const emit = defineEmits<{
  print: []
  download: []
}>()
</script>

<template>
  <div v-if="compact" class="flex shrink-0 items-center gap-0.5" @click.stop>
    <button
      type="button"
      class="rounded p-1 text-zinc-400 transition hover:bg-surface-overlay hover:text-accent"
      :title="`Imprimir ${documentName}`"
      :aria-label="`Imprimir ${documentName}`"
      @click="emit('print')"
    >
      <Printer :size="14" />
    </button>
    <button
      type="button"
      class="rounded p-1 text-zinc-400 transition hover:bg-surface-overlay hover:text-accent"
      :title="`Descargar ${documentName} en PDF`"
      :aria-label="`Descargar ${documentName} en PDF`"
      @click="emit('download')"
    >
      <FileDown :size="14" />
    </button>
  </div>

  <div v-else class="flex shrink-0 items-center gap-2">
    <button
      type="button"
      class="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-zinc-200 transition hover:border-accent hover:text-accent"
      :title="`Imprimir ${documentName}`"
      @click="emit('print')"
    >
      <Printer :size="15" /> Imprimir
    </button>
    <button
      type="button"
      class="rounded-lg border border-border p-2 text-zinc-400 transition hover:border-accent hover:text-accent"
      :title="`Descargar ${documentName} en PDF`"
      :aria-label="`Descargar ${documentName} en PDF`"
      @click="emit('download')"
    >
      <FileDown :size="15" />
    </button>
  </div>
</template>
