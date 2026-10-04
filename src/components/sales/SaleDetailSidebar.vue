<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { X, User, Phone, Calendar, StickyNote, Pencil, KeyRound, Wallet, RotateCcw } from 'lucide-vue-next'
import type { Sale } from '@/types'
import { formatCurrency, formatDate, formatDateTime, formatSaleDate } from '@/utils/format'
import { imeiDisplayLines } from '@/utils/imei'
import { saleNoteProductName } from '@/utils/product'
import {
  downloadCreditPaymentReceipt,
  downloadReturnReceipt,
  downloadSaleReceipt,
  printCreditPaymentReceipt,
  printReturnReceipt,
  printSaleReceipt,
} from '@/services/pdfDownload'
import DocumentActions from '@/components/common/DocumentActions.vue'
import AppleAccountSummary from './AppleAccountSummary.vue'
import UsdEquivalent from '@/components/common/UsdEquivalent.vue'

const props = defineProps<{
  sale: Sale | null
}>()

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  edit: [sale: Sale]
  pay: [sale: Sale]
  return: [sale: Sale]
}>()

function returnedQty(productId: string): number {
  return (props.sale?.returns ?? []).reduce(
    (sum, r) =>
      sum + r.items.filter((i) => i.productId === productId).reduce((s, i) => s + i.quantity, 0),
    0,
  )
}
const returnable = computed(
  () => !!props.sale && props.sale.items.some((it) => returnedQty(it.productId) < it.quantity),
)

const paymentLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  canje: 'Equipo a cuenta',
  credito: 'Crédito',
  otro: 'Otro',
}

const subtotal = computed(
  () =>
    props.sale?.subtotal ?? props.sale?.items.reduce((sum, i) => sum + i.subtotal, 0) ?? 0,
)

const isCredit = computed(() => props.sale?.paymentMethod === 'credito')
const isTradeIn = computed(() => (props.sale?.tradeInValue ?? 0) > 0)

const pendingBalance = computed(() => {
  if (!props.sale || !isCredit.value || props.sale.creditPaid) return 0
  return props.sale.creditBalance ?? 0
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) open.value = false
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open && sale" class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-black/60" @click="open = false" />

        <aside
          class="relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface-raised shadow-2xl"
        >
          <!-- Header -->
          <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Venta #{{ sale.id.slice(0, 8).toUpperCase() }}
                </p>
                <span
                  v-if="sale.importKey"
                  class="rounded bg-surface-overlay px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
                  title="Venta importada desde la planilla histórica"
                >
                  Importada
                </span>
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  :class="
                    pendingBalance > 0
                      ? 'bg-warning/15 text-warning'
                      : 'bg-surface-overlay text-zinc-400'
                  "
                >
                  {{ paymentLabels[sale.paymentMethod] ?? sale.paymentMethod }}
                </span>
                <span
                  v-if="pendingBalance > 0"
                  class="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
                >
                  Pendiente
                </span>
                <span
                  v-if="sale.returnStatus"
                  class="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-danger"
                >
                  {{ sale.returnStatus === 'full' ? 'Devuelta' : 'Devuelta parcial' }}
                </span>
              </div>
              <p class="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
                <Calendar :size="13" />
                {{ formatSaleDate(sale) }}
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
            <!-- Cliente -->
            <section class="border-b border-border px-6 py-5">
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Cliente
              </h3>
              <p class="flex items-center gap-2 text-sm text-zinc-100">
                <User :size="14" class="text-zinc-500" />
                {{ sale.customerName || 'Sin cliente' }}
              </p>
              <p v-if="sale.customerPhone" class="mt-1.5 flex items-center gap-2 text-sm text-zinc-400">
                <Phone :size="14" class="text-zinc-500" />
                {{ sale.customerPhone }}
              </p>
            </section>

            <!-- Productos -->
            <section class="border-b border-border px-6 py-5">
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Productos ({{ sale.items.length }})
              </h3>
              <div class="space-y-3">
                <div v-for="item in sale.items" :key="item.productId" class="flex justify-between gap-3 text-sm">
                  <div class="min-w-0">
                    <p class="text-zinc-100">{{ saleNoteProductName(item.productName) }}</p>
                    <p class="text-xs text-zinc-500">
                      {{ item.quantity }} × {{ formatCurrency(item.unitPrice) }}
                    </p>
                    <p
                      v-for="line in imeiDisplayLines(item.imeis)"
                      :key="line"
                      class="font-mono text-xs text-zinc-400"
                    >
                      {{ line }}
                    </p>
                  </div>
                  <span class="shrink-0 font-medium text-zinc-200">{{ formatCurrency(item.subtotal) }}</span>
                </div>
              </div>
            </section>

            <!-- Equipos recibidos a cuenta -->
            <section v-if="isTradeIn && sale.tradeInItems?.length" class="border-b border-border px-6 py-5">
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Equipos recibidos a cuenta
              </h3>
              <div class="space-y-2">
                <div v-for="t in sale.tradeInItems" :key="t.productId" class="flex justify-between gap-3 text-sm">
                  <div class="min-w-0">
                    <p class="text-zinc-100">{{ saleNoteProductName(t.productName) }}</p>
                    <p class="text-xs text-zinc-500">
                      {{ t.quantity }} × {{ formatCurrency(t.unitValue) }}
                    </p>
                    <p
                      v-for="line in imeiDisplayLines(t.imeis)"
                      :key="line"
                      class="font-mono text-xs text-zinc-400"
                    >
                      {{ line }}
                    </p>
                  </div>
                  <span class="shrink-0 font-medium text-success">−{{ formatCurrency(t.unitValue * t.quantity) }}</span>
                </div>
              </div>
            </section>

            <!-- Totales -->
            <section class="border-b border-border px-6 py-5">
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Totales
              </h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-zinc-400">Subtotal</span>
                  <span class="text-zinc-300">{{ formatCurrency(subtotal) }}</span>
                </div>
                <div v-if="(sale.discountAmount ?? 0) > 0" class="flex justify-between">
                  <span class="text-zinc-400">
                    Descuento<template v-if="sale.discountType === 'percent'"> ({{ sale.discountValue }}%)</template>
                  </span>
                  <span class="text-success">−{{ formatCurrency(sale.discountAmount ?? 0) }}</span>
                </div>
                <div v-if="isTradeIn" class="flex justify-between">
                  <span class="text-zinc-400">Equipo a cuenta</span>
                  <span class="text-success">−{{ formatCurrency(Math.min(sale.tradeInValue ?? 0, sale.total)) }}</span>
                </div>
                <div class="flex items-baseline justify-between border-t border-border pt-2">
                  <span class="font-medium text-zinc-200">Total</span>
                  <span class="text-right">
                    <span class="text-lg font-semibold text-zinc-100">{{ formatCurrency(sale.total) }}</span>
                    <UsdEquivalent :bs="sale.total" :rate="sale.exchangeRate" class="block" />
                  </span>
                </div>

                <!-- Saldo por canje -->
                <div v-if="isTradeIn" class="flex justify-between">
                  <span class="text-zinc-400">Pagado (efectivo)</span>
                  <span class="text-zinc-300">
                    {{ formatCurrency(Math.max(sale.total - (sale.tradeInValue ?? 0), 0)) }}
                  </span>
                </div>
              </div>
            </section>

            <!-- Crédito -->
            <section v-if="isCredit" class="border-b border-border px-6 py-5">
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Crédito
              </h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-zinc-400">Abono inicial</span>
                  <span class="text-zinc-200">{{ formatCurrency(sale.creditDownPayment ?? 0) }}</span>
                </div>
                <div class="flex items-center justify-between rounded-lg bg-surface-overlay px-3 py-2">
                  <span class="text-zinc-300">Saldo pendiente</span>
                  <span
                    class="text-base font-semibold"
                    :class="pendingBalance > 0 ? 'text-warning' : 'text-success'"
                  >
                    {{ formatCurrency(sale.creditBalance ?? 0) }}
                  </span>
                </div>
                <div v-if="sale.creditDueDate" class="flex items-center justify-between">
                  <span class="text-zinc-400">Fecha de pago final</span>
                  <span class="text-zinc-200">{{ formatDate(sale.creditDueDate) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-zinc-400">Estado</span>
                  <span :class="sale.creditPaid ? 'text-success' : 'text-warning'">
                    {{ sale.creditPaid ? 'Liquidado' : 'Pendiente' }}
                  </span>
                </div>
                <div v-if="sale.creditPayments?.length" class="border-t border-border pt-2">
                  <p class="mb-1 text-xs text-zinc-500">Abonos registrados</p>
                  <div
                    v-for="(p, idx) in sale.creditPayments"
                    :key="idx"
                    class="flex items-center justify-between gap-2 text-xs text-zinc-400"
                  >
                    <span>{{ formatDate(p.date) }}</span>
                    <span class="ml-auto text-zinc-300">{{ formatCurrency(p.amount) }}</span>
                    <DocumentActions
                      compact
                      document-name="comprobante de abono"
                      @print="printCreditPaymentReceipt(sale, idx)"
                      @download="downloadCreditPaymentReceipt(sale, idx)"
                    />
                  </div>
                </div>
              </div>
            </section>

            <!-- Devoluciones -->
            <section v-if="sale.returns?.length" class="border-b border-border px-6 py-5">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Devoluciones
                </h3>
                <span class="text-xs text-danger">−{{ formatCurrency(sale.refundedTotal ?? 0) }}</span>
              </div>
              <div class="space-y-3">
                <div
                  v-for="ret in sale.returns"
                  :key="ret.id"
                  class="rounded-lg border border-border bg-surface-overlay/50 p-3"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-zinc-400">{{ formatDateTime(ret.date) }}</span>
                    <DocumentActions
                      compact
                      document-name="nota de devolución"
                      @print="printReturnReceipt(sale, ret)"
                      @download="downloadReturnReceipt(sale, ret)"
                    />
                  </div>
                  <div v-for="it in ret.items" :key="it.productId" class="mt-1 flex justify-between text-sm">
                    <span class="min-w-0 truncate text-zinc-300">
                      {{ saleNoteProductName(it.productName) }} × {{ it.quantity }}
                      <span v-if="!it.restocked" class="text-danger">· sin reingresar</span>
                    </span>
                    <span class="shrink-0 text-zinc-400">{{ formatCurrency(it.refundPerUnit * it.quantity) }}</span>
                  </div>
                  <div class="mt-1.5 flex items-center justify-between border-t border-border pt-1.5 text-xs">
                    <span class="text-zinc-500">{{ ret.reason }} · {{ ret.refundMethod }}</span>
                    <span class="font-medium text-danger">−{{ formatCurrency(ret.refundAmount) }}</span>
                  </div>
                  <p v-if="ret.balanceApplied > 0" class="mt-1 text-xs text-zinc-500">
                    Aplicado al saldo: {{ formatCurrency(ret.balanceApplied) }}
                  </p>
                </div>
              </div>
            </section>

            <!-- Cuenta Apple -->
            <section v-if="sale.appleAccount" class="border-b border-border px-6 py-5">
              <h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <KeyRound :size="13" />
                Cuenta Apple
              </h3>
              <AppleAccountSummary :key="sale.id" :account="sale.appleAccount" />
            </section>

            <!-- Notas -->
            <section v-if="sale.notes" class="border-b border-border px-6 py-5">
              <h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <StickyNote :size="13" />
                Notas
              </h3>
              <p class="whitespace-pre-line text-sm text-zinc-300">{{ sale.notes }}</p>
            </section>
          </div>

          <!-- Footer -->
          <div class="space-y-2 border-t border-border px-6 py-4">
            <button
              v-if="pendingBalance > 0"
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-lg bg-success px-3 py-2 text-sm font-medium text-white transition hover:bg-green-600"
              @click="emit('pay', sale)"
            >
              <Wallet :size="15" /> Registrar pago del saldo
            </button>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-zinc-200 transition hover:border-accent hover:text-accent"
                @click="emit('edit', sale)"
              >
                <Pencil :size="15" /> Editar
              </button>
              <button
                v-if="returnable"
                type="button"
                class="flex flex-1 items-center justify-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger transition hover:bg-danger/10"
                @click="emit('return', sale)"
              >
                <RotateCcw :size="15" /> Devolución
              </button>
              <DocumentActions
                document-name="ticket"
                @print="printSaleReceipt(sale)"
                @download="downloadSaleReceipt(sale)"
              />
            </div>
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
