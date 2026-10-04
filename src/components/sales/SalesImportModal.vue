<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-vue-next'
import AppModal from '@/components/common/AppModal.vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import TablePagination from '@/components/common/TablePagination.vue'
import { usePagination } from '@/composables/usePagination'
import {
  buildImport,
  EXPECTED_HEADERS,
  parseSalesSheet,
  type ImportRow,
  type ImportStatus,
} from '@/services/salesImport'
import { importHistoricalSales } from '@/services/storage'
import { formatCurrency, formatDate } from '@/utils/format'
import { useSalesStore } from '@/stores/sales'
import { useContactsStore } from '@/stores/contacts'
import { useAppStore } from '@/stores/app'

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  imported: [count: number]
}>()

const salesStore = useSalesStore()
const contactsStore = useContactsStore()
const appStore = useAppStore()

const fileName = ref('')
const sheetName = ref('')
const rows = ref<ImportRow[]>([])
/** Filas elegidas, por número de fila. Arranca con lo que marcan las reglas. */
const included = ref<Set<number>>(new Set())
const parsing = ref(false)
const saving = ref(false)
const parseError = ref('')
const tab = ref<ImportStatus>('import')

watch(open, (isOpen) => {
  if (isOpen) reset()
})

function reset() {
  fileName.value = ''
  sheetName.value = ''
  rows.value = []
  included.value = new Set()
  parseError.value = ''
  tab.value = 'import'
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  parsing.value = true
  parseError.value = ''
  try {
    await Promise.all([salesStore.loadSales(), contactsStore.loadContacts()])
    const existingKeys = new Set(
      salesStore.sales.map((s) => s.importKey).filter((k): k is string => !!k),
    )
    const parsed = await parseSalesSheet(file, existingKeys)
    fileName.value = file.name
    sheetName.value = parsed.sheetName
    rows.value = parsed.rows
    included.value = new Set(parsed.rows.filter((r) => r.status === 'import').map((r) => r.rowNumber))
    tab.value = 'import'
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : 'No se pudo leer el archivo'
  } finally {
    parsing.value = false
  }
}

const counts = computed(() => {
  const result: Record<ImportStatus, number> = { import: 0, skip: 0, duplicate: 0 }
  for (const r of rows.value) result[r.status]++
  return result
})

const tabOptions = computed(() => [
  { value: 'import' as const, label: `A importar (${counts.value.import})` },
  { value: 'skip' as const, label: `Omitidas (${counts.value.skip})` },
  { value: 'duplicate' as const, label: `Ya importadas (${counts.value.duplicate})` },
])

const tabRows = computed(() => rows.value.filter((r) => r.status === tab.value))
const { page, pageSize, pageCount, total, pagedRows } = usePagination(tabRows, { resetOn: [tab] })

const selectedRows = computed(() => rows.value.filter((r) => included.value.has(r.rowNumber)))

const preview = computed(() => buildImport(selectedRows.value, contactsStore.contacts))
const selectedTotal = computed(() => preview.value.sales.reduce((sum, s) => sum + s.total, 0))
const warningCount = computed(() => selectedRows.value.filter((r) => r.warnings.length > 0).length)

/** Una fila omitida se puede sumar a mano si tiene fecha y monto. */
function canInclude(row: ImportRow): boolean {
  return row.status !== 'duplicate' && !!row.date && row.amount !== undefined
}

function toggle(row: ImportRow) {
  if (!canInclude(row)) return
  const next = new Set(included.value)
  if (next.has(row.rowNumber)) next.delete(row.rowNumber)
  else next.add(row.rowNumber)
  included.value = next
}

async function confirmImport() {
  const data = preview.value
  if (data.sales.length === 0) return
  saving.value = true
  try {
    await importHistoricalSales(data)
    await Promise.all([salesStore.loadSales(), contactsStore.loadContacts()])
    appStore.showToast(
      `${data.sales.length} venta(s) importada(s) · ${data.contacts.length} cliente(s) nuevo(s)`,
      'success',
    )
    emit('imported', data.sales.length)
    open.value = false
  } catch (e) {
    appStore.showToast(e instanceof Error ? e.message : 'Error al importar las ventas', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal v-model="open" title="Importar ventas desde planilla" size="xl">
    <!-- Paso 1: elegir archivo -->
    <div v-if="rows.length === 0" class="space-y-4">
      <p class="text-sm text-zinc-400">
        Elegí la planilla del registro (.ods, .xlsx, .xls o .csv). La primera hoja con estas
        cabeceras se importa como ventas históricas:
      </p>
      <p class="rounded-lg bg-surface-overlay px-3 py-2 font-mono text-xs text-zinc-300">
        {{ EXPECTED_HEADERS }}
      </p>
      <ul class="list-disc space-y-1 pl-5 text-xs text-zinc-500">
        <li>Una fecha vacía toma la de la fila anterior.</li>
        <li>Gastos (montos negativos), servicio técnico, reservas, adelantos y depósitos se omiten.</li>
        <li>Las filas "VENTA" quedan como venta de mostrador, sin cliente.</li>
        <li>El carnet se guarda en las notas del cliente. El stock no cambia.</li>
        <li>Si volvés a importar el mismo archivo, las filas ya importadas se saltan.</li>
      </ul>
      <label
        class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-sm text-zinc-300 transition hover:border-accent hover:text-accent"
        :class="{ 'pointer-events-none opacity-50': parsing }"
      >
        <Upload :size="22" />
        {{ parsing ? 'Leyendo planilla...' : 'Elegir archivo' }}
        <input
          type="file"
          accept=".ods,.xlsx,.xls,.csv"
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
          {{ fileName }} · hoja {{ sheetName }}
        </p>
        <button type="button" class="text-xs text-zinc-400 transition hover:text-accent" @click="reset">
          Elegir otro archivo
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-lg bg-surface-overlay px-3 py-2">
          <p class="text-xs text-zinc-500">Ventas a importar</p>
          <p class="text-lg font-semibold text-zinc-100">{{ preview.sales.length }}</p>
        </div>
        <div class="rounded-lg bg-surface-overlay px-3 py-2">
          <p class="text-xs text-zinc-500">Clientes nuevos</p>
          <p class="text-lg font-semibold text-zinc-100">{{ preview.contacts.length }}</p>
        </div>
        <div class="rounded-lg bg-surface-overlay px-3 py-2">
          <p class="text-xs text-zinc-500">Total</p>
          <p class="text-lg font-semibold text-zinc-100">{{ formatCurrency(selectedTotal) }}</p>
        </div>
        <div class="rounded-lg bg-surface-overlay px-3 py-2">
          <p class="text-xs text-zinc-500">Omitidas · ya importadas</p>
          <p class="text-lg font-semibold text-zinc-100">{{ counts.skip }} · {{ counts.duplicate }}</p>
        </div>
      </div>

      <p v-if="warningCount > 0" class="flex items-center gap-2 text-xs text-warning">
        <AlertTriangle :size="14" />
        {{ warningCount }} fila(s) con un IMEI incompleto en la planilla: la venta se importa sin ese IMEI.
      </p>

      <SegmentedControl v-model="tab" :options="tabOptions" />

      <div class="overflow-x-auto rounded-xl border border-border">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="border-b border-border bg-surface-overlay text-xs uppercase text-zinc-500">
            <tr>
              <th class="w-10 py-2.5 pl-3 pr-1.5"><span class="sr-only">Importar</span></th>
              <th class="px-3 py-2.5 font-medium">Fila</th>
              <th class="px-3 py-2.5 font-medium">Fecha</th>
              <th class="px-3 py-2.5 font-medium">Cliente</th>
              <th class="px-3 py-2.5 font-medium">Modelo</th>
              <th class="px-3 py-2.5 font-medium">IMEI</th>
              <th class="px-3 py-2.5 text-right font-medium">Efectivo</th>
              <th class="px-3 py-2.5 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="row in pagedRows"
              :key="row.rowNumber"
              :class="included.has(row.rowNumber) ? '' : 'text-zinc-500'"
            >
              <td class="py-2 pl-3 pr-1.5">
                <input
                  type="checkbox"
                  :checked="included.has(row.rowNumber)"
                  :disabled="!canInclude(row)"
                  @change="toggle(row)"
                />
              </td>
              <td class="px-3 py-2 text-zinc-500">{{ row.rowNumber }}</td>
              <td class="whitespace-nowrap px-3 py-2">{{ row.date ? formatDate(row.date) : '—' }}</td>
              <td class="px-3 py-2">
                {{ row.customer || '—' }}
                <span v-if="row.walkIn && row.customer" class="block text-[11px] text-zinc-500">Mostrador</span>
                <span v-if="row.carnet" class="block text-[11px] text-zinc-500">CI {{ row.carnet }}</span>
              </td>
              <td class="px-3 py-2">{{ row.model || '—' }}</td>
              <td class="whitespace-nowrap px-3 py-2 font-mono text-xs">{{ row.imei ?? '—' }}</td>
              <td class="whitespace-nowrap px-3 py-2 text-right">
                {{ row.amount !== undefined ? formatCurrency(row.amount) : '—' }}
              </td>
              <td class="px-3 py-2 text-xs">
                <span
                  v-if="row.reason"
                  class="mr-1 rounded px-1.5 py-0.5 font-medium"
                  :class="row.status === 'duplicate' ? 'bg-surface-overlay text-zinc-400' : 'bg-warning/15 text-warning'"
                >
                  {{ row.reason }}
                </span>
                {{ row.details }}
                <span v-for="w in row.warnings" :key="w" class="mt-0.5 block text-warning">{{ w }}</span>
              </td>
            </tr>
            <tr v-if="tabRows.length === 0">
              <td colspan="8" class="px-3 py-8 text-center text-zinc-500">No hay filas en este grupo.</td>
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
          v-if="rows.length > 0"
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
          :disabled="saving || preview.sales.length === 0"
          @click="confirmImport"
        >
          {{ saving ? 'Importando...' : `Importar ${preview.sales.length} venta(s)` }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
