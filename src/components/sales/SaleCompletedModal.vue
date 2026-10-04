<script setup lang="ts">
import { computed } from 'vue'
import type { PaymentMethod, Sale } from '@/types'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format'
import { imeiDisplayLines } from '@/utils/imei'
import { saleNoteProductName } from '@/utils/product'
import { downloadSaleReceipt, printSaleReceipt } from '@/services/pdfDownload'
import OperationCompletedModal from '@/components/common/OperationCompletedModal.vue'
import UsdEquivalent from '@/components/common/UsdEquivalent.vue'
import AppleAccountSummary from './AppleAccountSummary.vue'

const props = defineProps<{
  sale: Sale | null
}>()

const open = defineModel<boolean>({ required: true })

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  canje: 'Equipo a cuenta',
  credito: 'Crédito',
  otro: 'Otro',
}

const ticketId = computed(() => props.sale?.id.slice(0, 8).toUpperCase() ?? '')

const tradeInCredit = computed(() => {
  if (!props.sale?.tradeInValue) return 0
  return Math.min(props.sale.tradeInValue, props.sale.total)
})

function handleDownload() {
  if (props.sale) downloadSaleReceipt(props.sale)
}

function handlePrint() {
  if (props.sale) printSaleReceipt(props.sale)
}
</script>

<template>
  <OperationCompletedModal
    v-if="sale"
    v-model="open"
    title="Venta registrada"
    :heading="`Ticket #${ticketId}`"
    :subheading="formatDateTime(sale.date)"
    print-label="Imprimir ticket"
    @print="handlePrint"
    @download="handleDownload"
  >
    <div class="space-y-5">
      <!-- Cliente y pago -->
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p class="text-xs text-zinc-500">Cliente</p>
          <p class="truncate text-zinc-200">{{ sale.customerName || '—' }}</p>
          <p v-if="sale.customerPhone" class="text-xs text-zinc-400">{{ sale.customerPhone }}</p>
        </div>
        <div>
          <p class="text-xs text-zinc-500">Método de pago</p>
          <p class="text-zinc-200">{{ PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod }}</p>
        </div>
      </div>

      <!-- Productos -->
      <div class="rounded-lg border border-border bg-surface-overlay/40">
        <div class="divide-y divide-border">
          <div
            v-for="item in sale.items"
            :key="item.productId"
            class="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-zinc-200">
                {{ saleNoteProductName(item.productName) }} <span class="text-zinc-500">× {{ item.quantity }}</span>
              </p>
              <p
                v-for="line in imeiDisplayLines(item.imeis)"
                :key="line"
                class="font-mono text-xs text-zinc-500"
              >
                {{ line }}
              </p>
            </div>
            <span class="shrink-0 text-zinc-300">{{ formatCurrency(item.subtotal) }}</span>
          </div>
        </div>
      </div>

      <!-- Cuenta Apple -->
      <div v-if="sale.appleAccount" class="rounded-lg border border-border bg-surface-overlay/40 px-3 py-2">
        <p class="mb-1 text-xs text-zinc-500">Cuenta Apple</p>
        <AppleAccountSummary :key="sale.id" :account="sale.appleAccount" />
      </div>

      <!-- Totales -->
      <div class="space-y-1.5 border-t border-border pt-3 text-sm">
        <div v-if="sale.subtotal !== undefined" class="flex justify-between">
          <span class="text-zinc-400">Subtotal</span>
          <span class="text-zinc-300">{{ formatCurrency(sale.subtotal) }}</span>
        </div>
        <div v-if="sale.discountAmount && sale.discountAmount > 0" class="flex justify-between">
          <span class="text-zinc-400">
            Descuento<template v-if="sale.discountType === 'percent'"> ({{ sale.discountValue }}%)</template>
          </span>
          <span class="text-success">−{{ formatCurrency(sale.discountAmount) }}</span>
        </div>
        <div v-if="tradeInCredit > 0" class="flex justify-between">
          <span class="text-zinc-400">Equipo a cuenta</span>
          <span class="text-success">−{{ formatCurrency(tradeInCredit) }}</span>
        </div>
        <div v-if="sale.paymentMethod === 'credito'" class="flex justify-between">
          <span class="text-zinc-400">Abono inicial</span>
          <span class="text-success">−{{ formatCurrency(sale.creditDownPayment ?? 0) }}</span>
        </div>

        <div class="flex items-baseline justify-between pt-1.5">
          <span class="font-medium text-zinc-300">
            {{ sale.paymentMethod === 'credito' ? 'Saldo pendiente' : 'Total' }}
          </span>
          <span class="flex flex-col items-end">
            <span
              class="text-xl font-semibold"
              :class="sale.paymentMethod === 'credito' ? 'text-warning' : 'text-accent'"
            >
              {{
                sale.paymentMethod === 'credito'
                  ? formatCurrency(sale.creditBalance ?? 0)
                  : formatCurrency(sale.total)
              }}
            </span>
            <UsdEquivalent
              :bs="sale.paymentMethod === 'credito' ? (sale.creditBalance ?? 0) : sale.total"
              :rate="sale.exchangeRate"
            />
          </span>
        </div>
        <p
          v-if="sale.paymentMethod === 'credito' && sale.creditDueDate"
          class="text-right text-xs text-zinc-500"
        >
          Total {{ formatCurrency(sale.total) }} · vence {{ formatDate(sale.creditDueDate) }}
        </p>
      </div>
    </div>

  </OperationCompletedModal>
</template>
