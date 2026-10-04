<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'
import type { Sale, SaleReturn, SaleReturnItem, RefundMethod } from '@/types'
import AppModal from '@/components/common/AppModal.vue'
import ReturnCompletedModal from './ReturnCompletedModal.vue'
import { useSalesStore } from '@/stores/sales'
import { useAppStore } from '@/stores/app'
import { formatCurrency } from '@/utils/format'

interface ReturnRow {
  productId: string
  productName: string
  unitPrice: number
  soldQty: number
  alreadyReturned: number
  maxReturnable: number
  returnQty: number
  restock: boolean
}

const props = defineProps<{
  sale: Sale | null
}>()

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  saved: [sale: Sale]
}>()

const salesStore = useSalesStore()
const appStore = useAppStore()

// Devolución recién registrada: alimenta la pantalla con Imprimir nota.
const completedSale = ref<Sale | null>(null)
const completedReturn = ref<SaleReturn | null>(null)
const showCompleted = ref(false)

const REASONS = ['Defectuoso', 'Producto equivocado', 'No cumplió expectativas', 'Garantía', 'Otro']
const refundMethods: { value: RefundMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
]

const rows = ref<ReturnRow[]>([])
const refundAmount = ref(0)
const refundManual = ref(false)
const refundMethod = ref<RefundMethod>('efectivo')
const reason = ref('')
const notes = ref('')
const saving = ref(false)

const subtotal = computed(
  () => props.sale?.subtotal ?? props.sale?.items.reduce((s, i) => s + i.subtotal, 0) ?? 0,
)
// El descuento es global: se prorratea sobre el precio de lista de cada ítem.
const discountFraction = computed(() => {
  const disc = props.sale?.discountAmount ?? 0
  return subtotal.value > 0 ? disc / subtotal.value : 0
})
function effectivePerUnit(unitPrice: number): number {
  return Math.round(unitPrice * (1 - discountFraction.value) * 100) / 100
}

const suggestedTotal = computed(() =>
  rows.value.reduce((sum, r) => sum + effectivePerUnit(r.unitPrice) * r.returnQty, 0),
)
const hasSelection = computed(() => rows.value.some((r) => r.returnQty > 0))
const nothingReturnable = computed(() => rows.value.every((r) => r.maxReturnable <= 0))

const isCredit = computed(() => props.sale?.paymentMethod === 'credito')
const creditBalance = computed(() => props.sale?.creditBalance ?? 0)
const balanceApplied = computed(() =>
  isCredit.value ? Math.min(refundAmount.value || 0, creditBalance.value) : 0,
)
const cashRefund = computed(() => Math.max((refundAmount.value || 0) - balanceApplied.value, 0))
const adjustment = computed(
  () => Math.round((suggestedTotal.value - (refundAmount.value || 0)) * 100) / 100,
)

watch(
  () => [open.value, props.sale] as const,
  ([isOpen, sale]) => {
    if (!isOpen || !sale) return
    rows.value = sale.items.map((it) => {
      const already = salesStore.returnedQty(sale, it.productId)
      return {
        productId: it.productId,
        productName: it.productName,
        unitPrice: it.unitPrice,
        soldQty: it.quantity,
        alreadyReturned: already,
        maxReturnable: it.quantity - already,
        returnQty: 0,
        restock: true,
      }
    })
    refundManual.value = false
    refundAmount.value = 0
    refundMethod.value = 'efectivo'
    reason.value = ''
    notes.value = ''
  },
  { immediate: true },
)

// Mientras no se edite manualmente, el reembolso sigue al sugerido.
watch(suggestedTotal, (val) => {
  if (!refundManual.value) refundAmount.value = val
})

function updateReturnQty(row: ReturnRow, delta: number) {
  row.returnQty = Math.min(Math.max(row.returnQty + delta, 0), row.maxReturnable)
}

function onRefundInput(event: Event) {
  refundManual.value = true
  const raw = Number((event.target as HTMLInputElement).value)
  refundAmount.value = Number.isNaN(raw) ? 0 : Math.max(raw, 0)
}

function resetRefund() {
  refundManual.value = false
  refundAmount.value = suggestedTotal.value
}

async function confirm() {
  if (!props.sale) return
  if (!hasSelection.value) {
    appStore.showToast('Selecciona al menos un producto a devolver', 'error')
    return
  }
  if (!reason.value) {
    appStore.showToast('Indica el motivo de la devolución', 'error')
    return
  }
  saving.value = true
  try {
    const items: SaleReturnItem[] = rows.value
      .filter((r) => r.returnQty > 0)
      .map((r) => ({
        productId: r.productId,
        productName: r.productName,
        quantity: r.returnQty,
        refundPerUnit: effectivePerUnit(r.unitPrice),
        restocked: r.restock,
      }))
    const updated = await salesStore.registerReturn(props.sale.id, {
      items,
      refundAmount: refundAmount.value || 0,
      refundMethod: refundMethod.value,
      reason: reason.value,
      notes: notes.value || undefined,
    })
    emit('saved', updated)
    open.value = false
    completedSale.value = updated
    completedReturn.value = updated.returns?.at(-1) ?? null
    showCompleted.value = true
  } catch (e) {
    appStore.showToast(e instanceof Error ? e.message : 'Error al registrar la devolución', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal v-model="open" title="Registrar devolución" size="lg">
    <div v-if="sale" class="space-y-5">
      <p v-if="nothingReturnable" class="rounded-lg bg-surface-overlay px-4 py-3 text-sm text-zinc-400">
        Todos los productos de esta venta ya fueron devueltos.
      </p>

      <!-- Productos a devolver -->
      <div v-else>
        <label class="mb-1.5 block text-sm text-zinc-400">Productos a devolver</label>
        <div class="space-y-2">
          <div
            v-for="row in rows"
            :key="row.productId"
            class="rounded-lg border border-border bg-surface-overlay p-3"
            :class="{ 'opacity-50': row.maxReturnable <= 0 }"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm text-zinc-100">{{ row.productName }}</p>
                <p class="text-xs text-zinc-500">
                  Vendidos: {{ row.soldQty }} · {{ formatCurrency(effectivePerUnit(row.unitPrice)) }} c/u
                  <template v-if="row.alreadyReturned > 0"> · Ya devueltos: {{ row.alreadyReturned }}</template>
                </p>
              </div>
              <span class="shrink-0 text-sm font-medium text-zinc-200">
                {{ formatCurrency(effectivePerUnit(row.unitPrice) * row.returnQty) }}
              </span>
            </div>
            <div class="mt-2 flex items-center justify-between gap-3">
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="rounded p-1 text-zinc-400 hover:bg-surface-raised hover:text-zinc-100 disabled:opacity-40"
                  :disabled="row.returnQty <= 0"
                  @click="updateReturnQty(row, -1)"
                >
                  <Minus :size="14" />
                </button>
                <span class="w-8 text-center text-sm">{{ row.returnQty }}</span>
                <button
                  type="button"
                  class="rounded p-1 text-zinc-400 hover:bg-surface-raised hover:text-zinc-100 disabled:opacity-40"
                  :disabled="row.returnQty >= row.maxReturnable"
                  @click="updateReturnQty(row, 1)"
                >
                  <Plus :size="14" />
                </button>
                <span class="ml-1 text-xs text-zinc-500">/ {{ row.maxReturnable }}</span>
              </div>
              <label
                class="flex items-center gap-2 text-xs"
                :class="row.returnQty > 0 ? 'text-zinc-300' : 'text-zinc-600'"
              >
                <input v-model="row.restock" type="checkbox" :disabled="row.returnQty <= 0" />
                Reingresar al stock
              </label>
            </div>
          </div>
        </div>
      </div>

      <template v-if="!nothingReturnable">
        <!-- Motivo -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-sm text-zinc-400">Motivo *</label>
            <select v-model="reason" class="input-field">
              <option value="" disabled>Selecciona…</option>
              <option v-for="r in REASONS" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm text-zinc-400">Notas</label>
            <input v-model="notes" class="input-field" placeholder="Opcional" />
          </div>
        </div>

        <!-- Reembolso -->
        <div class="space-y-3 rounded-lg border border-border bg-surface-overlay/40 p-4">
          <div class="flex items-end justify-between gap-3">
            <div class="flex-1">
              <label class="mb-1 block text-sm text-zinc-400">Monto a reembolsar</label>
              <div class="relative">
                <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                <input
                  :value="refundAmount || ''"
                  type="number"
                  min="0"
                  inputmode="numeric"
                  placeholder="0"
                  class="no-spinner w-full rounded-lg border border-border bg-surface-raised py-2 pl-7 pr-3 text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  @input="onRefundInput"
                />
              </div>
            </div>
            <button
              type="button"
              class="rounded-lg border border-border px-3 py-2 text-xs text-accent transition hover:border-accent hover:bg-accent/10"
              @click="resetRefund"
            >
              Usar sugerido
            </button>
          </div>
          <p class="text-xs text-zinc-500">
            Sugerido: {{ formatCurrency(suggestedTotal) }}
            <template v-if="Math.abs(adjustment) >= 0.01">
              · Cargo/ajuste: {{ formatCurrency(adjustment) }}
            </template>
          </p>

          <!-- Método (para el reembolso en efectivo) -->
          <div>
            <label class="mb-1 block text-sm text-zinc-400">Método de reembolso</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="m in refundMethods"
                :key="m.value"
                type="button"
                class="rounded-lg border px-3 py-1.5 text-sm transition"
                :class="
                  refundMethod === m.value
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-zinc-400 hover:border-zinc-600'
                "
                @click="refundMethod = m.value"
              >
                {{ m.label }}
              </button>
            </div>
          </div>

          <!-- Desglose para crédito -->
          <div v-if="isCredit && (refundAmount || 0) > 0" class="space-y-1 border-t border-border pt-2 text-sm">
            <div class="flex justify-between">
              <span class="text-zinc-400">Aplicado al saldo pendiente</span>
              <span class="text-zinc-200">{{ formatCurrency(balanceApplied) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-zinc-400">Reembolso en efectivo</span>
              <span class="font-medium text-zinc-100">{{ formatCurrency(cashRefund) }}</span>
            </div>
          </div>
        </div>
      </template>
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
          class="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
          :disabled="saving || nothingReturnable || !hasSelection"
          @click="confirm"
        >
          {{ saving ? 'Guardando...' : 'Registrar devolución' }}
        </button>
      </div>
    </template>
  </AppModal>
  <ReturnCompletedModal
    v-model="showCompleted"
    :sale="completedSale"
    :sale-return="completedReturn"
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
