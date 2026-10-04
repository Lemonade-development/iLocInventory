<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Columns3, Check } from 'lucide-vue-next'
import type { InventoryTableColumn } from '@/types'

const props = defineProps<{
  visibleColumns: InventoryTableColumn[]
}>()

const emit = defineEmits<{
  toggleColumn: [key: InventoryTableColumn]
}>()

const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)

const columnOptions: { key: InventoryTableColumn; label: string }[] = [
  { key: 'product', label: 'Producto' },
  { key: 'batteryHealth', label: 'Batería' },
  { key: 'category', label: 'Categoría' },
  { key: 'condition', label: 'Condición' },
  { key: 'price', label: 'Precio' },
  { key: 'stock', label: 'Stock' },
]

function isVisible(key: InventoryTableColumn): boolean {
  return props.visibleColumns.includes(key)
}

function onClickOutside(event: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<template>
  <div ref="menuRef" class="relative">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-zinc-300 transition hover:bg-surface-overlay"
      @click="open = !open"
    >
      <Columns3 :size="16" />
      Columnas
      <span class="rounded bg-surface-overlay px-1.5 py-0.5 text-xs text-zinc-500">
        {{ visibleColumns.length }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl"
    >
      <p class="border-b border-border px-3 py-2 text-xs font-medium uppercase text-zinc-500">
        Mostrar columnas
      </p>
      <button
        v-for="col in columnOptions"
        :key="col.key"
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-overlay"
        :class="isVisible(col.key) ? 'text-zinc-100' : 'text-zinc-500'"
        @click="emit('toggleColumn', col.key)"
      >
        <span
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
          :class="
            isVisible(col.key)
              ? 'border-accent bg-accent text-white'
              : 'border-border bg-surface-overlay'
          "
        >
          <Check v-if="isVisible(col.key)" :size="10" />
        </span>
        <span class="flex-1">{{ col.label }}</span>
        <span v-if="col.key === 'product'" class="text-[10px] text-zinc-600">fija</span>
      </button>
    </div>
  </div>
</template>