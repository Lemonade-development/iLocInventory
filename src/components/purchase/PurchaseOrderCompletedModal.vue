<script setup lang="ts">
import { computed } from 'vue'
import type { PurchaseOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/format'
import {
  PURCHASE_ORDER_STATUS_COLORS as statusColors,
  PURCHASE_ORDER_STATUS_LABELS as statusLabels,
  purchaseOrderItemName,
} from '@/utils/purchaseOrder'
import { downloadPurchaseOrder, printPurchaseOrder } from '@/services/pdfDownload'
import OperationCompletedModal from '@/components/common/OperationCompletedModal.vue'

export type PurchaseOrderCompletion = 'created' | 'updated' | 'received'

const props = defineProps<{
  order: PurchaseOrder | null
  mode: PurchaseOrderCompletion
  /** Solo en una recepción: lo que entró al inventario en esta ocasión. */
  receivedLines?: { name: string; quantity: number }[]
}>()

const open = defineModel<boolean>({ required: true })

const TITLES: Record<PurchaseOrderCompletion, string> = {
  created: 'Orden de compra creada',
  updated: 'Orden de compra actualizada',
  received: 'Mercancía recibida',
}

const unitsOrdered = computed(() => props.order?.items.reduce((s, i) => s + i.quantity, 0) ?? 0)
const unitsReceived = computed(
  () => props.order?.items.reduce((s, i) => s + i.receivedQuantity, 0) ?? 0,
)

function handlePrint() {
  if (props.order) printPurchaseOrder(props.order)
}

function handleDownload() {
  if (props.order) downloadPurchaseOrder(props.order)
}
</script>

<template>
  <OperationCompletedModal
    v-if="order"
    v-model="open"
    :title="TITLES[mode]"
    :heading="`Orden ${order.code}`"
    :subheading="`${order.supplierName} · ${formatDate(order.date)}`"
    :print-label="mode === 'received' ? 'Imprimir orden actualizada' : 'Imprimir orden'"
    :auto-printable="false"
    @print="handlePrint"
    @download="handleDownload"
  >
    <div class="space-y-4 text-sm">
      <!-- Recepción: lo que entró ahora y el avance de la orden -->
      <template v-if="mode === 'received'">
        <div class="divide-y divide-border rounded-lg border border-border bg-surface-overlay/40">
          <div
            v-for="line in receivedLines ?? []"
            :key="line.name"
            class="flex items-center justify-between gap-3 px-3 py-2"
          >
            <p class="min-w-0 truncate text-zinc-200">{{ line.name }}</p>
            <span class="shrink-0 font-medium text-success">+{{ line.quantity }}</span>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-zinc-400">Recibido de la orden</span>
          <span class="flex items-center gap-2">
            <span class="tabular-nums text-zinc-200">{{ unitsReceived }}/{{ unitsOrdered }} unid.</span>
            <span class="rounded-md px-2 py-0.5 text-xs font-medium" :class="statusColors[order.status]">
              {{ statusLabels[order.status] }}
            </span>
          </span>
        </div>
      </template>

      <!-- Alta o edición: resumen de la orden -->
      <template v-else>
        <div class="divide-y divide-border rounded-lg border border-border bg-surface-overlay/40">
          <div
            v-for="(item, idx) in order.items"
            :key="idx"
            class="flex items-center justify-between gap-3 px-3 py-2"
          >
            <p class="min-w-0 truncate text-zinc-200">
              {{ purchaseOrderItemName(item) }} <span class="text-zinc-500">× {{ item.quantity }}</span>
            </p>
            <span class="shrink-0 text-zinc-300">{{ formatCurrency(item.unitCost * item.quantity) }}</span>
          </div>
        </div>
        <p v-if="order.expectedDate" class="text-xs text-zinc-500">
          Entrega estimada: {{ formatDate(order.expectedDate) }}
        </p>
      </template>

      <div class="flex items-baseline justify-between border-t border-border pt-3">
        <span class="font-medium text-zinc-300">Total de la orden</span>
        <span class="text-xl font-semibold text-accent">{{ formatCurrency(order.total) }}</span>
      </div>
    </div>
  </OperationCompletedModal>
</template>
