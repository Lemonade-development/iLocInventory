<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-vue-next'
import AppModal from '@/components/common/AppModal.vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import TablePagination from '@/components/common/TablePagination.vue'
import { usePagination } from '@/composables/usePagination'
import {
  downloadInventoryTemplate,
  parseInventorySheet,
  TEMPLATE_HEADERS,
  type InventoryImportPlan,
  type InventoryRowStatus,
} from '@/services/inventoryImport'
import { importInventory } from '@/services/storage'
import { CATEGORY_LABELS } from '@/utils/category'
import { CONDITION_LABELS } from '@/utils/product'
import { formatDateTime } from '@/utils/format'
import { useProductsStore } from '@/stores/products'
import { useInventoryStore } from '@/stores/inventory'
import { useAppStore } from '@/stores/app'

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  imported: []
}>()

const productsStore = useProductsStore()
const inventoryStore = useInventoryStore()
const appStore = useAppStore()

// Archivos ya importados en este equipo (huella → fecha), para avisar antes de sumar stock dos veces.
const IMPORTED_FILES_KEY = 'iloc-inventory-imported-files'

const fileName = ref('')
const fileHash = ref('')
const previousImportAt = ref<string | null>(null)
const plan = ref<InventoryImportPlan | null>(null)
const parsing = ref(false)
const saving = ref(false)
const downloading = ref(false)
const parseError = ref('')
const tab = ref<InventoryRowStatus>('create')

watch(open, (isOpen) => {
  if (isOpen) reset()
})

function reset() {
  fileName.value = ''
  fileHash.value = ''
  previousImportAt.value = null
  plan.value = null
  parseError.value = ''
  tab.value = 'create'
}

function readImportedFiles(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(IMPORTED_FILES_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function rememberImportedFile(hash: string) {
  if (!hash) return
  try {
    const files = readImportedFiles()
    files[hash] = new Date().toISOString()
    localStorage.setItem(IMPORTED_FILES_KEY, JSON.stringify(files))
  } catch {
    // localStorage no disponible
  }
}

async function hashFile(file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}

async function onDownloadTemplate() {
  downloading.value = true
  try {
    await downloadInventoryTemplate()
  } catch {
    appStore.showToast('No se pudo generar la plantilla', 'error')
  } finally {
    downloading.value = false
  }
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  parsing.value = true
  parseError.value = ''
  try {
    await productsStore.loadProducts()
    const [result, hash] = await Promise.all([
      parseInventorySheet(file, productsStore.products),
      hashFile(file),
    ])
    fileName.value = file.name
    fileHash.value = hash
    previousImportAt.value = hash ? (readImportedFiles()[hash] ?? null) : null
    plan.value = result
    tab.value = result.rows.some((r) => r.status === 'create') ? 'create' : 'update'
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : 'No se pudo leer el archivo'
  } finally {
    parsing.value = false
  }
}

const counts = computed(() => {
  const result: Record<InventoryRowStatus, number> = { create: 0, update: 0, error: 0 }
  for (const r of plan.value?.rows ?? []) result[r.status]++
  return result
})

const tabOptions = computed(() => [
  { value: 'create' as const, label: `Nuevos (${counts.value.create})` },
  { value: 'update' as const, label: `Actualizados (${counts.value.update})` },
  { value: 'error' as const, label: `Con errores (${counts.value.error})` },
])

const tabRows = computed(() => (plan.value?.rows ?? []).filter((r) => r.status === tab.value))
const { page, pageSize, pageCount, total, pagedRows } = usePagination(tabRows, { resetOn: [tab] })

const unitsIn = computed(() => (plan.value?.movements ?? []).reduce((sum, m) => sum + m.quantity, 0))
const changeCount = computed(
  () => (plan.value?.newProducts.length ?? 0) + (plan.value?.updatedProducts.length ?? 0),
)

async function confirmImport() {
  const data = plan.value
  if (!data || changeCount.value === 0) return
  saving.value = true
  try {
    await importInventory(data)
    rememberImportedFile(fileHash.value)
    await Promise.all([productsStore.loadProducts(), inventoryStore.loadMovements()])
    appStore.showToast(
      `${data.newProducts.length} producto(s) nuevo(s) · ${data.updatedProducts.length} actualizado(s)`,
      'success',
    )
    emit('imported')
    open.value = false
  } catch (e) {
    appStore.showToast(e instanceof Error ? e.message : 'Error al importar el inventario', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal v-model="open" title="Carga inicial de inventario" size="xl">
    <!-- Paso 1: plantilla y archivo -->
    <div v-if="!plan" class="space-y-4">
      <p class="text-sm text-zinc-400">
        Para cargar de una vez lo que ya tenés en el local, o para un conteo grande. La reposición
        con proveedor conviene hacerla por <strong class="text-zinc-200">Órdenes de compra</strong>,
        que guardan el proveedor y el costo de cada pedido.
      </p>
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
        <div>
          <p class="text-sm font-medium text-zinc-200">1. Descargá la plantilla</p>
          <p class="text-xs text-zinc-500">
            Excel con la hoja "Inventario" para llenar y la hoja "Instrucciones" con cada columna.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-zinc-200 transition hover:border-accent hover:text-accent disabled:opacity-50"
          :disabled="downloading"
          @click="onDownloadTemplate"
        >
          <Download :size="16" />
          {{ downloading ? 'Generando...' : 'Descargar plantilla' }}
        </button>
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium text-zinc-200">2. Subí la planilla completa</p>
        <p class="rounded-lg bg-surface-overlay px-3 py-2 font-mono text-xs text-zinc-300">
          {{ TEMPLATE_HEADERS }}
        </p>
        <ul class="list-disc space-y-1 pl-5 text-xs text-zinc-500">
          <li>Un producto nuevo necesita marca, modelo, categoría y precio de venta.</li>
          <li>
            Si coincide con uno existente (marca, modelo, variante, condición y batería), se actualiza:
            precio, costo y mínimo se reemplazan, el stock se suma y las celdas vacías no cambian nada.
          </li>
          <li>Así se cargan precios y stock al catálogo de iPhone sin crear duplicados.</li>
        </ul>
      </div>

      <label
        class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-sm text-zinc-300 transition hover:border-accent hover:text-accent"
        :class="{ 'pointer-events-none opacity-50': parsing }"
      >
        <Upload :size="22" />
        {{ parsing ? 'Leyendo planilla...' : 'Elegir archivo (.xlsx, .ods, .csv)' }}
        <input
          type="file"
          accept=".xlsx,.xls,.ods,.csv"
          class="hidden"
          :disabled="parsing"
          @change="onFile"
        />
      </label>
      <p v-if="parseError" class="text-sm text-danger">{{ parseError }}</p>
    </div>

    <!-- Paso 2: vista previa -->
    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="flex items-center gap-2 text-sm text-zinc-300">
          <FileSpreadsheet :size="16" class="text-accent" />
          {{ fileName }} · hoja {{ plan.sheetName }}
        </p>
        <button type="button" class="text-xs text-zinc-400 transition hover:text-accent" @click="reset">
          Elegir otro archivo
        </button>
      </div>

      <p
        v-if="previousImportAt"
        class="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
      >
        <AlertTriangle :size="16" class="mt-0.5 shrink-0" />
        Este archivo ya se importó el {{ formatDateTime(previousImportAt) }}. Si lo importás otra
        vez, el stock se vuelve a sumar.
      </p>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-lg bg-surface-overlay px-3 py-2">
          <p class="text-xs text-zinc-500">Productos nuevos</p>
          <p class="text-lg font-semibold text-zinc-100">{{ plan.newProducts.length }}</p>
        </div>
        <div class="rounded-lg bg-surface-overlay px-3 py-2">
          <p class="text-xs text-zinc-500">Actualizados</p>
          <p class="text-lg font-semibold text-zinc-100">{{ plan.updatedProducts.length }}</p>
        </div>
        <div class="rounded-lg bg-surface-overlay px-3 py-2">
          <p class="text-xs text-zinc-500">Unidades que entran</p>
          <p class="text-lg font-semibold text-zinc-100">{{ unitsIn }}</p>
        </div>
        <div class="rounded-lg bg-surface-overlay px-3 py-2">
          <p class="text-xs text-zinc-500">Filas con errores</p>
          <p class="text-lg font-semibold" :class="counts.error ? 'text-danger' : 'text-zinc-100'">
            {{ counts.error }}
          </p>
        </div>
      </div>

      <p v-if="counts.error > 0" class="text-xs text-zinc-500">
        Las filas con errores no se importan. Corregilas en la planilla y volvé a subirla; las filas
        correctas de esta vez se pueden importar ahora.
      </p>

      <SegmentedControl v-model="tab" :options="tabOptions" />

      <div class="overflow-x-auto rounded-xl border border-border">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="border-b border-border bg-surface-overlay text-xs uppercase text-zinc-500">
            <tr>
              <th class="px-3 py-2.5 font-medium">Fila</th>
              <th class="px-3 py-2.5 font-medium">Producto</th>
              <th class="px-3 py-2.5 font-medium">Categoría</th>
              <th class="px-3 py-2.5 font-medium">Condición</th>
              <th class="px-3 py-2.5 font-medium">{{ tab === 'error' ? 'Error' : 'Cambios' }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="row in pagedRows" :key="row.rowNumber">
              <td class="px-3 py-2 text-zinc-500">{{ row.rowNumber }}</td>
              <td class="px-3 py-2">
                <p class="text-zinc-200">{{ [row.brand, row.model].filter(Boolean).join(' ') || '—' }}</p>
                <p v-if="row.variant" class="text-xs text-zinc-500">{{ row.variant }}</p>
              </td>
              <td class="px-3 py-2 text-zinc-300">{{ row.category ? CATEGORY_LABELS[row.category] : '—' }}</td>
              <td class="px-3 py-2 text-zinc-300">
                {{ CONDITION_LABELS[row.condition] }}
                <span v-if="row.batteryHealth" class="text-xs text-zinc-500"> · {{ row.batteryHealth }}%</span>
              </td>
              <td class="px-3 py-2 text-xs">
                <span
                  v-if="row.reason"
                  class="mr-1 rounded px-1.5 py-0.5 font-medium"
                  :class="row.status === 'error' ? 'bg-danger/15 text-danger' : 'bg-surface-overlay text-zinc-400'"
                >
                  {{ row.reason }}
                </span>
                <span class="text-zinc-300">{{ row.changes.join(' · ') }}</span>
              </td>
            </tr>
            <tr v-if="tabRows.length === 0">
              <td colspan="5" class="px-3 py-8 text-center text-zinc-500">No hay filas en este grupo.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <TablePagination v-model:page="page" :total="total" :page-size="pageSize" :page-count="pageCount" />
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-sm text-zinc-300 transition hover:bg-surface-overlay"
          @click="open = false"
        >
          Cancelar
        </button>
        <button
          v-if="plan"
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
          :disabled="saving || changeCount === 0"
          @click="confirmImport"
        >
          {{ saving ? 'Importando...' : `Importar ${changeCount} producto(s)` }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
