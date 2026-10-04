<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Sale } from '@/types'
import AppModal from '@/components/common/AppModal.vue'
import CreditPaymentCompletedModal from './CreditPaymentCompletedModal.vue'
import { useSalesStore } from '@/stores/sales'
import { useAppStore } from '@/stores/app'
import { formatCurrency, todayIsoDate } from '@/utils/format'

const props = defineProps<{
  sale: Sale | null
}>()

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  saved: [sale: Sale]
}>()

const salesStore = useSalesStore()
const appStore = useAppStore()

const amount = ref<number>(0)
const nextDueDate = ref<string>('')
const saving = ref(false)
const today = todayIsoDate()

// Abono recién registrado: alimenta la pantalla con Imprimir comprobante.
const completedSale = ref<Sale | null>(null)
const completedIndex = ref<number | null>(null)
const showCompleted = ref(false)

const balance = computed(() => props.sale?.creditBalance ?? 0)
const remaining = computed(() => Math.max(balance.value - (amount.value || 0), 0))
// Pago parcial: queda saldo por cobrar, por lo que se pide una nueva fecha.
const isPartial = computed(() => (amount.value || 0) > 0 && remaining.value > 0)

watch(
  () => [open.value, props.sale] as const,
  ([isOpen, sale]) => {
    if (isOpen && sale) {
      amount.value = 0
      nextDueDate.value = sale.creditDueDate ?? ''
    }
  },
  { immediate: true },
)

function onAmountInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  amount.value = Number.isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), balance.value)
}

async function confirm() {
  if (!props.sale) return
  if ((amount.value || 0) <= 0) {
    appStore.showToast('Ingresa un monto a pagar', 'error')
    return
  }
  if (isPartial.value && !nextDueDate.value) {
    appStore.showToast('Indica la nueva fecha de pago', 'error')
    return
  }
  saving.value = true
  try {
    const updated = await salesStore.registerCreditPayment(
      props.sale.id,
      amount.value,
      isPartial.value ? nextDueDate.value : undefined,
    )
    emit('saved', updated)
    open.value = false
    completedSale.value = updated
    completedIndex.value = (updated.creditPayments?.length ?? 1) - 1
    showCompleted.value = true
  } catch (e) {
    appStore.showToast(e instanceof Error ? e.message : 'Error al registrar el pago', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal v-model="open" title="Registrar pago del saldo" size="sm">
    <div v-if="sale" class="space-y-4">
      <div class="flex items-center justify-between rounded-lg bg-surface-overlay px-3 py-2 text-sm">
        <span class="text-zinc-400">Saldo pendiente</span>
        <span class="font-semibold text-warning">{{ formatCurrency(balance) }}</span>
      </div>

      <div>
        <label class="mb-1 block text-sm text-zinc-400">Monto a pagar</label>
        <div class="flex items-stretch gap-2">
          <div class="relative flex-1">
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
            <input
              :value="amount || ''"
              type="number"
              min="0"
              :max="balance"
              inputmode="numeric"
              placeholder="0"
              class="no-spinner w-full rounded-lg border border-border bg-surface-overlay py-2 pl-7 pr-3 text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              @input="onAmountInput"
            />
          </div>
          <button
            type="button"
            class="shrink-0 rounded-lg border border-border px-3 text-xs font-medium text-accent transition hover:border-accent hover:bg-accent/10"
            @click="amount = balance"
          >
            Pagar todo el saldo
          </button>
        </div>
      </div>

      <!-- Nueva fecha si el pago es parcial -->
      <div v-if="isPartial">
        <label class="mb-1 block text-sm text-zinc-400">Nueva fecha de pago *</label>
        <input v-model="nextDueDate" type="date" :min="today" class="input-field" />
      </div>

      <div class="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span class="text-zinc-400">Saldo restante</span>
        <span class="font-medium" :class="remaining <= 0 ? 'text-success' : 'text-warning'">
          {{ formatCurrency(remaining) }}
        </span>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-surface-overlay"
          @click="open = false"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
          :disabled="saving"
          @click="confirm"
        >
          {{ saving ? 'Guardando...' : 'Registrar pago' }}
        </button>
      </div>
    </template>
  </AppModal>
  <CreditPaymentCompletedModal
    v-model="showCompleted"
    :sale="completedSale"
    :payment-index="completedIndex"
  />
</template>

<style scoped>
.no-spinner {
  -moz-appearance: textfield;
  appearance: textfield;
}
.no-spinner::-webkit-outer-spin-button,
.no-spinner::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
