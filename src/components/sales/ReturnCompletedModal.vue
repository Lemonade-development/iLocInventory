<script setup lang="ts">
import type { Sale, SaleReturn } from '@/types'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { saleNoteProductName } from '@/utils/product'
import { downloadReturnReceipt, printReturnReceipt } from '@/services/pdfDownload'
import OperationCompletedModal from '@/components/common/OperationCompletedModal.vue'

const props = defineProps<{
  sale: Sale | null
  saleReturn: SaleReturn | null
}>()

const open = defineModel<boolean>({ required: true })

const REFUND_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
}

function handlePrint() {
  if (props.sale && props.saleReturn) printReturnReceipt(props.sale, props.saleReturn)
}

function handleDownload() {
  if (props.sale && props.saleReturn) downloadReturnReceipt(props.sale, props.saleReturn)
}
</script>

<template>
  <OperationCompletedModal
    v-if="sale && saleReturn"
    v-model="open"
    title="Devolución registrada"
    :heading="`Venta #${sale.id.slice(0, 8).toUpperCase()}`"
    :subheading="formatDateTime(saleReturn.date)"
    print-label="Imprimir nota"
    @print="handlePrint"
    @download="handleDownload"
  >
    <div class="space-y-4 text-sm">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <p class="text-xs text-zinc-500">Cliente</p>
          <p class="truncate text-zinc-200">{{ sale.customerName || '—' }}</p>
        </div>
        <div>
          <p class="text-xs text-zinc-500">Motivo</p>
          <p class="text-zinc-200">{{ saleReturn.reason }}</p>
        </div>
      </div>

      <div class="divide-y divide-border rounded-lg border border-border bg-surface-overlay/40">
        <div
          v-for="item in saleReturn.items"
          :key="item.productId"
          class="flex items-center justify-between gap-3 px-3 py-2"
        >
          <p class="min-w-0 truncate text-zinc-200">
            {{ saleNoteProductName(item.productName) }} <span class="text-zinc-500">× {{ item.quantity }}</span>
          </p>
          <span class="shrink-0 text-xs text-zinc-500">
            {{ item.restocked ? 'Vuelve al stock' : 'No vuelve al stock' }}
          </span>
        </div>
      </div>

      <div class="space-y-1.5 border-t border-border pt-3">
        <div v-if="saleReturn.balanceApplied > 0" class="flex justify-between">
          <span class="text-zinc-400">Aplicado al saldo</span>
          <span class="text-zinc-300">{{ formatCurrency(saleReturn.balanceApplied) }}</span>
        </div>
        <div class="flex items-baseline justify-between">
          <span class="font-medium text-zinc-300">
            Reembolso · {{ REFUND_LABELS[saleReturn.refundMethod] ?? saleReturn.refundMethod }}
          </span>
          <span class="text-xl font-semibold text-accent">
            {{ formatCurrency(saleReturn.refundAmount - saleReturn.balanceApplied) }}
          </span>
        </div>
      </div>
    </div>
  </OperationCompletedModal>
</template>
