<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Plus, Minus, Trash2, ShoppingBag, User, X, ShoppingCart } from 'lucide-vue-next'
import type { ContactFormData, DiscountType, PaymentMethod, Product, ProductFormData, Sale } from '@/types'
import type { CartItem, Discount, TradeInEntry } from '@/composables/useSales'
import { useProductsStore } from '@/stores/products'
import { useSalesStore } from '@/stores/sales'
import { useContactsStore } from '@/stores/contacts'
import { useAppStore } from '@/stores/app'
import { formatCurrency, formatDate, todayIsoDate } from '@/utils/format'
import UsdEquivalent from '@/components/common/UsdEquivalent.vue'
import ProductFormModal from '@/components/inventory/ProductFormModal.vue'
import BatteryHealthBadge from '@/components/inventory/BatteryHealthBadge.vue'
import { acceptsBatteryHealth } from '@/utils/product'
import ImeiUnitFields from '@/components/sales/ImeiUnitFields.vue'
import AppleAccountFields from '@/components/sales/AppleAccountFields.vue'
import {
  appleAccountError,
  emptyAppleAccountDraft,
  type AppleAccountDraft,
} from '@/utils/appleAccount'
import {
  emptyImeiDraft,
  isIphoneDevice,
  isPhoneCategory,
  phoneImeiError,
  resizeImeiDrafts,
} from '@/utils/imei'
import ContactFormModal from '@/components/contacts/ContactFormModal.vue'
import SaleCompletedModal from '@/components/sales/SaleCompletedModal.vue'

const productsStore = useProductsStore()
const salesStore = useSalesStore()
const contactsStore = useContactsStore()
const appStore = useAppStore()
const route = useRoute()
const router = useRouter()

// Agrega al carrito el producto llegado desde el buscador global (?add=<id>).
async function addProductFromQuery(addId: unknown) {
  if (typeof addId !== 'string' || !addId) return
  if (productsStore.products.length === 0) await productsStore.loadProducts()
  const product = productsStore.getProductById(addId)
  if (product && product.stock > 0) {
    // Si venimos de una venta ya completada o en curso, arranca en el paso 1.
    step.value = 1
    addToCart(product)
  } else {
    appStore.showToast('El producto no está disponible', 'error')
  }
  router.replace({ query: {} })
}

onMounted(() => {
  contactsStore.loadContacts()
  if (salesStore.sales.length === 0) salesStore.loadSales()
  addProductFromQuery(route.query.add)
})

// Estando ya en la vista, reacciona cuando el buscador global agrega otro producto.
watch(
  () => route.query.add,
  (addId) => {
    if (addId) addProductFromQuery(addId)
  },
)

const emit = defineEmits<{
  completed: [saleId: string]
}>()

const step = ref(1)
const searchQuery = ref('')
const cart = ref<CartItem[]>([])
const customerName = ref('')
const customerPhone = ref('')
const paymentMethod = ref<PaymentMethod>('efectivo')
const notes = ref('')
const appleAccount = ref<AppleAccountDraft>(emptyAppleAccountDraft())
const processing = ref(false)

// Venta recién registrada: alimenta el modal informativo con opción de PDF.
const completedSale = ref<Sale | null>(null)
const showCompletedModal = ref(false)

// Contacto asociado a la venta (registro de compras por cliente).
const selectedContactId = ref<string | null>(null)
const contactSearchQuery = ref('')
const showContactForm = ref(false)

const contactResults = computed(() => {
  if (!contactSearchQuery.value.trim()) return []
  return contactsStore.searchCustomers(contactSearchQuery.value)
})

const selectedContact = computed(() =>
  selectedContactId.value ? contactsStore.getContactById(selectedContactId.value) : undefined,
)

// Historial de compras del contacto seleccionado, para decidir descuentos.
const contactStats = computed(() => {
  if (!selectedContactId.value) return null
  const past = salesStore.sales.filter((s) => s.contactId === selectedContactId.value)
  return {
    count: past.length,
    total: past.reduce((sum, s) => sum + s.total, 0),
  }
})

function selectContact(contact: { id: string; name: string; phone?: string }) {
  selectedContactId.value = contact.id
  customerName.value = contact.name
  customerPhone.value = contact.phone ?? ''
  contactSearchQuery.value = ''
}

function clearContact() {
  selectedContactId.value = null
  customerName.value = ''
  customerPhone.value = ''
}

async function handleCreateContact(data: ContactFormData) {
  try {
    const contact = await contactsStore.createContact(data)
    selectContact(contact)
    showContactForm.value = false
    appStore.showToast('Contacto agregado', 'success')
  } catch {
    appStore.showToast('Error al crear el contacto', 'error')
  }
}

const discountType = ref<DiscountType>('fixed')
const discountValue = ref<number>(0)

const tradeInEntries = ref<TradeInEntry[]>([])
const tradeInSearchQuery = ref('')
const showProductForm = ref(false)

// Venta a crédito (pagar después): abono inicial + saldo + fecha de pago final.
const creditDownPayment = ref<number>(0)
const creditDueDate = ref<string>('')
const today = todayIsoDate()

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return []
  return productsStore.searchProducts(searchQuery.value, { inStockOnly: true })
})

const subtotal = computed(() => salesStore.cartSubtotal(cart.value))
const discount = computed<Discount>(() => ({
  type: discountType.value,
  value: discountValue.value || 0,
}))
const discountAmount = computed(() =>
  salesStore.computeDiscountAmount(subtotal.value, discount.value),
)
const total = computed(() => subtotal.value - discountAmount.value)

// El porcentaje avanza de 1 en 1; el monto fijo de 50 en 50.
const discountStep = computed(() => (discountType.value === 'percent' ? 1 : 50))
const discountMax = computed(() => (discountType.value === 'percent' ? 100 : subtotal.value))

function setDiscountType(type: DiscountType) {
  if (discountType.value === type) return
  discountType.value = type
  discountValue.value = 0
}

function adjustDiscount(direction: number) {
  const next = (discountValue.value || 0) + direction * discountStep.value
  discountValue.value = Math.min(Math.max(next, 0), discountMax.value)
}

function onDiscountInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  discountValue.value = Number.isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), discountMax.value)
}

// Equipo a cuenta (canje): la suma de los equipos recibidos reduce el saldo a
// pagar, sin alterar el total real de la venta (los ingresos siguen correctos).
const tradeInSearchResults = computed(() => {
  if (!tradeInSearchQuery.value.trim()) return []
  return productsStore.searchProducts(tradeInSearchQuery.value)
})

const tradeInTotal = computed(() =>
  tradeInEntries.value.reduce((sum, t) => sum + (t.unitValue || 0) * t.quantity, 0),
)
const tradeInCredit = computed(() =>
  paymentMethod.value === 'canje' ? Math.min(tradeInTotal.value, total.value) : 0,
)
const amountDue = computed(() => total.value - tradeInCredit.value)

const creditBalance = computed(() =>
  paymentMethod.value === 'credito'
    ? Math.max(total.value - (creditDownPayment.value || 0), 0)
    : 0,
)

function onCreditDownPaymentInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  creditDownPayment.value = Number.isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), total.value)
}

function addTradeInProduct(product: Product, unitValue = 0) {
  const existing = tradeInEntries.value.find((t) => t.product.id === product.id)
  if (existing) {
    existing.quantity++
    if (isPhoneCategory(product.category)) {
      existing.imeis = resizeImeiDrafts(existing.imeis, existing.quantity, isIphoneDevice(product))
    }
  } else {
    tradeInEntries.value.push({
      product,
      quantity: 1,
      unitValue,
      imeis: isPhoneCategory(product.category) ? [emptyImeiDraft(isIphoneDevice(product))] : [],
    })
  }
  tradeInSearchQuery.value = ''
}

function updateTradeInQuantity(productId: string, delta: number) {
  const item = tradeInEntries.value.find((t) => t.product.id === productId)
  if (!item) return
  const next = item.quantity + delta
  if (next <= 0) {
    tradeInEntries.value = tradeInEntries.value.filter((t) => t.product.id !== productId)
  } else {
    item.quantity = next
    if (isPhoneCategory(item.product.category)) {
      item.imeis = resizeImeiDrafts(item.imeis, next, isIphoneDevice(item.product))
    }
  }
}

function onTradeInValueInput(item: TradeInEntry, event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  item.unitValue = Number.isNaN(raw) ? 0 : Math.max(raw, 0)
}

function removeTradeInItem(productId: string) {
  tradeInEntries.value = tradeInEntries.value.filter((t) => t.product.id !== productId)
}

// Crea el producto recibido (con stock 0) y lo agrega al canje; la cantidad
// recibida se suma al inventario al confirmar la venta.
async function handleCreateTradeInProduct(data: ProductFormData) {
  try {
    const receivedQty = Math.max(1, data.stock || 1)
    const product = await productsStore.createProduct({ ...data, stock: 0 })
    addTradeInProduct(product, data.cost || 0)
    const entry = tradeInEntries.value.find((t) => t.product.id === product.id)
    if (entry) {
      entry.quantity = receivedQty
      if (isPhoneCategory(product.category)) {
        entry.imeis = resizeImeiDrafts(entry.imeis, receivedQty, isIphoneDevice(product))
      }
    }
    showProductForm.value = false
    appStore.showToast('Producto creado y agregado al canje', 'success')
  } catch {
    appStore.showToast('Error al crear el producto', 'error')
  }
}

function addToCart(product: Product) {
  const existing = cart.value.find((item) => item.product.id === product.id)
  if (existing) {
    if (existing.quantity < product.stock) {
      existing.quantity++
      if (isPhoneCategory(product.category)) {
        existing.imeis = resizeImeiDrafts(existing.imeis, existing.quantity, isIphoneDevice(product))
      }
    }
  } else {
    cart.value.push({
      product,
      quantity: 1,
      imeis: isPhoneCategory(product.category) ? [emptyImeiDraft(isIphoneDevice(product))] : [],
    })
  }
  searchQuery.value = ''
}

function updateQuantity(productId: string, delta: number) {
  const item = cart.value.find((i) => i.product.id === productId)
  if (!item) return
  const newQty = item.quantity + delta
  if (newQty <= 0) {
    cart.value = cart.value.filter((i) => i.product.id !== productId)
  } else if (newQty <= item.product.stock) {
    item.quantity = newQty
    if (isPhoneCategory(item.product.category)) {
      item.imeis = resizeImeiDrafts(item.imeis, newQty, isIphoneDevice(item.product))
    }
  }
}

function ensureImeiSlots() {
  for (const item of cart.value) {
    if (isPhoneCategory(item.product.category)) {
      item.imeis = resizeImeiDrafts(item.imeis, item.quantity, isIphoneDevice(item.product))
    }
  }
  for (const item of tradeInEntries.value) {
    if (isPhoneCategory(item.product.category)) {
      item.imeis = resizeImeiDrafts(item.imeis, item.quantity, isIphoneDevice(item.product))
    }
  }
}

function validateSaleImeis(): string | null {
  ensureImeiSlots()
  return phoneImeiError([
    ...cart.value.map((item) => ({
      label: `${item.product.brand} ${item.product.model}`,
      category: item.product.category,
      quantity: item.quantity,
      imeis: item.imeis,
    })),
    ...(paymentMethod.value === 'canje'
      ? tradeInEntries.value.map((item) => ({
          label: `Permuta ${item.product.brand} ${item.product.model}`,
          category: item.product.category,
          quantity: item.quantity,
          imeis: item.imeis,
        }))
      : []),
  ])
}

function removeFromCart(productId: string) {
  cart.value = cart.value.filter((i) => i.product.id !== productId)
}

function goToStep2() {
  const validation = salesStore.validateCart(cart.value)
  if (!validation.valid) {
    appStore.showToast(validation.errors[0]!, 'error')
    return
  }
  ensureImeiSlots()
  step.value = 2
}

async function confirmSale() {
  if (!selectedContactId.value) {
    appStore.showToast('Selecciona un contacto para la venta', 'error')
    return
  }
  if (paymentMethod.value === 'credito' && !creditDueDate.value) {
    appStore.showToast('Indica la fecha del pago final', 'error')
    return
  }
  const imeiError = validateSaleImeis()
  if (imeiError) {
    appStore.showToast(imeiError, 'error')
    return
  }
  const accountError = appleAccountError(appleAccount.value)
  if (accountError) {
    appStore.showToast(accountError, 'error')
    return
  }
  processing.value = true
  try {
    const sale = await salesStore.createSale(
      cart.value,
      paymentMethod.value,
      customerName.value || undefined,
      customerPhone.value || undefined,
      notes.value || undefined,
      discount.value,
      paymentMethod.value === 'canje' ? tradeInEntries.value : null,
      selectedContactId.value ?? undefined,
      paymentMethod.value === 'credito'
        ? { downPayment: creditDownPayment.value || 0, dueDate: creditDueDate.value || undefined }
        : null,
      appleAccount.value,
    )
    await productsStore.loadProducts()
    appStore.showToast('Venta registrada correctamente', 'success')
    completedSale.value = sale
    showCompletedModal.value = true
    emit('completed', sale.id)
    reset()
  } catch (e) {
    appStore.showToast(e instanceof Error ? e.message : 'Error al registrar venta', 'error')
  } finally {
    processing.value = false
  }
}

function reset() {
  step.value = 1
  cart.value = []
  customerName.value = ''
  customerPhone.value = ''
  selectedContactId.value = null
  contactSearchQuery.value = ''
  paymentMethod.value = 'efectivo'
  notes.value = ''
  appleAccount.value = emptyAppleAccountDraft()
  discountType.value = 'fixed'
  discountValue.value = 0
  tradeInEntries.value = []
  tradeInSearchQuery.value = ''
  creditDownPayment.value = 0
  creditDueDate.value = ''
}

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'canje', label: 'Equipo a cuenta' },
  { value: 'credito', label: 'Crédito' },
  { value: 'otro', label: 'Otro' },
]
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <!-- Steps indicator -->
    <div class="mb-8 flex items-center justify-center gap-4">
      <div class="flex items-center gap-2">
        <span
          class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium"
          :class="step >= 1 ? 'bg-accent text-white' : 'bg-surface-overlay text-zinc-500'"
        >1</span>
        <span class="text-sm" :class="step >= 1 ? 'text-zinc-100' : 'text-zinc-500'">Productos</span>
      </div>
      <div class="h-px w-12 bg-border" />
      <div class="flex items-center gap-2">
        <span
          class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium"
          :class="step >= 2 ? 'bg-accent text-white' : 'bg-surface-overlay text-zinc-500'"
        >2</span>
        <span class="text-sm" :class="step >= 2 ? 'text-zinc-100' : 'text-zinc-500'">Confirmar</span>
      </div>
    </div>

    <!-- Step 1: Add products -->
    <div v-if="step === 1" class="space-y-6">
      <div class="relative">
        <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Buscar producto para agregar..."
          class="w-full rounded-lg border border-border bg-surface-raised py-3 pl-10 pr-4 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          autofocus
        />
        <div
          v-if="searchResults.length > 0"
          class="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl"
        >
          <button
            v-for="product in searchResults"
            :key="product.id"
            type="button"
            class="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-surface-overlay"
            @click="addToCart(product)"
          >
            <div>
              <p class="text-sm text-zinc-100">
                {{ product.brand }} {{ product.model }}
                <span v-if="product.variant" class="text-zinc-400"> — {{ product.variant }}</span>
              </p>
              <p class="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-zinc-500">
                <span>Stock: {{ product.stock }}</span>
                <BatteryHealthBadge
                  v-if="acceptsBatteryHealth(product)"
                  :health="product.batteryHealth"
                />
              </p>
            </div>
            <span class="text-sm font-medium text-accent">{{ formatCurrency(product.price) }}</span>
          </button>
        </div>
      </div>

      <!-- Cart -->
      <div class="rounded-xl border border-border bg-surface-raised">
        <div class="border-b border-border px-4 py-3">
          <h3 class="flex items-center gap-2 text-sm font-medium text-zinc-300">
            <ShoppingBag :size="16" />
            Carrito ({{ cart.length }} productos)
          </h3>
        </div>

        <div v-if="cart.length === 0" class="px-4 py-12 text-center text-sm text-zinc-500">
          Busca y agrega productos al carrito
        </div>

        <div v-else class="divide-y divide-border">
          <div
            v-for="item in cart"
            :key="item.product.id"
            class="flex items-center justify-between px-4 py-3"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-zinc-100">
                {{ item.product.brand }} {{ item.product.model }}
              </p>
              <p class="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-zinc-500">
                <span>{{ formatCurrency(item.product.price) }} c/u</span>
                <BatteryHealthBadge
                  v-if="acceptsBatteryHealth(item.product)"
                  :health="item.product.batteryHealth"
                />
              </p>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="rounded p-1 text-zinc-400 hover:bg-surface-overlay hover:text-zinc-100"
                  @click="updateQuantity(item.product.id, -1)"
                >
                  <Minus :size="14" />
                </button>
                <span class="w-8 text-center text-sm">{{ item.quantity }}</span>
                <button
                  type="button"
                  class="rounded p-1 text-zinc-400 hover:bg-surface-overlay hover:text-zinc-100"
                  :disabled="item.quantity >= item.product.stock"
                  @click="updateQuantity(item.product.id, 1)"
                >
                  <Plus :size="14" />
                </button>
              </div>
              <span class="w-24 text-right text-sm font-medium text-zinc-200">
                {{ formatCurrency(item.product.price * item.quantity) }}
                <UsdEquivalent :bs="item.product.price * item.quantity" class="block" />
              </span>
              <button
                type="button"
                class="rounded p-1 text-zinc-500 hover:text-danger"
                @click="removeFromCart(item.product.id)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="cart.length > 0" class="space-y-3 border-t border-border px-4 py-4">
          <!-- Descuento -->
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="text-sm text-zinc-400">Descuento</span>
              <div class="flex overflow-hidden rounded-lg border border-border">
                <button
                  type="button"
                  class="px-3 py-1 text-xs font-medium transition"
                  :class="
                    discountType === 'fixed'
                      ? 'bg-accent text-white'
                      : 'text-zinc-400 hover:bg-surface-overlay'
                  "
                  @click="setDiscountType('fixed')"
                >
                  $
                </button>
                <button
                  type="button"
                  class="px-3 py-1 text-xs font-medium transition"
                  :class="
                    discountType === 'percent'
                      ? 'bg-accent text-white'
                      : 'text-zinc-400 hover:bg-surface-overlay'
                  "
                  @click="setDiscountType('percent')"
                >
                  %
                </button>
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-zinc-300 transition hover:border-accent hover:bg-accent/10 hover:text-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-transparent disabled:hover:text-zinc-300"
                :disabled="discountValue <= 0"
                aria-label="Disminuir descuento"
                @click="adjustDiscount(-1)"
              >
                <Minus :size="14" />
              </button>

              <div class="relative w-24">
                <input
                  :value="discountValue || ''"
                  type="number"
                  min="0"
                  :max="discountMax"
                  inputmode="numeric"
                  class="no-spinner w-full rounded-lg border border-border bg-surface-raised py-1.5 pl-3 pr-7 text-right text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  @input="onDiscountInput"
                />
                <span
                  class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500"
                >
                  {{ discountType === 'percent' ? '%' : '$' }}
                </span>
              </div>

              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent transition hover:border-accent hover:bg-accent/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent/10"
                :disabled="discountValue >= discountMax"
                aria-label="Aumentar descuento"
                @click="adjustDiscount(1)"
              >
                <Plus :size="14" />
              </button>
            </div>
          </div>

          <!-- Subtotal -->
          <div class="flex items-center justify-between text-sm">
            <span class="text-zinc-400">Subtotal</span>
            <span class="text-zinc-300">{{ formatCurrency(subtotal) }}</span>
          </div>

          <!-- Monto descontado -->
          <div v-if="discountAmount > 0" class="flex items-center justify-between text-sm">
            <span class="text-zinc-400">
              Descuento<template v-if="discountType === 'percent'"> ({{ discountValue }}%)</template>
            </span>
            <span class="text-success">−{{ formatCurrency(discountAmount) }}</span>
          </div>

          <!-- Total -->
          <div class="flex items-center justify-between border-t border-border pt-3">
            <span class="text-sm text-zinc-400">Total</span>
            <span class="text-right text-xl font-semibold text-zinc-100">
              {{ formatCurrency(total) }}
              <UsdEquivalent :bs="total" class="block" />
            </span>
          </div>
        </div>
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          :disabled="cart.length === 0"
          @click="goToStep2"
        >
          Continuar
        </button>
      </div>
    </div>

    <!-- Step 2: Confirm -->
    <div v-else class="space-y-6">
      <div class="rounded-xl border border-border bg-surface-raised p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-zinc-300">Contacto *</h3>
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-zinc-300 transition hover:border-accent hover:text-accent"
            @click="showContactForm = true"
          >
            <Plus :size="12" /> Nuevo contacto
          </button>
        </div>

        <!-- Contacto seleccionado -->
        <div
          v-if="selectedContact"
          class="flex items-start justify-between gap-3 rounded-lg border border-accent/40 bg-accent/5 p-3"
        >
          <div class="flex min-w-0 items-start gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <User :size="16" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-zinc-100">{{ selectedContact.name }}</p>
              <p v-if="selectedContact.phone" class="text-xs text-zinc-400">
                {{ selectedContact.phone }}
              </p>
              <p v-if="contactStats && contactStats.count > 0" class="mt-1 flex items-center gap-1 text-xs text-accent">
                <ShoppingCart :size="12" />
                {{ contactStats.count }} compra(s) · {{ formatCurrency(contactStats.total) }} histórico
              </p>
              <p v-else class="mt-1 text-xs text-zinc-500">Primera compra registrada</p>
            </div>
          </div>
          <button
            type="button"
            class="rounded p-1 text-zinc-500 hover:text-danger"
            title="Quitar contacto"
            @click="clearContact"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Buscar contacto existente -->
        <div v-else>
          <div class="relative">
            <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              v-model="contactSearchQuery"
              type="search"
              placeholder="Buscar contacto por nombre o teléfono..."
              class="w-full rounded-lg border border-border bg-surface-raised py-2 pl-10 pr-4 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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
          <p class="mt-1.5 text-xs text-zinc-500">
            Requerido: asocia la venta a un contacto para llevar su historial de compras.
          </p>
        </div>

        <div>
          <label class="mb-1 block text-sm text-zinc-400">Método de pago</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="method in paymentMethods"
              :key="method.value"
              type="button"
              class="rounded-lg border px-4 py-2 text-sm transition"
              :class="
                paymentMethod === method.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-zinc-400 hover:border-zinc-600'
              "
              @click="paymentMethod = method.value"
            >
              {{ method.label }}
            </button>
          </div>
        </div>

        <div
          v-if="paymentMethod === 'canje'"
          class="space-y-4 rounded-lg border border-border bg-surface-overlay/40 p-4"
        >
          <div>
            <div class="mb-2 flex items-center justify-between">
              <label class="text-sm font-medium text-zinc-300">Equipos recibidos a cuenta</label>
              <button
                type="button"
                class="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-zinc-300 transition hover:border-accent hover:text-accent"
                @click="showProductForm = true"
              >
                <Plus :size="12" /> Producto nuevo
              </button>
            </div>

            <!-- Buscar en el inventario -->
            <div class="relative">
              <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                v-model="tradeInSearchQuery"
                type="search"
                placeholder="Buscar un producto de tu inventario..."
                class="w-full rounded-lg border border-border bg-surface-raised py-2 pl-10 pr-4 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div
                v-if="tradeInSearchResults.length > 0"
                class="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl"
              >
                <button
                  v-for="product in tradeInSearchResults"
                  :key="product.id"
                  type="button"
                  class="flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-surface-overlay"
                  @click="addTradeInProduct(product)"
                >
                  <span class="text-sm text-zinc-100">
                    {{ product.brand }} {{ product.model }}
                    <span v-if="product.variant" class="text-zinc-400"> — {{ product.variant }}</span>
                    <BatteryHealthBadge
                      v-if="acceptsBatteryHealth(product)"
                      :health="product.batteryHealth"
                      class="ml-1 align-middle"
                    />
                  </span>
                  <span class="text-xs text-zinc-500">Stock: {{ product.stock }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Lista de equipos recibidos -->
          <div v-if="tradeInEntries.length > 0" class="space-y-2">
            <div
              v-for="item in tradeInEntries"
              :key="item.product.id"
              class="rounded-lg border border-border bg-surface-raised p-3"
            >
              <div class="flex items-start justify-between gap-2">
                <p class="min-w-0 flex-1 truncate text-sm text-zinc-100">
                  {{ item.product.brand }} {{ item.product.model }}
                  <span v-if="item.product.variant" class="text-zinc-400">{{ item.product.variant }}</span>
                </p>
                <button
                  type="button"
                  class="rounded p-1 text-zinc-500 hover:text-danger"
                  @click="removeTradeInItem(item.product.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
              <div class="mt-2 flex items-center justify-between gap-3">
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="rounded p-1 text-zinc-400 hover:bg-surface-overlay hover:text-zinc-100"
                    @click="updateTradeInQuantity(item.product.id, -1)"
                  >
                    <Minus :size="14" />
                  </button>
                  <span class="w-8 text-center text-sm">{{ item.quantity }}</span>
                  <button
                    type="button"
                    class="rounded p-1 text-zinc-400 hover:bg-surface-overlay hover:text-zinc-100"
                    @click="updateTradeInQuantity(item.product.id, 1)"
                  >
                    <Plus :size="14" />
                  </button>
                </div>
                <div class="relative w-32">
                  <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">$</span>
                  <input
                    :value="item.unitValue || ''"
                    type="number"
                    min="0"
                    inputmode="numeric"
                    placeholder="Valor c/u"
                    class="no-spinner w-full rounded-lg border border-border bg-surface-raised py-1.5 pl-6 pr-3 text-right text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    @input="onTradeInValueInput(item, $event)"
                  />
                </div>
                <span class="w-24 text-right text-sm font-medium text-zinc-200">
                  {{ formatCurrency(item.unitValue * item.quantity) }}
                </span>
              </div>
              <ImeiUnitFields
                v-if="isPhoneCategory(item.product.category)"
                class="mt-3"
                :units="item.imeis"
                received
              />
            </div>

            <div class="flex items-center justify-between px-1 pt-1 text-sm">
              <span class="text-zinc-400">Total recibido</span>
              <span class="font-medium text-zinc-100">{{ formatCurrency(tradeInTotal) }}</span>
            </div>
          </div>

          <p v-else class="text-center text-xs text-zinc-500">
            Busca o crea los productos que recibes a cuenta. Se sumarán a tu inventario.
          </p>
        </div>

        <div
          v-if="paymentMethod === 'credito'"
          class="space-y-3 rounded-lg border border-border bg-surface-overlay/40 p-4"
        >
          <div class="grid grid-cols-2 gap-4">
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
                  @input="onCreditDownPaymentInput"
                />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-sm text-zinc-400">Fecha de pago final *</label>
              <input v-model="creditDueDate" type="date" :min="today" class="input-field" />
            </div>
          </div>
          <div class="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2 text-sm">
            <span class="text-zinc-400">Saldo pendiente</span>
            <span class="font-semibold text-warning">{{ formatCurrency(creditBalance) }}</span>
          </div>
        </div>

        <AppleAccountFields :account="appleAccount" />

        <div>
          <label class="mb-1 block text-sm text-zinc-400">Notas</label>
          <textarea v-model="notes" rows="2" class="input-field resize-none" />
        </div>
      </div>

      <div class="rounded-xl border border-border bg-surface-raised p-6">
        <h3 class="mb-4 text-sm font-medium text-zinc-300">Resumen</h3>
        <div class="space-y-2">
          <div v-for="item in cart" :key="item.product.id" class="space-y-2 text-sm">
            <div class="flex justify-between gap-3">
              <span class="text-zinc-400">
                {{ item.product.brand }} {{ item.product.model }} × {{ item.quantity }}
                <BatteryHealthBadge
                  v-if="acceptsBatteryHealth(item.product)"
                  :health="item.product.batteryHealth"
                  class="ml-1 align-middle"
                />
              </span>
              <span class="shrink-0 text-zinc-200">{{ formatCurrency(item.product.price * item.quantity) }}</span>
            </div>
            <ImeiUnitFields
              v-if="isPhoneCategory(item.product.category)"
              :units="item.imeis"
            />
          </div>
        </div>
        <div class="mt-4 space-y-2 border-t border-border pt-4">
          <div class="flex justify-between text-sm">
            <span class="text-zinc-400">Subtotal</span>
            <span class="text-zinc-300">{{ formatCurrency(subtotal) }}</span>
          </div>
          <div v-if="discountAmount > 0" class="flex justify-between text-sm">
            <span class="text-zinc-400">
              Descuento<template v-if="discountType === 'percent'"> ({{ discountValue }}%)</template>
            </span>
            <span class="text-success">−{{ formatCurrency(discountAmount) }}</span>
          </div>

          <template v-if="tradeInCredit > 0">
            <div class="flex justify-between text-sm">
              <span class="text-zinc-400">Total</span>
              <span class="text-zinc-300">{{ formatCurrency(total) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-zinc-400">
                Equipo a cuenta<template v-if="tradeInEntries.length"> ({{ tradeInEntries.length }})</template>
              </span>
              <span class="text-success">−{{ formatCurrency(tradeInCredit) }}</span>
            </div>
            <div class="flex justify-between pt-1">
              <span class="font-medium text-zinc-300">Saldo a pagar</span>
              <span class="text-right text-xl font-semibold text-accent">
                {{ formatCurrency(amountDue) }}
                <UsdEquivalent :bs="amountDue" class="block" />
              </span>
            </div>
          </template>

          <template v-else-if="paymentMethod === 'credito'">
            <div class="flex justify-between text-sm">
              <span class="text-zinc-400">Total</span>
              <span class="text-zinc-300">{{ formatCurrency(total) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-zinc-400">Abono inicial</span>
              <span class="text-success">−{{ formatCurrency(Math.min(creditDownPayment || 0, total)) }}</span>
            </div>
            <div class="flex justify-between pt-1">
              <span class="font-medium text-zinc-300">
                Saldo pendiente<template v-if="creditDueDate">
                  <span class="text-xs font-normal text-zinc-500">· vence {{ formatDate(creditDueDate) }}</span>
                </template>
              </span>
              <span class="text-right text-xl font-semibold text-warning">
                {{ formatCurrency(creditBalance) }}
                <UsdEquivalent :bs="creditBalance" class="block" />
              </span>
            </div>
          </template>

          <div v-else class="flex justify-between pt-1">
            <span class="font-medium text-zinc-300">Total a pagar</span>
            <span class="text-right text-xl font-semibold text-accent">
              {{ formatCurrency(total) }}
              <UsdEquivalent :bs="total" class="block" />
            </span>
          </div>
        </div>
      </div>

      <div class="flex justify-between">
        <button
          type="button"
          class="rounded-lg px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-overlay"
          @click="step = 1"
        >
          Volver
        </button>
        <button
          type="button"
          class="rounded-lg bg-success px-6 py-2.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
          :disabled="processing"
          @click="confirmSale"
        >
          {{ processing ? 'Procesando...' : 'Confirmar venta' }}
        </button>
      </div>
    </div>

    <ProductFormModal
      v-model="showProductForm"
      :price-required="false"
      :stock-default="1"
      condition-default="segunda_mano"
      @save="handleCreateTradeInProduct"
    />

    <ContactFormModal v-model="showContactForm" lock-customer @save="handleCreateContact" />

    <SaleCompletedModal v-model="showCompletedModal" :sale="completedSale" />
  </div>
</template>

<style scoped>
/* Oculta las flechas nativas de los inputs numéricos (descuento y valor de canje) */
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