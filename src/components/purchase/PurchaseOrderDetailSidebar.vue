<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { X, Truck, Calendar, StickyNote, Package } from 'lucide-vue-next'
import type { PurchaseOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/format'
import { CONDITION_LABELS } from '@/utils/product'
import { CATEGORY_LABELS } from '@/utils/category'
import {
  PURCHASE_ORDER_STATUS_COLORS as statusColors,
  PURCHASE_ORDER_STATUS_LABELS as statusLabels,
  purchaseOrderItemName,
} from '@/utils/purchaseOrder'
import { downloadPurchaseOrder, printPurchaseOrder } from '@/services/pdfDownload'
import DocumentActions from '@/components/common/DocumentActions.vue'
import UsdEquivalent from '@/components/common/UsdEquivalent.vue'

defineProps<{
  order: PurchaseOrder | null
}>()

const open = defineModel<boolean>({ required: true })

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) open.value = false
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open && order" class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-black/60" @click="open = false" />

        <aside
          class="relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface-raised shadow-2xl"
        >
          <!-- Header -->
          <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Orden de compra {{ order.code }}
                </p>
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  :class="statusColors[order.status]"
                >
                  {{ statusLabels[order.status] }}
                </span>
              </div>
              <p class="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
                <Calendar :size="13" />
                {{ formatDate(order.date) }}
              </p>
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
            <!-- Proveedor -->
            <section class="space-y-1.5 border-b border-border px-6 py-5 text-sm">
              <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Proveedor</h3>
              <p class="flex items-center gap-2 text-zinc-100">
                <Truck :size="14" class="text-zinc-500" />
                {{ order.supplierName }}
              </p>
              <p v-if="order.expectedDate" class="flex items-center gap-2 text-zinc-400">
                <Calendar :size="14" class="text-zinc-500" />
                Entrega estimada: {{ formatDate(order.expectedDate) }}
              </p>
            </section>

            <!-- Productos -->
            <section class="border-b border-border px-6 py-5">
              <h3 class="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <Package :size="13" />
                Productos
              </h3>
              <ul class="space-y-3">
                <li v-for="(item, idx) in order.items" :key="idx" class="text-sm">
                  <div class="flex items-start justify-between gap-3">
                    <p class="min-w-0 text-zinc-200">{{ purchaseOrderItemName(item) }}</p>
                    <span class="shrink-0 font-medium text-zinc-100">
                      {{ formatCurrency(item.unitCost * item.quantity) }}
                    </span>
                  </div>
                  <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span class="rounded bg-surface-overlay px-1.5 py-0.5 text-zinc-400">
                      {{ CATEGORY_LABELS[item.category] }}
                    </span>
                    <span
                      class="rounded px-1.5 py-0.5 font-medium"
                      :class="item.condition === 'nuevo' ? 'bg-accent/15 text-accent' : 'bg-warning/15 text-warning'"
                    >
                      {{ CONDITION_LABELS[item.condition] }}
                    </span>
                    <span class="text-zinc-500">
                      {{ item.quantity }} × {{ formatCurrency(item.unitCost) }}
                    </span>
                  </div>
                  <p
                    class="mt-1 text-xs"
                    :class="item.receivedQuantity >= item.quantity ? 'text-success' : 'text-zinc-500'"
                  >
                    Recibido {{ item.receivedQuantity }} de {{ item.quantity }}
                  </p>
                  <p v-if="item.notes" class="mt-1 text-xs text-zinc-500">{{ item.notes }}</p>
                </li>
              </ul>
            </section>

            <!-- Totales -->
            <section class="space-y-1.5 border-b border-border px-6 py-5 text-sm">
              <div class="flex justify-between">
                <span class="text-zinc-400">Subtotal</span>
                <span class="text-zinc-300">{{ formatCurrency(order.subtotal) }}</span>
              </div>
              <div class="flex items-baseline justify-between pt-1">
                <span class="font-medium text-zinc-300">Total</span>
                <span class="flex flex-col items-end">
                  <span
                    class="text-lg font-semibold"
                    :class="order.status === 'cancelled' ? 'text-zinc-500 line-through' : 'text-zinc-100'"
                  >
                    {{ formatCurrency(order.total) }}
                  </span>
                  <UsdEquivalent :bs="order.total" :rate="order.exchangeRate" class="block" />
                </span>
              </div>
            </section>

            <!-- Notas -->
            <section v-if="order.notes" class="border-b border-border px-6 py-5">
              <h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <StickyNote :size="13" />
                Notas
              </h3>
              <p class="whitespace-pre-line text-sm text-zinc-300">{{ order.notes }}</p>
            </section>
          </div>

          <!-- Footer -->
          <div class="flex justify-end border-t border-border px-6 py-4">
            <DocumentActions
              document-name="orden de compra"
              @print="printPurchaseOrder(order)"
              @download="downloadPurchaseOrder(order)"
            />
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
