<script setup lang="ts">
import { computed } from 'vue'
import type { Sale } from '@/types'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format'
import { downloadCreditPaymentReceipt, printCreditPaymentReceipt } from '@/services/pdfDownload'
import OperationCompletedModal from '@/components/common/OperationCompletedModal.vue'

const props = defineProps<{
  sale: Sale | null
  /** Posición del abono en `sale.creditPayments`. */
  paymentIndex: number | null
}>()

const open = defineModel<boolean>({ required: true })

const payment = computed(() =>
  props.sale && props.paymentIndex !== null ? props.sale.creditPayments?.[props.paymentIndex] : undefined,
)

const code = computed(() =>
  props.sale && props.paymentIndex !== null
    ? `${props.sale.id.slice(0, 8).toUpperCase()}-${props.paymentIndex + 1}`
    : '',
)

function handlePrint() {
  if (props.sale && props.paymentIndex !== null) printCreditPaymentReceipt(props.sale, props.paymentIndex)
}

function handleDownload() {
  if (props.sale && props.paymentIndex !== null)
    downloadCreditPaymentReceipt(props.sale, props.paymentIndex)
}
</script>

<template>
  <OperationCompletedModal
    v-if="sale && payment"
    v-model="open"
    title="Pago registrado"
    :heading="`Comprobante #${code}`"
    :subheading="formatDateTime(payment.date)"
    print-label="Imprimir comprobante"
    @print="handlePrint"
    @download="handleDownload"
  >
    <div class="space-y-4 text-sm">
      <div>
        <p class="text-xs text-zinc-500">Cliente</p>
        <p class="truncate text-zinc-200">{{ sale.customerName || '—' }}</p>
      </div>

      <div class="space-y-1.5 border-t border-border pt-3">
        <div v-if="payment.balanceAfter !== undefined" class="flex justify-between">
          <span class="text-zinc-400">Saldo anterior</span>
          <span class="text-zinc-300">{{ formatCurrency(payment.balanceAfter + payment.amount) }}</span>
        </div>
        <div class="flex items-baseline justify-between">
          <span class="font-medium text-zinc-300">Abono</span>
          <span class="text-xl font-semibold text-accent">{{ formatCurrency(payment.amount) }}</span>
        </div>
        <template v-if="payment.balanceAfter !== undefined">
          <div v-if="payment.balanceAfter > 0" class="flex justify-between">
            <span class="text-zinc-400">Saldo pendiente</span>
            <span class="font-medium text-warning">{{ formatCurrency(payment.balanceAfter) }}</span>
          </div>
          <p v-else class="text-right font-medium text-success">Saldo cancelado</p>
          <p v-if="payment.balanceAfter > 0 && payment.nextDueDate" class="text-right text-xs text-zinc-500">
            Próximo pago: {{ formatDate(payment.nextDueDate) }}
          </p>
        </template>
      </div>
    </div>
  </OperationCompletedModal>
</template>
