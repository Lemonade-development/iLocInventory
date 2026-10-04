<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Search, Plus, X, User } from 'lucide-vue-next'
import type { DeviceImeis, Sale, SaleItem, DiscountType, ContactFormData } from '@/types'
import AppModal from '@/components/common/AppModal.vue'
import ContactFormModal from '@/components/contacts/ContactFormModal.vue'
import { useSalesStore } from '@/stores/sales'
import { useContactsStore } from '@/stores/contacts'
import { useAppStore } from '@/stores/app'
import { formatCurrency } from '@/utils/format'
import AppleAccountFields from './AppleAccountFields.vue'
import {
  appleAccountDraftFrom,
  appleAccountError,
  toStoredAppleAccount,
  type AppleAccountDraft,
} from '@/utils/appleAccount'

interface EditItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  imeis?: DeviceImeis[]
}

const props = defineProps<{
  sale: Sale | null
}>()

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  saved: [sale: Sale]
}>()

const salesStore = useSalesStore()
const contactsStore = useContactsStore()
const appStore = useAppStore()

const items = ref<EditItem[]>([])
const discountType = ref<DiscountType>('fixed')
const discountValue = ref<number>(0)
const contactId = ref<string | null>(null)
const contactName = ref('')
const contactPhone = ref('')
const contactSearchQuery = ref('')
const showContactForm = ref(false)
const creditDownPayment = ref<number>(0)
const creditDueDate = ref<string>('')
const appleAccount = ref<AppleAccountDraft>(appleAccountDraftFrom())
const saving = ref(false)

const isCredit = computed(() => props.sale?.paymentMethod === 'credito')

watch(
  () => [open.value, props.sale] as const,
  ([isOpen, sale]) => {
    if (!isOpen || !sale) return
    items.value = sale.items.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      imeis: i.imeis,
    }))
    discountType.value = sale.discountType ?? 'fixed'
    discountValue.value = sale.discountValue ?? 0
    contactId.value = sale.contactId ?? null
    contactName.value = sale.customerName ?? ''
    contactPhone.value = sale.customerPhone ?? ''
    contactSearchQuery.value = ''
    creditDownPayment.value = sale.creditDownPayment ?? 0
    creditDueDate.value = sale.creditDueDate ?? ''
    appleAccount.value = appleAccountDraftFrom(sale.appleAccount)
  },
  { immediate: true },
)

const contactResults = computed(() => {
  if (!contactSearchQuery.value.trim()) return []
  return contactsStore.searchCustomers(contactSearchQuery.value)
})

const subtotal = computed(() =>
  items.value.reduce((sum, i) => sum + (i.unitPrice || 0) * i.quantity, 0),
)
const discountAmount = computed(() =>
  salesStore.computeDiscountAmount(subtotal.value, {
    type: discountType.value,
    value: discountValue.value || 0,
  }),
)
const total = computed(() => subtotal.value - discountAmount.value)

// Abonos ya registrados después de la venta (se conservan al reeditar).
const paidExtra = computed(() =>
  (props.sale?.creditPayments ?? []).reduce((sum, p) => sum + p.amount, 0),
)
const creditBalance = computed(() =>
  Math.max(total.value - (creditDownPayment.value || 0) - paidExtra.value, 0),
)

function selectContact(contact: { id: string; name: string; phone?: string }) {
  contactId.value = contact.id
  contactName.value = contact.name
  contactPhone.value = contact.phone ?? ''
  contactSearchQuery.value = ''
}

function clearContact() {
  contactId.value = null
  contactName.value = ''
  contactPhone.value = ''
}

async function handleCreateContact(data: ContactFormData) {
  try {
    const contact = await contactsStore.createContact(data)
    selectContact(contact)
    showContactForm.value = false
  } catch {
    appStore.showToast('Error al crear el contacto', 'error')
  }
}

function onItemPriceInput(item: EditItem, event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  item.unitPrice = Number.isNaN(raw) ? 0 : Math.max(raw, 0)
}

function setDiscountType(type: DiscountType) {
  if (discountType.value === type) return
  discountType.value = type
  discountValue.value = 0
}

function onDiscountInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  const max = discountType.value === 'percent' ? 100 : subtotal.value
  discountValue.value = Number.isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), max)
}

function onDownPaymentInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  creditDownPayment.value = Number.isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), total.value)
}

async function save() {
  if (!props.sale) return
  if (!contactId.value) {
    appStore.showToast('Selecciona un contacto', 'error')
    return
  }
  if (isCredit.value && !creditDueDate.value) {
    appStore.showToast('Indica la fecha del pago final', 'error')
    return
  }
  const accountError = appleAccountError(appleAccount.value)
  if (accountError) {
    appStore.showToast(accountError, 'error')
    return
  }
  saving.value = true
  try {
    const newItems: SaleItem[] = items.value.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice || 0,
      subtotal: (i.unitPrice || 0) * i.quantity,
      imeis: i.imeis,
    }))
    const patch: Partial<Sale> = {
      contactId: contactId.value,
      customerName: contactName.value || undefined,
      customerPhone: contactPhone.value || undefined,
      items: newItems,
      subtotal: subtotal.value,
      discountType: discountAmount.value > 0 ? discountType.value : undefined,
      discountValue: discountAmount.value > 0 ? discountValue.value : undefined,
      discountAmount: discountAmount.value > 0 ? discountAmount.value : undefined,
      total: total.value,
      appleAccount: toStoredAppleAccount(appleAccount.value),
    }
    if (isCredit.value) {
      patch.creditDownPayment = creditDownPayment.value || 0
      patch.creditBalance = creditBalance.value
      patch.creditPaid = creditBalance.value <= 0
      patch.creditDueDate = creditDueDate.value || undefined
    }
    const updated = await salesStore.updateSale(props.sale.id, patch)
    appStore.showToast('Venta actualizada', 'success')
    emit('saved', updated)
    open.value = false
  } catch (e) {
    appStore.showToast(e instanceof Error ? e.message : 'Error al actualizar', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal v-model="open" title="Editar venta" size="lg">
    <div v-if="sale" class="space-y-5">
      <!-- Contacto -->
      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <label class="text-sm text-zinc-400">Contacto *</label>
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-zinc-300 transition hover:border-accent hover:text-accent"
            @click="showContactForm = true"
          >
            <Plus :size="12" /> Nuevo
          </button>
        </div>
        <div
          v-if="contactId"
          class="flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/5 p-3"
        >
          <div class="flex min-w-0 items-center gap-2">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <User :size="15" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm text-zinc-100">{{ contactName }}</p>
              <p v-if="contactPhone" class="text-xs text-zinc-500">{{ contactPhone }}</p>
            </div>
          </div>
          <button type="button" class="rounded p-1 text-zinc-500 hover:text-danger" @click="clearContact">
            <X :size="16" />
          </button>
        </div>
        <div v-else class="relative">
          <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            v-model="contactSearchQuery"
            type="search"
            placeholder="Buscar contacto por nombre o teléfono..."
            class="w-full rounded-lg border border-border bg-surface-overlay py-2 pl-10 pr-4 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div
            v-if="contactResults.length > 0"
            class="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl"
          >
            <button
              v-for="contact in contactResults"
              :key="contact.id"
              type="button"
              class="flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-surface-overlay"
              @click="selectContact(contact)"
            >
              <span class="text-sm text-zinc-100">{{ contact.name }}</span>
              <span v-if="contact.phone" class="text-xs text-zinc-500">{{ contact.phone }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Productos y precios -->
      <div>
        <label class="mb-1.5 block text-sm text-zinc-400">Productos y precios</label>
        <div class="space-y-2">
          <div
            v-for="item in items"
            :key="item.productId"
            class="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-overlay p-3"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-zinc-100">{{ item.productName }}</p>
              <p class="text-xs text-zinc-500">Cantidad: {{ item.quantity }}</p>
            </div>
            <div class="relative w-32">
              <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">$</span>
              <input
                :value="item.unitPrice || ''"
                type="number"
                min="0"
                inputmode="numeric"
                placeholder="Precio c/u"
                class="no-spinner w-full rounded-lg border border-border bg-surface-raised py-1.5 pl-6 pr-3 text-right text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                @input="onItemPriceInput(item, $event)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Descuento -->
      <div class="flex items-center justify-between gap-3">
        <label class="text-sm text-zinc-400">Descuento</label>
        <div class="flex items-center gap-2">
          <div class="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              class="px-3 py-1 text-xs font-medium transition"
              :class="discountType === 'fixed' ? 'bg-accent text-white' : 'text-zinc-400 hover:bg-surface-overlay'"
              @click="setDiscountType('fixed')"
            >
              $
            </button>
            <button
              type="button"
              class="px-3 py-1 text-xs font-medium transition"
              :class="discountType === 'percent' ? 'bg-accent text-white' : 'text-zinc-400 hover:bg-surface-overlay'"
              @click="setDiscountType('percent')"
            >
              %
            </button>
          </div>
          <div class="relative w-28">
            <input
              :value="discountValue || ''"
              type="number"
              min="0"
              :max="discountType === 'percent' ? 100 : subtotal"
              inputmode="numeric"
              placeholder="0"
              class="no-spinner w-full rounded-lg border border-border bg-surface-overlay py-1.5 pl-3 pr-7 text-right text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              @input="onDiscountInput"
            />
            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
              {{ discountType === 'percent' ? '%' : '$' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Crédito -->
      <div v-if="isCredit" class="grid grid-cols-2 gap-4 rounded-lg border border-border bg-surface-overlay/40 p-4">
        <div>
          <label class="mb-1 block text-sm text-zinc-400">Abono inicial</label>
          <div class="relative">
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
            <input
              :value="creditDownPayment || ''"
              type="number"
              min="0"
              :max="total"
              inputmode="numeric"
              placeholder="0"
              class="no-spinner w-full rounded-lg border border-border bg-surface-raised py-2 pl-7 pr-3 text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              @input="onDownPaymentInput"
            />
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm text-zinc-400">Fecha de pago final *</label>
          <input v-model="creditDueDate" type="date" class="input-field" />
        </div>
      </div>

      <AppleAccountFields :account="appleAccount" />

      <!-- Resumen -->
      <div class="space-y-2 border-t border-border pt-4 text-sm">
        <div class="flex justify-between">
          <span class="text-zinc-400">Subtotal</span>
          <span class="text-zinc-300">{{ formatCurrency(subtotal) }}</span>
        </div>
        <div v-if="discountAmount > 0" class="flex justify-between">
          <span class="text-zinc-400">Descuento</span>
          <span class="text-success">−{{ formatCurrency(discountAmount) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="font-medium text-zinc-200">Total</span>
          <span class="text-lg font-semibold text-zinc-100">{{ formatCurrency(total) }}</span>
        </div>
        <div v-if="isCredit" class="flex justify-between">
          <span class="text-zinc-400">Saldo pendiente</span>
          <span class="font-medium" :class="creditBalance > 0 ? 'text-warning' : 'text-success'">
            {{ formatCurrency(creditBalance) }}
          </span>
        </div>
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
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? 'Guardando...' : 'Guardar cambios' }}
        </button>
      </div>
    </template>

    <ContactFormModal v-model="showContactForm" lock-customer @save="handleCreateContact" />
  </AppModal>
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
