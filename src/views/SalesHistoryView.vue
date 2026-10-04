<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { Sale, SaleFilters } from '@/types'
import SaleHistoryTable, { type SaleSortKey } from '@/components/sales/SaleHistoryTable.vue'
import { useTableSort, type SortValue } from '@/composables/useTableSort'
import SaleDetailSidebar from '@/components/sales/SaleDetailSidebar.vue'
import SaleEditModal from '@/components/sales/SaleEditModal.vue'
import CreditPaymentModal from '@/components/sales/CreditPaymentModal.vue'
import SaleReturnModal from '@/components/sales/SaleReturnModal.vue'
import SalesBulkBar from '@/components/sales/SalesBulkBar.vue'
import TableToolbar from '@/components/common/TableToolbar.vue'
import TablePagination from '@/components/common/TablePagination.vue'
import { usePagination } from '@/composables/usePagination'
import { Plus } from 'lucide-vue-next'
import { downloadSaleReceipts, printSaleReceipts } from '@/services/pdfDownload'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { useSalesStore } from '@/stores/sales'
import { formatCurrency } from '@/utils/format'
import { format, subDays } from 'date-fns'

const salesStore = useSalesStore()

const filters = ref<SaleFilters>({
  search: '',
  dateFrom: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  dateTo: format(new Date(), 'yyyy-MM-dd'),
})

const hasActiveFilters = computed(
  () => !!filters.value.search.trim() || !!filters.value.dateFrom || !!filters.value.dateTo,
)

/** Sin búsqueda y sin fechas: muestra todas las ventas. */
function clearFilters() {
  filters.value = { search: '', dateFrom: '', dateTo: '' }
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  canje: 'Equipo a cuenta',
  credito: 'Crédito',
  otro: 'Otro',
}

function saleSortValue(sale: Sale, key: SaleSortKey): SortValue {
  switch (key) {
    case 'date':
      return sale.date
    case 'customer':
      return sale.customerName || null
    case 'payment':
      return PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod
    case 'total':
      return sale.total
  }
}

// Sin columna activa se mantiene el orden del store: la venta más reciente primero.
const visibleSales = computed(() => salesStore.filterSales(filters.value))
const {
  sortKey,
  sortDir,
  toggleSort,
  dirFor,
  sorted: filteredSales,
} = useTableSort(visibleSales, saleSortValue)

const {
  page,
  pageSize,
  pageCount,
  pagedRows: pagedSales,
} = usePagination(filteredSales, { resetOn: [filters, sortKey, sortDir] })

// Selección múltiple: solo ventas visibles con los filtros actuales.
const selectedSaleIds = ref<string[]>([])
const bulkBusy = ref(false)

watch(filteredSales, (visible) => {
  const ids = new Set(visible.map((s) => s.id))
  const kept = selectedSaleIds.value.filter((id) => ids.has(id))
  if (kept.length !== selectedSaleIds.value.length) selectedSaleIds.value = kept
})

/** Ventas seleccionadas en el orden en que aparecen en la tabla. */
const selectedSales = computed(() => {
  const ids = new Set(selectedSaleIds.value)
  return filteredSales.value.filter((s) => ids.has(s.id))
})

async function runBulk(action: (sales: Sale[]) => Promise<void>) {
  if (selectedSales.value.length === 0 || bulkBusy.value) return
  bulkBusy.value = true
  try {
    await action(selectedSales.value)
  } finally {
    bulkBusy.value = false
  }
}

const pendingSales = computed(() =>
  filteredSales.value.filter(
    (s) => s.paymentMethod === 'credito' && !s.creditPaid && (s.creditBalance ?? 0) > 0,
  ),
)
const pendingTotal = computed(() =>
  pendingSales.value.reduce((sum, s) => sum + (s.creditBalance ?? 0), 0),
)

const selectedSale = ref<Sale | null>(null)
const detailOpen = ref(false)
const editOpen = ref(false)
const payOpen = ref(false)
const returnOpen = ref(false)

function openSale(sale: Sale) {
  selectedSale.value = sale
  detailOpen.value = true
}

function onSaleSaved(updated: Sale) {
  selectedSale.value = updated
}

onMounted(() => salesStore.loadSales())
</script>

<template>
  <div class="space-y-6">
    <TableToolbar
      v-model:search="filters.search"
      search-placeholder="Cliente, teléfono, producto o IMEI..."
      :filtered="hasActiveFilters"
      @clear="clearFilters"
    >
      <template #filters>
        <div class="flex items-center gap-2 text-sm text-zinc-400">
          <span>Desde</span>
          <input v-model="filters.dateFrom" type="date" class="toolbar-control" />
          <span>Hasta</span>
          <input v-model="filters.dateTo" type="date" class="toolbar-control" />
        </div>
      </template>
      <template #actions>
        <RouterLink
          :to="{ name: 'sales' }"
          class="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus :size="16" />
          Nueva venta
        </RouterLink>
      </template>
      <template #summary>
        <span>
          {{ filteredSales.length }}
          <template v-if="hasActiveFilters">de {{ salesStore.sales.length }}</template>
          venta(s)
        </span>
        <span v-if="pendingSales.length > 0" class="text-warning">
          {{ pendingSales.length }} con saldo pendiente · {{ formatCurrency(pendingTotal) }} por cobrar
        </span>
      </template>
    </TableToolbar>

    <SalesBulkBar
      v-if="selectedSaleIds.length > 0"
      :count="selectedSaleIds.length"
      :total-count="filteredSales.length"
      @select-all="selectedSaleIds = filteredSales.map((s) => s.id)"
      :busy="bulkBusy"
      @print="runBulk(printSaleReceipts)"
      @download="runBulk(downloadSaleReceipts)"
      @clear="selectedSaleIds = []"
    />

    <LoadingSpinner v-if="salesStore.loading" label="Cargando ventas..." />
    <SaleHistoryTable
      v-else
      v-model:selected-ids="selectedSaleIds"
      :sales="pagedSales"
      :dir-for="dirFor"
      :active-id="selectedSale?.id"
      :filtered="hasActiveFilters && salesStore.sales.length > 0"
      @clear-filters="clearFilters"
      @select="openSale"
      @sort="toggleSort"
    />
    <TablePagination
      v-if="!salesStore.loading"
      v-model:page="page"
      :total="filteredSales.length"
      :page-size="pageSize"
      :page-count="pageCount"
    />

    <SaleDetailSidebar
      v-model="detailOpen"
      :sale="selectedSale"
      @edit="editOpen = true"
      @pay="payOpen = true"
      @return="returnOpen = true"
    />
    <SaleEditModal v-model="editOpen" :sale="selectedSale" @saved="onSaleSaved" />
    <CreditPaymentModal v-model="payOpen" :sale="selectedSale" @saved="onSaleSaved" />
    <SaleReturnModal v-model="returnOpen" :sale="selectedSale" @saved="onSaleSaved" />
  </div>
</template>