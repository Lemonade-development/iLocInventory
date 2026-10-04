<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, PackageCheck, Pencil, X, Trash2, FileDown, Printer } from 'lucide-vue-next'
import type { PurchaseOrder, PurchaseOrderFormData } from '@/types'
import PurchaseOrderFormModal from '@/components/purchase/PurchaseOrderFormModal.vue'
import ReceivePurchaseOrderModal from '@/components/purchase/ReceivePurchaseOrderModal.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import SortableTh from '@/components/common/SortableTh.vue'
import TableToolbar from '@/components/common/TableToolbar.vue'
import TablePagination from '@/components/common/TablePagination.vue'
import { usePagination } from '@/composables/usePagination'
import TableEmptyRow from '@/components/common/TableEmptyRow.vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import { ACTIVE_ROW_CLASS } from '@/utils/table'
import RowActionsMenu, { type RowAction } from '@/components/common/RowActionsMenu.vue'
import PurchaseOrderDetailSidebar from '@/components/purchase/PurchaseOrderDetailSidebar.vue'
import PurchaseOrderCompletedModal, {
  type PurchaseOrderCompletion,
} from '@/components/purchase/PurchaseOrderCompletedModal.vue'
import { useTableSort, type SortValue } from '@/composables/useTableSort'
import { usePurchaseOrdersStore } from '@/stores/purchaseOrders'
import { useProductsStore } from '@/stores/products'
import { useContactsStore } from '@/stores/contacts'
import { useAppStore } from '@/stores/app'
import {
  PURCHASE_ORDER_STATUS_COLORS as statusColors,
  PURCHASE_ORDER_STATUS_LABELS as statusLabels,
  purchaseOrderItemName as itemName,
} from '@/utils/purchaseOrder'
import { downloadPurchaseOrder, printPurchaseOrder } from '@/services/pdfDownload'
import { formatCurrency, formatDate } from '@/utils/format'

const store = usePurchaseOrdersStore()
const productsStore = useProductsStore()
const contactsStore = useContactsStore()
const appStore = useAppStore()

const showForm = ref(false)
const editingOrder = ref<PurchaseOrder | null>(null)
const showReceive = ref(false)
const receivingOrder = ref<PurchaseOrder | null>(null)
const showCancelConfirm = ref(false)
const cancelingId = ref<string | null>(null)
const showDeleteConfirm = ref(false)
const deletingId = ref<string | null>(null)
const showDetail = ref(false)

// Orden recién creada, editada o recibida: alimenta la pantalla con Imprimir orden.
const completedOrderId = ref<string | null>(null)
const completedMode = ref<PurchaseOrderCompletion>('created')
const completedLines = ref<{ name: string; quantity: number }[]>([])
const showCompleted = ref(false)
const completedOrder = computed(
  () => store.purchaseOrders.find((o) => o.id === completedOrderId.value) ?? null,
)

function showCompletion(orderId: string, mode: PurchaseOrderCompletion) {
  completedOrderId.value = orderId
  completedMode.value = mode
  showCompleted.value = true
}
const detailId = ref<string | null>(null)

// Se lee del store para que la ficha refleje recepciones y cambios.
const detailOrder = computed(
  () => store.purchaseOrders.find((o) => o.id === detailId.value) ?? null,
)

type SortKey = 'code' | 'date' | 'supplier' | 'received' | 'expectedDate' | 'status' | 'total'

const STATUS_ORDER = { pending: 0, partial: 1, received: 2, cancelled: 3 } as const

function unitsOrdered(order: PurchaseOrder): number {
  return order.items.reduce((sum, i) => sum + i.quantity, 0)
}

function unitsReceived(order: PurchaseOrder): number {
  return order.items.reduce((sum, i) => sum + i.receivedQuantity, 0)
}

function sortValue(order: PurchaseOrder, key: SortKey): SortValue {
  switch (key) {
    case 'code':
      return order.code
    case 'date':
      return order.date
    case 'supplier':
      return order.supplierName
    case 'received': {
      const ordered = unitsOrdered(order)
      return ordered ? unitsReceived(order) / ordered : null
    }
    case 'expectedDate':
      return order.expectedDate || null
    case 'status':
      return STATUS_ORDER[order.status]
    case 'total':
      return order.total
  }
}

type StatusFilter = 'all' | 'open' | 'received' | 'cancelled'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'open', label: 'Por recibir' },
  { value: 'received', label: 'Recibidas' },
  { value: 'cancelled', label: 'Canceladas' },
]

const search = ref('')
const statusFilter = ref<StatusFilter>('all')

const hasActiveFilters = computed(() => !!search.value.trim() || statusFilter.value !== 'all')

function clearFilters() {
  search.value = ''
  statusFilter.value = 'all'
}

function matchesStatus(order: PurchaseOrder): boolean {
  if (statusFilter.value === 'open') return isOpenOrder(order)
  if (statusFilter.value === 'received') return order.status === 'received'
  if (statusFilter.value === 'cancelled') return order.status === 'cancelled'
  return true
}

const orders = computed(() => {
  const q = search.value.trim().toLowerCase()
  return store.purchaseOrders.filter((order) => {
    if (!matchesStatus(order)) return false
    if (!q) return true
    return (
      order.code.toLowerCase().includes(q) ||
      order.supplierName.toLowerCase().includes(q) ||
      order.items.some((item) => itemName(item).toLowerCase().includes(q))
    )
  })
})
const { sortKey, sortDir, toggleSort, dirFor, sorted: sortedOrders } = useTableSort(orders, sortValue)

const {
  page,
  pageSize,
  pageCount,
  pagedRows: pagedOrders,
} = usePagination(sortedOrders, { resetOn: [search, statusFilter, sortKey, sortDir] })

const columns: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'code', label: 'Folio' },
  { key: 'date', label: 'Fecha' },
  { key: 'supplier', label: 'Proveedor' },
]
const trailingColumns: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'received', label: 'Recibido' },
  { key: 'expectedDate', label: 'Entrega' },
  { key: 'status', label: 'Estado' },
  { key: 'total', label: 'Total', align: 'right' },
]

function isOpenOrder(order: PurchaseOrder): boolean {
  return order.status === 'pending' || order.status === 'partial'
}

function orderActions(order: PurchaseOrder): RowAction[] {
  const actions: RowAction[] = []
  if (isOpenOrder(order)) actions.push({ key: 'receive', label: 'Recibir mercancía', icon: PackageCheck })
  if (order.status === 'pending') actions.push({ key: 'edit', label: 'Editar', icon: Pencil })
  actions.push(
    { key: 'print', label: 'Imprimir orden', icon: Printer },
    { key: 'download', label: 'Descargar PDF', icon: FileDown },
  )
  if (isOpenOrder(order)) actions.push({ key: 'cancel', label: 'Cancelar orden', icon: X, danger: true })
  else actions.push({ key: 'delete', label: 'Eliminar', icon: Trash2, danger: true })
  return actions
}

function runAction(order: PurchaseOrder, key: string) {
  if (key === 'receive') openReceive(order)
  else if (key === 'edit') openEdit(order)
  else if (key === 'print') printPurchaseOrder(order)
  else if (key === 'download') downloadPurchaseOrder(order)
  else if (key === 'cancel') askCancel(order.id)
  else if (key === 'delete') askDelete(order.id)
}

function openDetail(order: PurchaseOrder) {
  detailId.value = order.id
  showDetail.value = true
}

onMounted(() => {
  store.loadPurchaseOrders()
  productsStore.loadProducts()
  contactsStore.loadContacts()
})

function openCreate() {
  editingOrder.value = null
  showForm.value = true
}

function openEdit(order: PurchaseOrder) {
  editingOrder.value = order
  showForm.value = true
}

async function handleSave(data: PurchaseOrderFormData) {
  try {
    const editing = editingOrder.value
    const saved = editing
      ? await store.updatePurchaseOrder(editing.id, data)
      : await store.createPurchaseOrder(data)
    showForm.value = false
    showCompletion(saved.id, editing ? 'updated' : 'created')
  } catch (e) {
    appStore.showToast(e instanceof Error ? e.message : 'Error al guardar la orden', 'error')
  }
}

function openReceive(order: PurchaseOrder) {
  receivingOrder.value = order
  showReceive.value = true
}

async function handleReceive(receipts: Record<number, number>) {
  const order = receivingOrder.value
  if (!order) return
  // Lo que entra ahora, con el mismo tope que aplica el store (lo pendiente de cada línea).
  const lines = order.items
    .map((item, idx) => ({
      name: itemName(item),
      quantity: Math.min(
        Math.max(0, Math.floor(receipts[idx] ?? 0)),
        item.quantity - item.receivedQuantity,
      ),
    }))
    .filter((line) => line.quantity > 0)
  try {
    await store.receivePurchaseOrder(order.id, receipts)
    await productsStore.loadProducts()
    completedLines.value = lines
    showCompletion(order.id, 'received')
  } catch (e) {
    appStore.showToast(e instanceof Error ? e.message : 'Error al recibir la mercancía', 'error')
  }
}

function askCancel(id: string) {
  cancelingId.value = id
  showCancelConfirm.value = true
}

async function handleCancel() {
  if (!cancelingId.value) return
  try {
    await store.cancelPurchaseOrder(cancelingId.value)
    appStore.showToast('Orden de compra cancelada', 'success')
  } catch {
    appStore.showToast('Error al cancelar la orden', 'error')
  } finally {
    cancelingId.value = null
  }
}

function askDelete(id: string) {
  deletingId.value = id
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!deletingId.value) return
  try {
    await store.removePurchaseOrder(deletingId.value)
    appStore.showToast('Orden de compra eliminada', 'success')
  } catch {
    appStore.showToast('Error al eliminar la orden', 'error')
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <TableToolbar
      v-model:search="search"
      search-placeholder="Folio, proveedor o producto..."
      :filtered="hasActiveFilters"
      @clear="clearFilters"
    >
      <template #filters>
        <SegmentedControl v-model="statusFilter" :options="STATUS_OPTIONS" />
      </template>
      <template #actions>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          @click="openCreate"
        >
          <Plus :size="16" />
          Nueva orden de compra
        </button>
      </template>
      <template #summary>
        <span>
          {{ sortedOrders.length }}
          <template v-if="hasActiveFilters">de {{ store.purchaseOrders.length }}</template>
          orden(es)
        </span>
        <span v-if="store.openPurchaseOrders.length > 0" class="text-warning">
          {{ store.openPurchaseOrders.length }} por recibir
        </span>
      </template>
    </TableToolbar>

    <LoadingSpinner v-if="store.loading" label="Cargando órdenes de compra..." />

    <div v-else class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full min-w-[960px] text-left text-sm">
        <thead class="border-b border-border bg-surface-overlay text-xs uppercase text-zinc-500">
          <tr>
            <th class="w-12 py-3 pl-3 pr-1.5"><span class="sr-only">Acciones</span></th>
            <SortableTh
              v-for="col in columns"
              :key="col.key"
              :label="col.label"
              :dir="dirFor(col.key)"
              :align="col.align"
              @sort="toggleSort(col.key)"
            />
            <th class="px-4 py-3 font-medium">Productos</th>
            <SortableTh
              v-for="col in trailingColumns"
              :key="col.key"
              :label="col.label"
              :dir="dirFor(col.key)"
              :align="col.align"
              @sort="toggleSort(col.key)"
            />
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr
            v-for="order in pagedOrders"
            :key="order.id"
            class="cursor-pointer transition hover:bg-surface-overlay/50"
            :class="{ [ACTIVE_ROW_CLASS]: detailId === order.id }"
            @click="openDetail(order)"
          >
            <td class="py-3 pl-3 pr-1.5" @click.stop>
              <RowActionsMenu :items="orderActions(order)" @select="runAction(order, $event)" />
            </td>
            <td class="whitespace-nowrap px-4 py-3 font-medium text-zinc-100">{{ order.code }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-zinc-300">{{ formatDate(order.date) }}</td>
            <td class="px-4 py-3 text-zinc-200">{{ order.supplierName }}</td>
            <td class="max-w-[18rem] px-4 py-3">
              <p class="truncate text-zinc-300" :title="order.items.map(itemName).join(', ')">
                {{ order.items[0] ? itemName(order.items[0]) : '—' }}
              </p>
              <p v-if="order.items.length > 1" class="text-xs text-zinc-500">
                y {{ order.items.length - 1 }} producto(s) más
              </p>
            </td>
            <td class="whitespace-nowrap px-4 py-3">
              <span
                class="tabular-nums"
                :class="unitsReceived(order) >= unitsOrdered(order) ? 'text-success' : 'text-zinc-300'"
              >
                {{ unitsReceived(order) }}/{{ unitsOrdered(order) }}
              </span>
              <span class="text-xs text-zinc-500"> unid.</span>
            </td>
            <td class="whitespace-nowrap px-4 py-3 text-zinc-400">
              {{ order.expectedDate ? formatDate(order.expectedDate) : '—' }}
            </td>
            <td class="px-4 py-3">
              <span class="rounded-md px-2 py-0.5 text-xs font-medium" :class="statusColors[order.status]">
                {{ statusLabels[order.status] }}
              </span>
            </td>
            <td class="whitespace-nowrap px-4 py-3 text-right font-medium">
              <span :class="order.status === 'cancelled' ? 'text-zinc-500 line-through' : 'text-zinc-100'">
                {{ formatCurrency(order.total) }}
              </span>
            </td>
          </tr>
          <TableEmptyRow
            v-if="sortedOrders.length === 0"
            :colspan="9"
            :filtered="hasActiveFilters && store.purchaseOrders.length > 0"
            empty-text="No hay órdenes de compra registradas"
            @clear="clearFilters"
          />
        </tbody>
      </table>
    </div>
    <TablePagination
      v-if="!store.loading"
      v-model:page="page"
      :total="sortedOrders.length"
      :page-size="pageSize"
      :page-count="pageCount"
    />

    <PurchaseOrderDetailSidebar v-model="showDetail" :order="detailOrder" />
    <PurchaseOrderCompletedModal
      v-model="showCompleted"
      :order="completedOrder"
      :mode="completedMode"
      :received-lines="completedLines"
    />

    <PurchaseOrderFormModal v-model="showForm" :order="editingOrder" @save="handleSave" />
    <ReceivePurchaseOrderModal v-model="showReceive" :order="receivingOrder" @receive="handleReceive" />

    <ConfirmDialog
      v-model="showCancelConfirm"
      title="Cancelar orden de compra"
      message="La orden quedará cancelada. Las recepciones ya registradas no se revierten."
      confirm-label="Cancelar orden"
      variant="danger"
      @confirm="handleCancel"
    />
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Eliminar orden de compra"
      message="¿Seguro que deseas eliminar esta orden? Esta acción no se puede deshacer."
      confirm-label="Eliminar"
      variant="danger"
      @confirm="handleDelete"
    />
  </div>
</template>
