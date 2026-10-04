<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { X, Pencil, Phone, Calendar, StickyNote, ShoppingBag, ClipboardList, ChevronRight } from 'lucide-vue-next'
import type { Contact, PurchaseOrder, Sale } from '@/types'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format'
import { saleNoteProductName } from '@/utils/product'
import {
  PURCHASE_ORDER_STATUS_COLORS as statusColors,
  PURCHASE_ORDER_STATUS_LABELS as statusLabels,
  purchaseOrderItemName,
} from '@/utils/purchaseOrder'
import { useSalesStore } from '@/stores/sales'
import { usePurchaseOrdersStore } from '@/stores/purchaseOrders'

const props = defineProps<{
  contact: Contact | null
  /** Hay otra ficha abierta encima (venta u orden); Escape la cierra a ella primero. */
  covered?: boolean
}>()

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  edit: [contact: Contact]
  openSale: [sale: Sale]
  openOrder: [order: PurchaseOrder]
}>()

const salesStore = useSalesStore()
const purchaseOrdersStore = usePurchaseOrdersStore()

const paymentLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  canje: 'Equipo a cuenta',
  credito: 'Crédito',
  otro: 'Otro',
}

const isSupplier = computed(() => props.contact?.type === 'supplier')

const contactSales = computed<Sale[]>(() => {
  const id = props.contact?.id
  if (!id || isSupplier.value) return []
  return salesStore.sales
    .filter((s) => s.contactId === id)
    .sort((a, b) => b.date.localeCompare(a.date))
})

// Las órdenes viejas pueden no tener supplierId; en ese caso se usa el nombre guardado.
const contactOrders = computed<PurchaseOrder[]>(() => {
  const contact = props.contact
  if (!contact || !isSupplier.value) return []
  const name = contact.name.trim().toLowerCase()
  return purchaseOrdersStore.purchaseOrders
    .filter((o) =>
      o.supplierId
        ? o.supplierId === contact.id
        : o.supplierName.trim().toLowerCase() === name,
    )
    .sort((a, b) => b.date.localeCompare(a.date))
})

const summary = computed(() => {
  if (isSupplier.value) {
    const active = contactOrders.value.filter((o) => o.status !== 'cancelled')
    return {
      count: active.length,
      countLabel: 'Órdenes',
      total: active.reduce((sum, o) => sum + o.total, 0),
      lastDate: active[0]?.date,
    }
  }
  return {
    count: contactSales.value.length,
    countLabel: 'Ventas',
    total: contactSales.value.reduce((sum, s) => sum + s.total, 0),
    lastDate: contactSales.value[0]?.date,
  }
})

function saleProducts(sale: Sale): string {
  return sale.items.map((i) => saleNoteProductName(i.productName)).join(', ')
}

function pendingBalance(sale: Sale): number {
  if (sale.paymentMethod !== 'credito' || sale.creditPaid) return 0
  return sale.creditBalance ?? 0
}

function orderProducts(order: PurchaseOrder): string {
  return order.items.map(purchaseOrderItemName).join(', ')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value && !props.covered) open.value = false
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open && contact" class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-black/60" @click="open = false" />

        <aside
          class="relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface-raised shadow-2xl"
        >
          <!-- Header -->
          <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div class="min-w-0 flex-1">
              <span
                class="rounded px-1.5 py-0.5 text-[10px] font-medium"
                :class="isSupplier ? 'bg-amber-500/15 text-amber-500' : 'bg-accent/15 text-accent'"
              >
                {{ isSupplier ? 'Proveedor' : 'Cliente' }}
              </span>
              <h2 class="mt-1.5 truncate text-lg font-semibold text-zinc-100">{{ contact.name }}</h2>
            </div>
            <button
              type="button"
              class="rounded-lg p-1.5 text-zinc-400 transition hover:bg-surface-overlay hover:text-zinc-100"
              @click="open = false"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto">
            <!-- Datos -->
            <section class="space-y-2 border-b border-border px-6 py-5 text-sm">
              <p class="flex items-center gap-2 text-zinc-300">
                <Phone :size="14" class="text-zinc-500" />
                {{ contact.phone || 'Sin teléfono' }}
              </p>
              <p class="flex items-center gap-2 text-zinc-400">
                <Calendar :size="14" class="text-zinc-500" />
                Registrado el {{ formatDate(contact.createdAt) }}
              </p>
              <p v-if="contact.notes" class="flex items-start gap-2 text-zinc-400">
                <StickyNote :size="14" class="mt-0.5 shrink-0 text-zinc-500" />
                <span class="whitespace-pre-line">{{ contact.notes }}</span>
              </p>
            </section>

            <!-- Resumen -->
            <section class="grid grid-cols-3 gap-3 border-b border-border px-6 py-5">
              <div>
                <p class="text-xs text-zinc-500">{{ summary.countLabel }}</p>
                <p class="text-lg font-semibold text-zinc-100">{{ summary.count }}</p>
              </div>
              <div>
                <p class="text-xs text-zinc-500">Total</p>
                <p class="text-lg font-semibold text-zinc-100">{{ formatCurrency(summary.total) }}</p>
              </div>
              <div>
                <p class="text-xs text-zinc-500">Última</p>
                <p class="text-sm font-medium text-zinc-300">
                  {{ summary.lastDate ? formatDate(summary.lastDate) : '—' }}
                </p>
              </div>
            </section>

            <!-- Ventas al cliente -->
            <section v-if="!isSupplier" class="px-6 py-5">
              <h3 class="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <ShoppingBag :size="13" />
                Ventas realizadas
              </h3>
              <p v-if="contactSales.length === 0" class="text-sm text-zinc-500">
                Este cliente todavía no tiene ventas.
              </p>
              <ul v-else class="space-y-2">
                <li v-for="sale in contactSales" :key="sale.id">
                  <button
                    type="button"
                    class="block w-full rounded-lg border border-border bg-surface-overlay/40 px-3 py-2.5 text-left text-sm transition hover:border-accent/60 hover:bg-surface-overlay focus:border-accent focus:outline-none"
                    title="Ver detalle de la venta"
                    @click="emit('openSale', sale)"
                  >
                    <span class="flex items-center justify-between gap-3">
                      <span class="text-zinc-400">{{ formatDateTime(sale.date) }}</span>
                      <span class="flex items-center gap-1">
                        <span
                          class="font-medium"
                          :class="sale.returnStatus ? 'text-zinc-500 line-through' : 'text-zinc-100'"
                        >
                          {{ formatCurrency(sale.total) }}
                        </span>
                        <ChevronRight :size="14" class="text-zinc-500" />
                      </span>
                    </span>
                    <span class="mt-1 line-clamp-2 block text-zinc-200">{{ saleProducts(sale) }}</span>
                    <span class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span class="rounded bg-surface-overlay px-1.5 py-0.5 text-zinc-400">
                        {{ paymentLabels[sale.paymentMethod] ?? sale.paymentMethod }}
                      </span>
                      <span
                        v-if="pendingBalance(sale) > 0"
                        class="rounded bg-warning/15 px-1.5 py-0.5 text-warning"
                      >
                        Saldo {{ formatCurrency(pendingBalance(sale)) }}
                      </span>
                      <span
                        v-if="sale.returnStatus"
                        class="rounded bg-danger/15 px-1.5 py-0.5 text-danger"
                      >
                        {{ sale.returnStatus === 'full' ? 'Devuelta' : 'Devuelta parcial' }}
                      </span>
                    </span>
                  </button>
                </li>
              </ul>
            </section>

            <!-- Compras al proveedor -->
            <section v-else class="px-6 py-5">
              <h3 class="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <ClipboardList :size="13" />
                Compras realizadas
              </h3>
              <p v-if="contactOrders.length === 0" class="text-sm text-zinc-500">
                Todavía no hay órdenes de compra a este proveedor.
              </p>
              <ul v-else class="space-y-2">
                <li v-for="order in contactOrders" :key="order.id">
                  <button
                    type="button"
                    class="block w-full rounded-lg border border-border bg-surface-overlay/40 px-3 py-2.5 text-left text-sm transition hover:border-accent/60 hover:bg-surface-overlay focus:border-accent focus:outline-none"
                    title="Ver detalle de la orden"
                    @click="emit('openOrder', order)"
                  >
                    <span class="flex items-center justify-between gap-3">
                      <span class="font-medium text-zinc-200">{{ order.code }}</span>
                      <span class="flex items-center gap-1">
                        <span
                          class="font-medium"
                          :class="order.status === 'cancelled' ? 'text-zinc-500 line-through' : 'text-zinc-100'"
                        >
                          {{ formatCurrency(order.total) }}
                        </span>
                        <ChevronRight :size="14" class="text-zinc-500" />
                      </span>
                    </span>
                    <span class="mt-1 line-clamp-2 block text-zinc-300">{{ orderProducts(order) }}</span>
                    <span class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span class="text-zinc-500">{{ formatDate(order.date) }}</span>
                      <span class="rounded px-1.5 py-0.5" :class="statusColors[order.status]">
                        {{ statusLabels[order.status] }}
                      </span>
                    </span>
                  </button>
                </li>
              </ul>
            </section>
          </div>

          <!-- Footer -->
          <div class="border-t border-border px-6 py-4">
            <button
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-zinc-200 transition hover:border-accent hover:text-accent"
              @click="emit('edit', contact)"
            >
              <Pencil :size="15" /> Editar contacto
            </button>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;
}
.drawer-enter-active aside,
.drawer-leave-active aside {
  transition: transform 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from aside,
.drawer-leave-to aside {
  transform: translateX(100%);
}
</style>
