<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'
import type { Product, ProductCondition, ProductFormData } from '@/types'
import AppModal from '@/components/common/AppModal.vue'
import ProductImageUpload from './ProductImageUpload.vue'
import { acceptsBatteryHealth, CONDITION_LABELS, parseBatteryHealth } from '@/utils/product'
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/utils/category'

const props = withDefaults(
  defineProps<{
    product?: Product | null
    /** Si el precio de venta es obligatorio. En inventario sí; en un canje no,
     *  porque aún no se sabe a cuánto se revenderá el equipo recibido. */
    priceRequired?: boolean
    /** Stock inicial por defecto para un producto nuevo (1 en un canje). */
    stockDefault?: number
    /** Condición por defecto para un producto nuevo (segunda mano en un canje). */
    conditionDefault?: ProductCondition
  }>(),
  {
    priceRequired: true,
    stockDefault: 0,
    conditionDefault: 'nuevo',
  },
)

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  save: [data: ProductFormData]
}>()

// Los campos numéricos de valor arrancan vacíos (undefined) en vez de 0, para
// no arrastrar el 0 por defecto al escribir. Se coaccionan a número en submit().
type ProductForm = Omit<ProductFormData, 'price' | 'cost' | 'stock'> & {
  price?: number
  cost?: number
  stock?: number
}

const defaultForm = (): ProductForm => ({
  brand: '',
  model: '',
  variant: '',
  category: 'celular',
  condition: props.conditionDefault,
  price: undefined,
  cost: undefined,
  stock: props.stockDefault || undefined,
  minStock: 5,
  imagePath: undefined,
})

const form = ref<ProductForm>(defaultForm())
const priceError = ref(false)
const batteryError = ref(false)

const showBattery = computed(() => acceptsBatteryHealth({ condition: form.value.condition }))

const conditions: { value: ProductCondition; label: string }[] = [
  { value: 'nuevo', label: CONDITION_LABELS.nuevo },
  { value: 'segunda_mano', label: CONDITION_LABELS.segunda_mano },
]

watch(
  () => [open.value, props.product] as const,
  ([isOpen, product]) => {
    if (!isOpen) return
    priceError.value = false
    batteryError.value = false
    if (product) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = product
      // Un valor de 0 se muestra vacío para no arrastrar el 0 al escribir.
      form.value = { ...rest, price: rest.price || undefined, cost: rest.cost || undefined }
      if (!rest.condition) form.value.condition = props.conditionDefault
    } else {
      form.value = defaultForm()
    }
  },
)

watch(showBattery, (visible) => {
  if (!visible) batteryError.value = false
})

function onBatteryInput(event: Event) {
  batteryError.value = false
  const raw = (event.target as HTMLInputElement).value
  if (raw.trim() === '') {
    form.value.batteryHealth = undefined
    return
  }
  const n = Number(raw)
  form.value.batteryHealth = Number.isFinite(n) ? n : undefined
}

const categories = ALL_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}))

function stepField(field: 'stock' | 'minStock', delta: number) {
  const next = (Number(form.value[field]) || 0) + delta
  form.value[field] = Math.max(0, next)
}

function emptyNumber(value: unknown): boolean {
  return value === undefined || value === null || value === '' || Number.isNaN(value)
}

function submit() {
  const data: ProductFormData = {
    ...form.value,
    price: Number(form.value.price) || 0,
    cost: Number(form.value.cost) || 0,
    stock: Number(form.value.stock) || 0,
    // Vacío usa el mínimo por defecto; 0 desactiva el aviso de stock bajo.
    minStock: emptyNumber(form.value.minStock) ? undefined : Math.max(0, Number(form.value.minStock) || 0),
  }
  if (!data.condition) data.condition = props.conditionDefault
  if (showBattery.value) {
    const raw = form.value.batteryHealth
    const empty = raw === undefined || raw === null || Number.isNaN(raw)
    if (empty) {
      data.batteryHealth = undefined
    } else {
      const parsed = parseBatteryHealth(raw)
      if (parsed === undefined) {
        batteryError.value = true
        return
      }
      data.batteryHealth = parsed
    }
  } else {
    data.batteryHealth = undefined
  }
  if (props.priceRequired && data.price <= 0) {
    priceError.value = true
    return
  }
  emit('save', data)
}
</script>

<template>
  <AppModal
    v-model="open"
    :title="product ? 'Editar producto' : 'Nuevo producto'"
    size="lg"
  >
    <form class="space-y-4" @submit.prevent="submit">
      <div class="flex gap-6">
        <ProductImageUpload v-model:image-path="form.imagePath" :category="form.category" />

        <div class="grid flex-1 grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-sm text-zinc-400">Marca *</label>
            <input v-model="form.brand" required class="input-field" />
          </div>
          <div>
            <label class="mb-1 block text-sm text-zinc-400">Modelo *</label>
            <input v-model="form.model" required class="input-field" />
          </div>
          <div class="col-span-2">
            <label class="mb-1 block text-sm text-zinc-400">Variante</label>
            <input
              v-model="form.variant"
              placeholder="ej: Negro 128GB"
              class="input-field"
            />
          </div>
          <div v-if="showBattery">
            <label class="mb-1 block text-sm text-zinc-400" for="battery-health">Batería</label>
            <div class="relative">
              <input
                id="battery-health"
                :value="form.batteryHealth ?? ''"
                type="number"
                min="1"
                max="100"
                inputmode="numeric"
                placeholder="87"
                class="no-spinner input-field pr-7"
                :class="{ 'ring-1 ring-danger': batteryError }"
                @input="onBatteryInput"
              />
              <span class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-zinc-500">%</span>
            </div>
            <p v-if="batteryError" class="mt-1 text-xs text-danger">Ingresa un porcentaje entre 1 y 100.</p>
          </div>
          <div>
            <label class="mb-1 block text-sm text-zinc-400">Categoría *</label>
            <select v-model="form.category" class="input-field">
              <option v-for="cat in categories" :key="cat.value" :value="cat.value">
                {{ cat.label }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <label class="mb-1 block text-sm text-zinc-400">
            Precio venta <span v-if="priceRequired">*</span>
          </label>
          <input
            v-model.number="form.price"
            type="number"
            min="0"
            step="0.01"
            :required="priceRequired"
            class="no-spinner input-field"
            :class="{ 'ring-1 ring-danger': priceError }"
            @input="priceError = false"
          />
          <p v-if="priceError" class="mt-1 text-xs text-danger">Ingresa el precio de venta.</p>
        </div>
        <div>
          <label class="mb-1 block text-sm text-zinc-400">Costo *</label>
          <input v-model.number="form.cost" type="number" min="0" step="0.01" required class="no-spinner input-field" />
        </div>
        <div>
          <label class="mb-1 block text-sm text-zinc-400">Stock *</label>
          <div class="flex items-stretch gap-1.5">
            <button
              type="button"
              class="flex w-9 shrink-0 items-center justify-center rounded-lg border border-border text-zinc-300 transition hover:border-accent hover:bg-accent/10 hover:text-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-transparent disabled:hover:text-zinc-300"
              :disabled="(Number(form.stock) || 0) <= 0"
              aria-label="Disminuir stock"
              @click="stepField('stock', -1)"
            >
              <Minus :size="14" />
            </button>
            <input
              v-model.number="form.stock"
              type="number"
              min="0"
              class="no-spinner input-field min-w-0 flex-1 text-center"
            />
            <button
              type="button"
              class="flex w-9 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent transition hover:border-accent hover:bg-accent/20 active:scale-95"
              aria-label="Aumentar stock"
              @click="stepField('stock', 1)"
            >
              <Plus :size="14" />
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm text-zinc-400">Stock mínimo</label>
          <div class="flex items-stretch gap-1.5">
            <button
              type="button"
              class="flex w-9 shrink-0 items-center justify-center rounded-lg border border-border text-zinc-300 transition hover:border-accent hover:bg-accent/10 hover:text-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-transparent disabled:hover:text-zinc-300"
              :disabled="(Number(form.minStock) || 0) <= 0"
              aria-label="Disminuir stock mínimo"
              @click="stepField('minStock', -1)"
            >
              <Minus :size="14" />
            </button>
            <input
              v-model.number="form.minStock"
              type="number"
              min="0"
              class="no-spinner input-field min-w-0 flex-1 text-center"
            />
            <button
              type="button"
              class="flex w-9 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent transition hover:border-accent hover:bg-accent/20 active:scale-95"
              aria-label="Aumentar stock mínimo"
              @click="stepField('minStock', 1)"
            >
              <Plus :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3">
        <label class="shrink-0 text-sm text-zinc-400">Condición *</label>
        <div class="flex gap-1.5">
          <button
            v-for="opt in conditions"
            :key="opt.value"
            type="button"
            class="rounded-md border px-3 py-1 text-xs transition"
            :class="
              form.condition === opt.value
                ? opt.value === 'nuevo'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-warning bg-warning/10 text-warning'
                : 'border-border text-zinc-400 hover:border-zinc-600'
            "
            @click="form.condition = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </form>

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
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          @click="submit"
        >
          {{ product ? 'Guardar cambios' : 'Crear producto' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
/* Oculta las flechas nativas del input numérico de stock */
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