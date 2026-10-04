<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { FileDown, Printer } from 'lucide-vue-next'
import type { Sale } from '@/types'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format'
import { saleNoteProductName } from '@/utils/product'
import { downloadSaleReceipt, printSaleReceipt } from '@/services/pdfDownload'
import SortableTh from '@/components/common/SortableTh.vue'
import RowActionsMenu, { type RowAction } from '@/components/common/RowActionsMenu.vue'
import TableEmptyRow from '@/components/common/TableEmptyRow.vue'
import { ACTIVE_ROW_CLASS } from '@/utils/table'
import type { SortDir } from '@/composables/useTableSort'

export type SaleSortKey = 'date' | 'customer' | 'payment' | 'total'

const props = defineProps<{
  /** Ventas ya filtradas y ordenadas por la vista. */
  sales: Sale[]
  dirFor: (key: SaleSortKey) => SortDir | null
  /** Hay ventas pero los filtros las ocultan todas. */
  filtered?: boolean
  /** Venta con la ficha abierta (o la última abierta). */
  activeId?: string
}>()

const saleActions: RowAction[] = [
  { key: 'print', label: 'Imprimir ticket', icon: Printer },
  { key: 'download', label: 'Descargar PDF', icon: FileDown },
]

function runAction(sale: Sale, key: string) {
  if (key === 'print') printSaleReceipt(sale)
  else if (key === 'download') downloadSaleReceipt(sale)
}

function productSummary(sale: Sale): string {
  return sale.items.map((i) => saleNoteProductName(i.productName)).join(', ')
}

const selectedIds = defineModel<string[]>('selectedIds', { default: () => [] })
const selectAllRef = ref<HTMLInputElement | null>(null)

const allSelected = computed(
  () => props.sales.length > 0 && props.sales.every((s) => selectedIds.value.includes(s.id)),
)

const someSelected = computed(
  () => props.sales.some((s) => selectedIds.value.includes(s.id)) && !allSelected.value,
)

watch([someSelected, allSelected], () => {
  if (selectAllRef.value) selectAllRef.value.indeterminate = someSelected.value
})

onMounted(() => {
  if (selectAllRef.value) selectAllRef.value.indeterminate = someSelected.value
})

function toggleSelectAll() {
  if (allSelected.value) {
    const visible = new Set(props.sales.map((s) => s.id))
    selectedIds.value = selectedIds.value.filter((id) => !visible.has(id))
  } else {
    selectedIds.value = [...new Set([...selectedIds.value, ...props.sales.map((s) => s.id)])]
  }
}

function toggleSelect(id: string) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((i) => i !== id)
  } else {
    selectedIds.value = [...selectedIds.value, id]
  }
}

const emit = defineEmits<{
  select: [sale: Sale]
  sort: [key: SaleSortKey]
  clearFilters: []
}>()

const paymentLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  canje: 'Equipo a cuenta',
  credito: 'Crédito',
  otro: 'Otro',
}

function pendingBalance(sale: Sale): number {
  if (sale.paymentMethod !== 'credito' || sale.creditPaid) return 0
  return sale.creditBalance ?? 0
}
</script>

<template>
  <div class="overflow-x-auto rounded-xl border border-border">
    <table class="w-full min-w-[860px] text-left text-sm">
      <thead class="border-b border-border bg-surface-overlay text-xs uppercase text-zinc-500">
        <tr>
          <th class="w-10 py-3 pl-3 pr-1.5">
            <input
              ref="selectAllRef"
              type="checkbox"
              title="Seleccionar todas las ventas visibles"
              :checked="allSelected"
              :disabled="sales.length === 0"
              @change="toggleSelectAll"
            />
          </th>
          <th class="w-12 py-3 px-1.5"><span class="sr-only">Acciones</span></th>
          <SortableTh label="Fecha" :dir="dirFor('date')" @sort="emit('sort', 'date')" />
          <SortableTh label="Cliente" :dir="dirFor('customer')" @sort="emit('sort', 'customer')" />
          <th class="px-4 py-3 font-medium">Productos</th>
          <SortableTh label="Pago" :dir="dirFor('payment')" @sort="emit('sort', 'payment')" />
          <SortableTh label="Total" align="right" :dir="dirFor('total')" @sort="emit('sort', 'total')" />
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr
          v-for="sale in sales"
          :key="sale.id"
          class="cursor-pointer transition hover:bg-surface-overlay/50"
          :class="{
            [ACTIVE_ROW_CLASS]: activeId === sale.id,
            'bg-warning/5': pendingBalance(sale) > 0,
            'bg-accent/10': selectedIds.includes(sale.id),
          }"
          @click="emit('select', sale)"
        >
          <td class="py-3 pl-3 pr-1.5" @click.stop>
            <input
              type="checkbox"
              :checked="selectedIds.includes(sale.id)"
              @change="toggleSelect(sale.id)"
            />
          </td>
          <td class="py-3 px-1.5" @click.stop>
            <RowActionsMenu :items="saleActions" @select="runAction(sale, $event)" />
          </td>
          <td class="whitespace-nowrap px-4 py-3 text-zinc-300">{{ formatDateTime(sale.date) }}</td>
          <td class="px-4 py-3">
            <p class="text-zinc-200">{{ sale.customerName ?? '—' }}</p>
            <p v-if="sale.customerPhone" class="text-xs text-zinc-500">{{ sale.customerPhone }}</p>
          </td>
          <td class="max-w-[18rem] px-4 py-3">
            <p class="truncate text-zinc-300" :title="productSummary(sale)">
              {{ sale.items[0] ? saleNoteProductName(sale.items[0].productName) : '—' }}
            </p>
            <p v-if="sale.items.length > 1" class="text-xs text-zinc-500">
              y {{ sale.items.length - 1 }} producto(s) más
            </p>
          </td>
          <td class="px-4 py-3">
            <span
              class="rounded-md px-2 py-0.5 text-xs"
              :class="
                pendingBalance(sale) > 0
                  ? 'bg-warning/15 text-warning'
                  : 'bg-surface-overlay text-zinc-300'
              "
            >
              {{ paymentLabels[sale.paymentMethod] }}
            </span>
            <p v-if="pendingBalance(sale) > 0" class="mt-1 text-xs text-warning">
              Saldo {{ formatCurrency(pendingBalance(sale)) }}
              <template v-if="sale.creditDueDate"> · vence {{ formatDate(sale.creditDueDate) }}</template>
            </p>
            <p v-if="sale.returnStatus" class="mt-1 text-xs text-danger">
              {{ sale.returnStatus === 'full' ? 'Devuelta' : 'Devuelta parcial' }}
            </p>
          </td>
          <td class="whitespace-nowrap px-4 py-3 text-right font-medium text-zinc-100">
            <span :class="sale.returnStatus ? 'text-zinc-500 line-through' : ''">
              {{ formatCurrency(sale.total) }}
            </span>
            <p v-if="(sale.refundedTotal ?? 0) > 0" class="text-xs font-normal text-zinc-400">
              neto {{ formatCurrency(sale.total - (sale.refundedTotal ?? 0)) }}
            </p>
          </td>
        </tr>
        <TableEmptyRow
          v-if="sales.length === 0"
          :colspan="7"
          :filtered="!!filtered"
          empty-text="No hay ventas registradas"
          @clear="emit('clearFilters')"
        />
      </tbody>
    </table>
  </div>
</template>