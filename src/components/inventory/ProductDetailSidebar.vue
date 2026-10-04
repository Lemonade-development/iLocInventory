<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import {
  X,
  Pencil,
  PackageMinus,
  Trash2,
  AlertTriangle,
  TrendingUp,
  Hash,
  Calendar,
} from 'lucide-vue-next'
import type { Product, InventoryMovement } from '@/types'
import { formatCurrency, formatDateTime } from '@/utils/format'
import UsdEquivalent from '@/components/common/UsdEquivalent.vue'
import { getFileUrl } from '@/services/storage'
import { useInventoryStore } from '@/stores/inventory'
import {
  acceptsBatteryHealth,
  batteryHealthTextClass,
  CONDITION_LABELS,
  isLowStock as productIsLowStock,
  minStockOf,
  parseBatteryHealth,
} from '@/utils/product'
import BatteryHealthBadge from './BatteryHealthBadge.vue'
import { CATEGORY_LABELS } from '@/utils/category'
import CategoryIcon from './CategoryIcon.vue'

const props = defineProps<{
  product: Product | null
}>()

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  edit: [product: Product]
  adjustStock: [product: Product]
  delete: [product: Product]
}>()

const inventoryStore = useInventoryStore()
const imageUrl = ref<string | null>(null)

const movementTypeLabels: Record<string, string> = {
  in: 'Entrada',
  out: 'Salida',
  adjustment: 'Ajuste',
}

const isLowStock = computed(() => {
  if (!props.product) return false
  return productIsLowStock(props.product)
})

const margin = computed(() => {
  if (!props.product) return 0
  return props.product.price - props.product.cost
})

const marginPercent = computed(() => {
  if (!props.product || props.product.price === 0) return 0
  return Math.round((margin.value / props.product.price) * 100)
})

const productMovements = computed<InventoryMovement[]>(() => {
  if (!props.product) return []
  return inventoryStore.getMovementsForProduct(props.product.id).slice(0, 15)
})

const specEntries = computed(() => {
  if (!props.product?.specs) return []
  return Object.entries(props.product.specs)
})

const batteryPercent = computed(() => {
  const product = props.product
  if (!product || !acceptsBatteryHealth(product)) return undefined
  return parseBatteryHealth(product.batteryHealth)
})

async function loadImage(path?: string) {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
  }
  if (!path) return
  imageUrl.value = await getFileUrl(path)
}

watch(
  () => props.product?.imagePath,
  (path) => loadImage(path),
  { immediate: true },
)

watch(open, async (isOpen) => {
  if (isOpen && props.product) {
    if (inventoryStore.movements.length === 0) {
      await inventoryStore.loadMovements()
    }
  }
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) open.value = false
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})

function detailRow(label: string, value: string | number | undefined | null) {
  return { label, value: value !== undefined && value !== null && value !== '' ? String(value) : '—' }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open && product" class="fixed inset-0 z-50 flex justify-end">
        <div
          class="absolute inset-0 bg-black/60"
          @click="open = false"
        />

        <aside
          class="relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface-raised shadow-2xl"
        >
          <!-- Header -->
          <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {{ CATEGORY_LABELS[product.category] }}
                </p>
                <span
                  v-if="product.condition"
                  class="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  :class="
                    product.condition === 'segunda_mano'
                      ? 'bg-warning/15 text-warning'
                      : 'bg-accent/15 text-accent'
                  "
                >
                  {{ CONDITION_LABELS[product.condition] }}
                </span>
                <BatteryHealthBadge
                  v-if="acceptsBatteryHealth(product)"
                  :health="product.batteryHealth"
                />
              </div>
              <h2 class="mt-1 text-xl font-semibold text-zinc-100">
                {{ product.brand }} {{ product.model }}
              </h2>
              <p v-if="product.variant" class="mt-0.5 text-sm text-zinc-400">
                {{ product.variant }}
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-surface-overlay hover:text-zinc-100"
              @click="open = false"
            >
              <X :size="20" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto">
            <!-- Imagen -->
            <div class="border-b border-border px-6 py-5">
              <div
                class="flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-overlay"
              >
                <img
                  v-if="imageUrl"
                  :src="imageUrl"
                  :alt="product.model"
                  class="h-full w-full object-contain"
                />
                <div v-else class="flex flex-col items-center gap-2 text-zinc-600">
                  <CategoryIcon :category="product.category" :size="48" />
                  <span class="text-xs">Sin imagen</span>
                </div>
              </div>
            </div>

            <!-- Alerta stock bajo -->
            <div
              v-if="isLowStock"
              class="mx-6 mt-5 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
            >
              <AlertTriangle :size="16" />
              Stock bajo — {{ product.stock }} unidades (mín. {{ minStockOf(product) }})
            </div>

            <!-- Precios e inventario -->
            <section class="px-6 py-5">
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Precios e inventario
              </h3>
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-lg bg-surface-overlay p-3">
                  <p class="text-xs text-zinc-500">Precio venta</p>
                  <p
                    v-if="!product.price || product.price <= 0"
                    class="mt-1 flex items-center gap-1 text-base font-semibold text-warning"
                    title="Este producto no tiene precio de venta. Edítalo para poder venderlo."
                  >
                    <AlertTriangle :size="16" />
                    Sin precio
                  </p>
                  <p v-else class="mt-1 text-lg font-semibold text-zinc-100">
                    {{ formatCurrency(product.price) }}
                  </p>
                  <UsdEquivalent v-if="product.price > 0" :bs="product.price" class="mt-0.5 block" />
                </div>
                <div class="rounded-lg bg-surface-overlay p-3">
                  <p class="text-xs text-zinc-500">Costo</p>
                  <p class="mt-1 text-lg font-semibold text-zinc-100">
                    {{ formatCurrency(product.cost) }}
                  </p>
                </div>
                <div class="rounded-lg bg-surface-overlay p-3">
                  <p class="text-xs text-zinc-500">Margen</p>
                  <p class="mt-1 flex items-center gap-1 text-lg font-semibold text-success">
                    <TrendingUp :size="16" />
                    {{ formatCurrency(margin) }}
                    <span class="text-sm font-normal text-zinc-400">({{ marginPercent }}%)</span>
                  </p>
                </div>
                <div class="rounded-lg bg-surface-overlay p-3">
                  <p class="text-xs text-zinc-500">Stock actual</p>
                  <p
                    class="mt-1 text-lg font-semibold"
                    :class="isLowStock ? 'text-warning' : 'text-zinc-100'"
                  >
                    {{ product.stock }} uds.
                  </p>
                </div>
              </div>
            </section>

            <!-- Identificación -->
            <section class="border-t border-border px-6 py-5">
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Identificación
              </h3>
              <dl class="space-y-2.5">
                <div
                  v-for="row in [
                    detailRow(
                      'Batería',
                      batteryPercent !== undefined ? `${batteryPercent}%` : undefined,
                    ),
                    ...(product.condition
                      ? [detailRow('Condición', CONDITION_LABELS[product.condition])]
                      : []),
                    detailRow('ID', product.id),
                  ]"
                  :key="row.label"
                  class="flex justify-between gap-4 text-sm"
                >
                  <dt class="shrink-0 text-zinc-500">{{ row.label }}</dt>
                  <dd
                    class="truncate text-right text-xs"
                    :class="
                      row.label === 'Batería' && batteryPercent !== undefined
                        ? ['font-medium', batteryHealthTextClass(batteryPercent)]
                        : 'font-mono text-zinc-300'
                    "
                    :title="row.value"
                  >
                    {{ row.value }}
                  </dd>
                </div>
              </dl>
            </section>

            <!-- Especificaciones -->
            <section v-if="specEntries.length > 0" class="border-t border-border px-6 py-5">
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Especificaciones
              </h3>
              <dl class="space-y-2">
                <div
                  v-for="[key, value] in specEntries"
                  :key="key"
                  class="flex justify-between gap-4 rounded-lg bg-surface-overlay px-3 py-2 text-sm"
                >
                  <dt class="capitalize text-zinc-500">{{ key }}</dt>
                  <dd class="text-zinc-200">{{ String(value) }}</dd>
                </div>
              </dl>
            </section>

            <!-- Movimientos recientes -->
            <section class="border-t border-border px-6 py-5">
              <h3 class="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <Hash :size="12" />
                Movimientos de inventario
              </h3>
              <div v-if="productMovements.length > 0" class="space-y-2">
                <div
                  v-for="movement in productMovements"
                  :key="movement.id"
                  class="rounded-lg bg-surface-overlay px-3 py-2.5 text-sm"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span
                      class="rounded px-1.5 py-0.5 text-xs font-medium"
                      :class="{
                        'bg-success/20 text-success': movement.type === 'in',
                        'bg-danger/20 text-danger': movement.type === 'out',
                        'bg-zinc-700 text-zinc-300': movement.type === 'adjustment',
                      }"
                    >
                      {{ movementTypeLabels[movement.type] }}
                    </span>
                    <span class="font-medium text-zinc-200">
                      {{ movement.type === 'out' ? '−' : movement.type === 'in' ? '+' : '' }}{{ movement.quantity }}
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-zinc-400">{{ movement.reason }}</p>
                  <p class="mt-0.5 text-[10px] text-zinc-600">
                    {{ formatDateTime(movement.date) }}
                  </p>
                </div>
              </div>
              <p v-else class="text-sm text-zinc-600">Sin movimientos registrados</p>
            </section>

            <!-- Metadatos -->
            <section class="border-t border-border px-6 py-5 pb-8">
              <h3 class="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <Calendar :size="12" />
                Registro
              </h3>
              <dl class="space-y-2 text-sm">
                <div class="flex justify-between gap-4">
                  <dt class="text-zinc-500">Creado</dt>
                  <dd class="text-zinc-300">{{ formatDateTime(product.createdAt) }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-zinc-500">Actualizado</dt>
                  <dd class="text-zinc-300">{{ formatDateTime(product.updatedAt) }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-zinc-500">Stock mínimo</dt>
                  <dd class="text-zinc-300">{{ minStockOf(product) }} uds.</dd>
                </div>
              </dl>
            </section>
          </div>

          <!-- Acciones -->
          <div class="flex gap-2 border-t border-border px-6 py-4">
            <button
              type="button"
              class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-zinc-300 transition hover:bg-surface-overlay"
              @click="emit('adjustStock', product)"
            >
              <PackageMinus :size="16" />
              Ajustar stock
            </button>
            <button
              type="button"
              class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
              @click="emit('edit', product)"
            >
              <Pencil :size="16" />
              Editar
            </button>
            <button
              type="button"
              class="rounded-lg border border-danger/30 p-2 text-danger transition hover:bg-danger/10"
              title="Eliminar"
              @click="emit('delete', product)"
            >
              <Trash2 :size="16" />
            </button>
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