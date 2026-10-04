<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, User, Truck, Pencil, Trash2 } from 'lucide-vue-next'
import type { Contact, ContactFormData, ContactType, PurchaseOrder, Sale } from '@/types'
import ContactFormModal from '@/components/contacts/ContactFormModal.vue'
import ContactDetailSidebar from '@/components/contacts/ContactDetailSidebar.vue'
import SaleDetailSidebar from '@/components/sales/SaleDetailSidebar.vue'
import SaleEditModal from '@/components/sales/SaleEditModal.vue'
import CreditPaymentModal from '@/components/sales/CreditPaymentModal.vue'
import SaleReturnModal from '@/components/sales/SaleReturnModal.vue'
import PurchaseOrderDetailSidebar from '@/components/purchase/PurchaseOrderDetailSidebar.vue'
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
import { compareSortValues, useTableSort, type SortValue } from '@/composables/useTableSort'
import { useContactsStore } from '@/stores/contacts'
import { useSalesStore } from '@/stores/sales'
import { usePurchaseOrdersStore } from '@/stores/purchaseOrders'
import { useAppStore } from '@/stores/app'
import { formatCurrency, formatDate } from '@/utils/format'

const contactsStore = useContactsStore()
const salesStore = useSalesStore()
const purchaseOrdersStore = usePurchaseOrdersStore()
const appStore = useAppStore()

const search = ref('')
const typeFilter = ref<'all' | ContactType>('all')

const TYPE_OPTIONS: { value: 'all' | ContactType; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'customer', label: 'Clientes' },
  { value: 'supplier', label: 'Proveedores' },
]

const hasActiveFilters = computed(() => !!search.value.trim() || typeFilter.value !== 'all')

function clearFilters() {
  search.value = ''
  typeFilter.value = 'all'
}
const showForm = ref(false)
const editing = ref<Contact | null>(null)
const showDeleteConfirm = ref(false)
const deletingId = ref<string | null>(null)
const showDetail = ref(false)
const detailId = ref<string | null>(null)

// Segunda ficha: detalle de una venta abierta desde la ficha del contacto.
const selectedSale = ref<Sale | null>(null)
const saleDetailOpen = ref(false)
const saleEditOpen = ref(false)
const salePayOpen = ref(false)
const saleReturnOpen = ref(false)

// Segunda ficha: detalle de una orden de compra abierta desde la ficha del proveedor.
const selectedOrder = ref<PurchaseOrder | null>(null)
const orderDetailOpen = ref(false)

type SortKey = 'name' | 'type' | 'phone' | 'count' | 'total' | 'lastDate'

// Se lee del store para que la ficha refleje los cambios al editar.
const detailContact = computed(
  () => contactsStore.contacts.find((c) => c.id === detailId.value) ?? null,
)

onMounted(() => {
  contactsStore.loadContacts()
  if (salesStore.sales.length === 0) salesStore.loadSales()
  if (purchaseOrdersStore.purchaseOrders.length === 0) purchaseOrdersStore.loadPurchaseOrders()
})

// Estadísticas de compras por contacto: nº de ventas, total gastado y última compra.
const statsByContact = computed(() => {
  const map = new Map<string, { count: number; total: number; lastDate: string }>()
  for (const sale of salesStore.sales) {
    if (!sale.contactId) continue
    const current = map.get(sale.contactId) ?? { count: 0, total: 0, lastDate: '' }
    current.count++
    current.total += sale.total
    if (!current.lastDate || sale.date > current.lastDate) current.lastDate = sale.date
    map.set(sale.contactId, current)
  }
  return map
})

function isSupplier(contact: Contact): boolean {
  return contact.type === 'supplier'
}

/** Valor de orden de cada columna. Los proveedores no tienen compras: van al final. */
function sortValue(contact: Contact, key: SortKey): SortValue {
  const stats = isSupplier(contact) ? undefined : statsByContact.value.get(contact.id)
  switch (key) {
    case 'name':
      return contact.name
    case 'type':
      return isSupplier(contact) ? 'Proveedor' : 'Cliente'
    case 'phone':
      return contact.phone || null
    case 'count':
      return isSupplier(contact) ? null : (stats?.count ?? 0)
    case 'total':
      return isSupplier(contact) ? null : (stats?.total ?? 0)
    case 'lastDate':
      return stats?.lastDate || null
  }
}

const columns: { key: SortKey | null; label: string; align?: 'right' }[] = [
  { key: 'name', label: 'Nombre' },
  { key: 'type', label: 'Tipo' },
  { key: 'phone', label: 'Teléfono' },
  { key: null, label: 'Notas' },
  { key: 'count', label: 'Compras', align: 'right' },
  { key: 'total', label: 'Total comprado', align: 'right' },
  { key: 'lastDate', label: 'Última compra' },
]

const visibleContacts = computed(() => {
  const q = search.value.trim().toLowerCase()
  return contactsStore.contacts.filter((c) => {
    if (typeFilter.value === 'supplier' && !isSupplier(c)) return false
    if (typeFilter.value === 'customer' && isSupplier(c)) return false
    if (!q) return true
    return c.name.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q)
  })
})

// Sin columna activa, de la A a la Z por nombre.
const {
  sortKey,
  sortDir,
  toggleSort,
  dirFor,
  sorted: filteredContacts,
} = useTableSort(visibleContacts, sortValue, {
  defaultCompare: (a, b) => compareSortValues(a.name, b.name, 'asc'),
})

const {
  page,
  pageSize,
  pageCount,
  pagedRows: pagedContacts,
} = usePagination(filteredContacts, { resetOn: [search, typeFilter, sortKey, sortDir] })

const contactActions: RowAction[] = [
  { key: 'edit', label: 'Editar', icon: Pencil },
  { key: 'delete', label: 'Eliminar', icon: Trash2, danger: true },
]

function runAction(contact: Contact, key: string) {
  if (key === 'edit') openEdit(contact)
  else if (key === 'delete') askDelete(contact.id)
}

function openDetail(contact: Contact) {
  detailId.value = contact.id
  showDetail.value = true
}

function openSale(sale: Sale) {
  selectedSale.value = sale
  saleDetailOpen.value = true
}

function openOrder(order: PurchaseOrder) {
  selectedOrder.value = order
  orderDetailOpen.value = true
}

function onSaleSaved(updated: Sale) {
  selectedSale.value = updated
}

function editFromDetail(contact: Contact) {
  showDetail.value = false
  openEdit(contact)
}

function openCreate() {
  editing.value = null
  showForm.value = true
}

function openEdit(contact: Contact) {
  editing.value = contact
  showForm.value = true
}

async function handleSave(data: ContactFormData) {
  try {
    if (editing.value) {
      await contactsStore.updateContact(editing.value.id, data)
      appStore.showToast('Contacto actualizado', 'success')
    } else {
      await contactsStore.createContact(data)
      appStore.showToast('Contacto creado', 'success')
    }
    showForm.value = false
  } catch {
    appStore.showToast('Error al guardar el contacto', 'error')
  }
}

function askDelete(id: string) {
  deletingId.value = id
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!deletingId.value) return
  try {
    await contactsStore.removeContact(deletingId.value)
    appStore.showToast('Contacto eliminado', 'success')
  } catch {
    appStore.showToast('Error al eliminar el contacto', 'error')
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <TableToolbar
      v-model:search="search"
      search-placeholder="Nombre o teléfono..."
      :filtered="hasActiveFilters"
      @clear="clearFilters"
    >
      <template #filters>
        <SegmentedControl v-model="typeFilter" :options="TYPE_OPTIONS" />
      </template>
      <template #actions>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          @click="openCreate"
        >
          <Plus :size="16" />
          Nuevo contacto
        </button>
      </template>
      <template #summary>
        <span>
          {{ filteredContacts.length }}
          <template v-if="hasActiveFilters">de {{ contactsStore.contacts.length }}</template>
          contacto(s)
        </span>
      </template>
    </TableToolbar>

    <LoadingSpinner v-if="contactsStore.loading" label="Cargando contactos..." />

    <div v-else class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full min-w-[820px] text-left text-sm">
        <thead class="border-b border-border bg-surface-overlay text-xs uppercase text-zinc-500">
          <tr>
            <th class="w-12 py-3 pl-3 pr-1.5"><span class="sr-only">Acciones</span></th>
            <template v-for="col in columns" :key="col.label">
              <SortableTh
                v-if="col.key"
                :label="col.label"
                :dir="dirFor(col.key)"
                :align="col.align"
                @sort="toggleSort(col.key)"
              />
              <th v-else class="px-4 py-3 font-medium">{{ col.label }}</th>
            </template>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr
            v-for="contact in pagedContacts"
            :key="contact.id"
            class="cursor-pointer transition hover:bg-surface-overlay/50"
            :class="{ [ACTIVE_ROW_CLASS]: detailId === contact.id }"
            @click="openDetail(contact)"
          >
            <td class="py-3 pl-3 pr-1.5" @click.stop>
              <RowActionsMenu :items="contactActions" @select="runAction(contact, $event)" />
            </td>
            <td class="px-4 py-3">
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  :class="isSupplier(contact) ? 'bg-amber-500/15 text-amber-500' : 'bg-accent/15 text-accent'"
                >
                  <Truck v-if="isSupplier(contact)" :size="15" />
                  <User v-else :size="15" />
                </div>
                <span class="truncate font-medium text-zinc-100">{{ contact.name }}</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <span
                class="rounded-md px-2 py-0.5 text-xs font-medium"
                :class="isSupplier(contact) ? 'bg-amber-500/15 text-amber-500' : 'bg-accent/15 text-accent'"
              >
                {{ isSupplier(contact) ? 'Proveedor' : 'Cliente' }}
              </span>
            </td>
            <td class="whitespace-nowrap px-4 py-3 text-zinc-300">{{ contact.phone || '—' }}</td>
            <td class="max-w-[16rem] px-4 py-3">
              <p v-if="contact.notes" class="truncate text-zinc-500" :title="contact.notes">
                {{ contact.notes }}
              </p>
              <span v-else class="text-zinc-600">—</span>
            </td>
            <template v-if="!isSupplier(contact)">
              <td class="px-4 py-3 text-right text-zinc-300">
                {{ statsByContact.get(contact.id)?.count ?? 0 }}
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-right font-medium text-zinc-100">
                {{ formatCurrency(statsByContact.get(contact.id)?.total ?? 0) }}
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-zinc-400">
                {{
                  statsByContact.get(contact.id)?.lastDate
                    ? formatDate(statsByContact.get(contact.id)!.lastDate)
                    : '—'
                }}
              </td>
            </template>
            <template v-else>
              <td class="px-4 py-3 text-right text-zinc-600">—</td>
              <td class="px-4 py-3 text-right text-zinc-600">—</td>
              <td class="px-4 py-3 text-zinc-600">—</td>
            </template>
          </tr>
          <TableEmptyRow
            v-if="filteredContacts.length === 0"
            :colspan="8"
            :filtered="hasActiveFilters && contactsStore.contacts.length > 0"
            empty-text="No hay contactos registrados"
            @clear="clearFilters"
          />
        </tbody>
      </table>
    </div>
    <TablePagination
      v-if="!contactsStore.loading"
      v-model:page="page"
      :total="filteredContacts.length"
      :page-size="pageSize"
      :page-count="pageCount"
    />

    <ContactDetailSidebar
      v-model="showDetail"
      :contact="detailContact"
      :covered="saleDetailOpen || orderDetailOpen"
      @edit="editFromDetail"
      @open-sale="openSale"
      @open-order="openOrder"
    />
    <PurchaseOrderDetailSidebar v-model="orderDetailOpen" :order="selectedOrder" />
    <SaleDetailSidebar
      v-model="saleDetailOpen"
      :sale="selectedSale"
      @edit="saleEditOpen = true"
      @pay="salePayOpen = true"
      @return="saleReturnOpen = true"
    />
    <SaleEditModal v-model="saleEditOpen" :sale="selectedSale" @saved="onSaleSaved" />
    <CreditPaymentModal v-model="salePayOpen" :sale="selectedSale" @saved="onSaleSaved" />
    <SaleReturnModal v-model="saleReturnOpen" :sale="selectedSale" @saved="onSaleSaved" />

    <ContactFormModal v-model="showForm" :contact="editing" @save="handleSave" />

    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Eliminar contacto"
      message="¿Seguro que deseas eliminar este contacto? Las ventas asociadas conservarán el nombre del cliente."
      confirm-label="Eliminar"
      variant="danger"
      @confirm="handleDelete"
    />
  </div>
</template>
