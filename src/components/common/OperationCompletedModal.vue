<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { CheckCircle2, FileDown, Printer } from 'lucide-vue-next'
import AppModal from './AppModal.vue'
import { usePrintSettings } from '@/composables/usePrintSettings'

const props = withDefaults(
  defineProps<{
    title: string
    /** Línea principal junto al ícono, p. ej. "Ticket #A1B2C3D4". */
    heading: string
    subheading?: string
    printLabel: string
    /**
     * Respeta el ajuste de impresión automática. Los documentos en hoja carta
     * (órdenes de compra) lo desactivan para no salir por la impresora de tickets.
     */
    autoPrintable?: boolean
  }>(),
  { subheading: undefined, autoPrintable: true },
)

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  print: []
  download: []
}>()

const { autoPrint } = usePrintSettings()
const printButton = ref<HTMLButtonElement | null>(null)
const autoPrinted = ref(false)

// Al abrir: foco en Imprimir (Enter imprime) y, si está activado, impresión automática.
watch(
  open,
  async (isOpen) => {
    if (!isOpen) return
    autoPrinted.value = autoPrint.value && props.autoPrintable
    if (autoPrinted.value) emit('print')
    await nextTick()
    printButton.value?.focus()
  },
  { immediate: true },
)
</script>

<template>
  <AppModal v-model="open" :title="title" size="md">
    <div class="space-y-5">
      <div class="flex items-center gap-3">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 :size="24" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-zinc-100">{{ heading }}</p>
          <p v-if="subheading" class="text-xs text-zinc-500">{{ subheading }}</p>
        </div>
      </div>

      <slot />

      <p v-if="autoPrinted" class="flex items-center gap-1.5 text-xs text-zinc-500">
        <Printer :size="13" />
        Se envió a imprimir automáticamente. Puedes volver a imprimir si hace falta.
      </p>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm text-zinc-300 transition hover:bg-surface-overlay"
          @click="open = false"
        >
          Cerrar
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-zinc-200 transition hover:border-accent hover:text-accent"
          @click="emit('download')"
        >
          <FileDown :size="16" />
          Descargar PDF
        </button>
        <button
          ref="printButton"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-raised"
          @click="emit('print')"
        >
          <Printer :size="16" />
          {{ printLabel }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
