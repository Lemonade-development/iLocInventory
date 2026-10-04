<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Plus, X, Search, Truck, Download, Upload } from 'lucide-vue-next'
import type {
  Contact,
  ContactFormData,
  Product,
  ProductCategory,
  ProductCondition,
  PurchaseOrder,
  PurchaseOrderFormData,
  PurchaseOrderItem,
} from '@/types'
import AppModal from '@/components/common/AppModal.vue'
import ContactFormModal from '@/components/contacts/ContactFormModal.vue'
import { useProductsStore } from '@/stores/products'
import { useContactsStore } from '@/stores/contacts'
import { useAppStore } from '@/stores/app'
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/utils/category'
import { CONDITION_LABELS } from '@/utils/product'
import { formatCurrency } from '@/utils/format'
import { downloadPurchaseOrderTemplate, parsePurchaseOrderLines } from '@/services/purchaseOrderImport'

const props = defineProps<{ order?: PurchaseOrder | null }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ save: [data: PurchaseOrderFormData] }>()

const productsStore = useProductsStore()
const contactsStore = useContactsStore()
const appStore = useAppStore()

type Row = {
  productId?: string
  brand: string
  model: string
  variant?: string
  category: ProductCategory
  condition: ProductCondition
  price?: number
  quantity?: number
  receivedQuantity: number
  unitCost?: number
  notes?: string
  _search?: string
}

const selectedSupplierId = ref<string | undefined>()
const supplierQuery = ref('')
const expectedDate = ref('')
const notes = ref('')
const rows = ref<Row[]>([])
const activeSearch = ref<number | null>(null)
const showSupplierForm = ref(false)

const categories = ALL_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))
const conditions: { value: ProductCondition; label: string }[] = [
  { value: 'nuevo', label: CONDITION_LABELS.nuevo },
  { value: 'segunda_mano', label: CONDITION_LABELS.segunda_mano },
]

function emptyRow(): Row {
  return {
    brand: '',
    model: '',
    variant: '',
    category: 'celular',
    condition: 'nuevo',
    price: undefined,
    quantity: 1,
    receivedQuantity: 0,
    unitCost: undefined,
    notes: undefined,
    _search: '',
  }
}

function reset() {
  if (props.order) {
    selectedSupplierId.value = props.order.supplierId
    supplierQuery.value = props.order.supplierName
    expectedDate.value = props.order.expectedDate ?? ''
    notes.value = props.order.notes ?? ''
    rows.value = props.order.items.map((i) => ({
      ...i,
      price: i.price,
      unitCost: i.unitCost,
      quantity: i.quantity,
      _search: '',
    }))
  } else {
    selectedSupplierId.value = undefined
    supplierQuery.value = ''
    expectedDate.value = ''
    notes.value = ''
    rows.value = [emptyRow()]
  }
  activeSearch.value = null
  importErrors.value = []
}

watch(open, (isOpen) => {
  if (!isOpen) return
  contactsStore.loadContacts()
  productsStore.loadProducts()
  reset()
})

const selectedSupplier = computed(() =>
  selectedSupplierId.value ? contactsStore.getContactById(selectedSupplierId.value) : undefined,
)

const supplierResults = computed(() => {
  if (selectedSupplier.value) return []
  const q = supplierQuery.value.trim().toLowerCase()
  if (!q) return []
  return contactsStore.suppliers
    .filter((s) => s.name.toLowerCase().includes(q) || s.phone?.toLowerCase().includes(q))
    .slice(0, 8)
})

function selectSupplier(supplier: Contact) {
  selectedSupplierId.value = supplier.id
  supplierQuery.value = supplier.name
}

function clearSupplier() {
  selectedSupplierId.value = undefined
  supplierQuery.value = ''
}

async function handleCreateSupplier(data: ContactFormData) {
  try {
    const supplier = await contactsStore.createContact({ ...data, type: 'supplier' })
    selectSupplier(supplier)
    showSupplierForm.value = false
  } catch {
    appStore.showToast('Error al crear el proveedor', 'error')
  }
}

function productResults(row: Row): Product[] {
  return productsStore.searchProducts(row._search ?? '')
}

function selectProduct(row: Row, product: Product) {
  row.productId = product.id
  row.brand = product.brand
  row.model = product.model
  row.variant = product.variant
  row.category = product.category
  row.condition = product.condition ?? 'nuevo'
  row.price = product.price
  if (!row.unitCost) row.unitCost = product.cost
  row._search = ''
  activeSearch.value = null
}

function unlinkProduct(row: Row) {
  row.productId = undefined
  activeSearch.value = null
}

// ─── Líneas desde planilla (pedidos grandes) ────────────────────────────────

const importingLines = ref(false)
const importErrors = ref<string[]>([])

async function onDownloadTemplate() {
  try {
    await downloadPurchaseOrderTemplate()
  } catch {
    appStore.showToast('No se pudo generar la plantilla', 'error')
  }
}

async function onImportLines(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importingLines.value = true
  importErrors.value = []
  try {
    await productsStore.loadProducts()
    const result = await parsePurchaseOrderLines(file, productsStore.products)
    importErrors.value = result.errors
    if (result.lines.length === 0) {
      appStore.showToast('La planilla no tiene líneas válidas', 'error')
      return
    }
    // Las líneas vacías del formulario se reemplazan; las ya cargadas se conservan.
    rows.value = [
      ...rows.value.filter((r) => r.brand.trim() || r.model.trim()),
      ...result.lines.map((line) => ({ ...line, receivedQuantity: 0, _search: '' })),
    ]
    appStore.showToast(
      `${result.lines.length} línea(s) cargada(s) · ${result.linked} vinculada(s) a productos existentes`,
      'success',
    )
  } catch (e) {
    appStore.showToast(e instanceof Error ? e.message : 'No se pudo leer la planilla', 'error')
  } finally {
    importingLines.value = false
  }
}

function addRow() {
  rows.value.push(emptyRow())
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
}

function rowName(row: Row): string {
  return [row.brand, row.model, row.variant].filter(Boolean).join(' ')
}

function rowSubtotal(row: Row): number {
  return (Number(row.unitCost) || 0) * (Number(row.quantity) || 0)
}

const total = computed(() => rows.value.reduce((sum, r) => sum + rowSubtotal(r), 0))

const supplierName = computed(() =>
  selectedSupplier.value ? selectedSupplier.value.name : supplierQuery.value.trim(),
)

function submit() {
  const items: PurchaseOrderItem[] = rows.value
    .filter((r) => r.brand.trim() && r.model.trim() && (Number(r.quantity) || 0) > 0)
    .map((r) => ({
      productId: r.productId,
      brand: r.brand.trim(),
      model: r.model.trim(),
      variant: r.variant?.trim() || undefined,
      category: r.category,
      condition: r.condition,
      price: r.price != null ? Number(r.price) : undefined,
      quantity: Number(r.quantity) || 0,
      receivedQuantity: Number(r.receivedQuantity) || 0,
      unitCost: Number(r.unitCost) || 0,
      notes: r.notes?.trim() || undefined,
    }))

  if (!supplierName.value) {
    appStore.showToast('Selecciona o escribe un proveedor', 'error')
    return
  }
  if (items.length === 0) {
    appStore.showToast('Agrega al menos un modelo con marca, modelo y cantidad', 'error')
    return
  }

  emit('save', {
    supplierId: selectedSupplier.value?.id,
    supplierName: supplierName.value,
    expectedDate: expectedDate.value || undefined,
    notes: notes.value.trim() || undefined,
    items,
  })
}
</script>

<template>
  <AppModal
    v-model="open"
    :title="order ? `Editar ${order.code}` : 'Nueva orden de compra'"
    size="xl"
  >
    <div class="space-y-5">
      <!-- Proveedor -->
      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-sm text-zinc-400">Proveedor *</label>
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-zinc-300 transition hover:border-accent hover:text-accent"
            @click="showSupplierForm = true"
          >
            <Plus :size="12" /> Nuevo proveedor
          </button>
        </div>

        <div
          v-if="selectedSupplier"
          class="flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/5 p-3"
        >
          <div class="flex min-w-0 items-center gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
              <Truck :size="16" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-zinc-100">{{ selectedSupplier.name }}</p>
              <p v-if="selectedSupplier.phone" class="text-xs text-zinc-400">
                {{ selectedSupplier.phone }}
              </p>
            </div>
          </div>
          <button
            type="button"
            class="rounded p-1 text-zinc-500 hover:text-danger"
            title="Quitar proveedor"
            @click="clearSupplier"
          >
            <X :size="16" />
          </button>
        </div>

        <div v-else class="relative">
          <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            v-model="supplierQuery"
            type="text"
            placeholder="Buscar proveedor o escribir un nombre..."
            class="w-full rounded-lg border border-border bg-surface-raised py-2 pl-10 pr-4 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div
            v-if="supplierResults.length > 0"
            class="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl"
          >
            <button
              v-for="supplier in supplierResults"
              :key="supplier.id"
              type="button"
              class="flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-surface-overlay"
              @click="selectSupplier(supplier)"
            >
              <span class="text-sm text-zinc-100">{{ supplier.name }}</span>
              <span v-if="supplier.phone" class="text-xs text-zinc-500">{{ supplier.phone }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="mb-1 block text-sm text-zinc-400">Fecha estimada de entrega</label>
          <input v-model="expectedDate" type="date" class="input-field" />
        </div>
        <div>
          <label class="mb-1 block text-sm text-zinc-400">Notas</label>
          <input v-model="notes" class="input-field" placeholder="Opcional" />
        </div>
      </div>

      <!-- Modelos solicitados -->
      <div>
        <label class="mb-2 block text-sm text-zinc-400">Modelos solicitados *</label>
        <div class="space-y-3">
          <div
            v-for="(row, idx) in rows"
            :key="idx"
            class="rounded-lg border border-border bg-surface-overlay/40 p-3"
          >
            <!-- Producto existente vinculado -->
            <div v-if="row.productId" class="mb-3 flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-zinc-100">{{ rowName(row) }}</p>
                <div class="mt-0.5 flex items-center gap-2">
                  <span
                    class="rounded-md px-1.5 py-0.5 text-xs font-medium"
                    :class="row.condition === 'nuevo' ? 'bg-accent/15 text-accent' : 'bg-warning/15 text-warning'"
                  >
                    {{ CONDITION_LABELS[row.condition] }}
                  </span>
                  <span class="text-xs text-zinc-500">Producto en catálogo</span>
                </div>
              </div>
              <div class="flex shrink-0 gap-1">
                <button
                  type="button"
                  class="rounded-lg border border-border px-2 py-1 text-xs text-zinc-300 hover:border-accent hover:text-accent"
                  @click="unlinkProduct(row)"
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-zinc-500 hover:text-danger"
                  @click="removeRow(idx)"
                >
                  <X :size="16" />
                </button>
              </div>
            </div>

            <!-- Modelo nuevo / búsqueda -->
            <div v-else class="mb-3 space-y-2">
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <Search :size="15" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    v-model="row._search"
                    placeholder="Buscar producto existente..."
                    class="w-full rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    @focus="activeSearch = idx"
                  />
                  <div
                    v-if="activeSearch === idx && productResults(row).length > 0"
                    class="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl"
                  >
                    <button
                      v-for="product in productResults(row)"
                      :key="product.id"
                      type="button"
                      class="flex w-full items-center justify-between px-4 py-2 text-left transition hover:bg-surface-overlay"
                      @click="selectProduct(row, product)"
                    >
                      <span class="text-sm text-zinc-100">
                        {{ [product.brand, product.model, product.variant].filter(Boolean).join(' ') }}
                      </span>
                      <span class="text-xs text-zinc-500">Stock: {{ product.stock }}</span>
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  class="rounded-lg p-2 text-zinc-500 hover:text-danger"
                  @click="removeRow(idx)"
                >
                  <X :size="16" />
                </button>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <input v-model="row.brand" placeholder="Marca *" class="input-field" />
                <input v-model="row.model" placeholder="Modelo *" class="input-field" />
                <input v-model="row.variant" placeholder="Variante (ej: Negro 128GB)" class="input-field col-span-2" />
                <select v-model="row.category" class="input-field">
                  <option v-for="cat in categories" :key="cat.value" :value="cat.value">
                    {{ cat.label }}
                  </option>
                </select>
                <input
                  v-model.number="row.price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Precio venta (opcional)"
                  class="no-spinner input-field"
                />
                <div class="col-span-2 flex items-center gap-1.5">
                  <span class="text-xs text-zinc-500">Condición:</span>
                  <button
                    v-for="opt in conditions"
                    :key="opt.value"
                    type="button"
                    class="rounded-md border px-3 py-1 text-xs transition"
                    :class="
                      row.condition === opt.value
                        ? opt.value === 'nuevo'
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-warning bg-warning/10 text-warning'
                        : 'border-border text-zinc-400 hover:border-zinc-600'
                    "
                    @click="row.condition = opt.value"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Cantidad, costo, subtotal -->
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="mb-1 block text-xs text-zinc-500">Cantidad</label>
                <input
                  v-model.number="row.quantity"
                  type="number"
                  min="1"
                  class="no-spinner input-field"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs text-zinc-500">Costo unitario</label>
                <input
                  v-model.number="row.unitCost"
                  type="number"
                  min="0"
                  step="0.01"
                  class="no-spinner input-field"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs text-zinc-500">Subtotal</label>
                <p class="input-field flex items-center bg-surface-raised text-zinc-300">
                  {{ formatCurrency(rowSubtotal(row)) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            class="text-sm text-accent hover:underline"
            @click="addRow"
          >
            + Agregar modelo
          </button>
          <label
            class="inline-flex cursor-pointer items-center gap-1.5 text-sm text-zinc-300 transition hover:text-accent"
            :class="{ 'pointer-events-none opacity-50': importingLines }"
            title="Cargar las líneas desde una planilla (.xlsx, .ods, .csv)"
          >
            <Upload :size="14" />
            {{ importingLines ? 'Leyendo planilla...' : 'Importar líneas' }}
            <input
              type="file"
              accept=".xlsx,.xls,.ods,.csv"
              class="hidden"
              :disabled="importingLines"
              @change="onImportLines"
            />
          </label>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-accent"
            @click="onDownloadTemplate"
          >
            <Download :size="14" />
            Descargar plantilla
          </button>
        </div>
        <div
          v-if="importErrors.length > 0"
          class="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          <div class="mb-1 flex items-center justify-between gap-2">
            <p class="font-medium">{{ importErrors.length }} fila(s) de la planilla no se cargaron:</p>
            <button type="button" class="text-warning/80 hover:text-warning" @click="importErrors = []">
              <X :size="14" />
            </button>
          </div>
          <ul class="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">
            <li v-for="err in importErrors" :key="err">{{ err }}</li>
          </ul>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-zinc-400">
          Total: <span class="font-semibold text-zinc-100">{{ formatCurrency(total) }}</span>
        </p>
        <div class="flex gap-3">
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-surface-overlay"
            @click="open = false"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            @click="submit"
          >
            {{ order ? 'Guardar cambios' : 'Crear orden' }}
          </button>
        </div>
      </div>
    </template>

    <ContactFormModal v-model="showSupplierForm" lock-supplier @save="handleCreateSupplier" />
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
