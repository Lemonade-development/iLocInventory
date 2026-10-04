<script setup lang="ts">
import { ref, watch, onUnmounted, computed, onMounted } from 'vue'
import type { InventoryTableColumn, InventoryTableSortKey, TableSortState } from '@/types'
import type { Product } from '@/types'
import {
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  PackageMinus,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import RowActionsMenu, { type RowAction } from '@/components/common/RowActionsMenu.vue'
import TableEmptyRow from '@/components/common/TableEmptyRow.vue'
import { ACTIVE_ROW_CLASS } from '@/utils/table'
import { formatCurrency } from '@/utils/format'
import UsdEquivalent from '@/components/common/UsdEquivalent.vue'
import { getFileUrl } from '@/services/storage'
import { COLUMN_WIDTHS } from '@/composables/useInventoryTableLayout'
import {
  acceptsBatteryHealth,
  batteryHealthTextClass,
  CONDITION_LABELS,
  isLowStock,
  parseBatteryHealth,
} from '@/utils/product'
import BatteryHealthBadge from './BatteryHealthBadge.vue'
import { CATEGORY_LABELS } from '@/utils/category'
import CategoryIcon from './CategoryIcon.vue'

const props = defineProps<{
  products: Product[]
  highlightId?: string
  selectedId?: string
  visibleColumns: InventoryTableColumn[]
  /** Hay productos pero los filtros los ocultan todos. */
  filtered?: boolean
}>()

const sort = defineModel<TableSortState>('sort', { required: true })
const selectedIds = defineModel<string[]>('selectedIds', { default: () => [] })

const selectAllRef = ref<HTMLInputElement | null>(null)

const emit = defineEmits<{
  select: [product: Product]
  edit: [product: Product]
  delete: [product: Product]
  adjustStock: [product: Product]
  clearFilters: []
}>()

const imageUrls = ref<Record<string, string>>({})
const productActions: RowAction[] = [
  { key: 'adjustStock', label: 'Ajustar stock', icon: PackageMinus },
  { key: 'edit', label: 'Editar', icon: Pencil },
  { key: 'delete', label: 'Eliminar', icon: Trash2, danger: true },
]

function runAction(product: Product, key: string) {
  if (key === 'adjustStock') emit('adjustStock', product)
  else if (key === 'edit') emit('edit', product)
  else if (key === 'delete') emit('delete', product)
}

const columnDefs: Record<
  InventoryTableColumn,
  { label: string; align: 'left' | 'right' }
> = {
  product: { label: 'Producto', align: 'left' },
  batteryHealth: { label: 'Batería', align: 'left' },
  category: { label: 'Categoría', align: 'left' },
  condition: { label: 'Condición', align: 'left' },
  price: { label: 'Precio', align: 'right' },
  stock: { label: 'Stock', align: 'right' },
}

function batteryLabel(product: Product): string {
  if (!acceptsBatteryHealth(product)) return '—'
  const percent = parseBatteryHealth(product.batteryHealth)
  return percent === undefined ? '—' : `${percent}%`
}

function conditionBadgeClass(condition?: string): string {
  if (condition === 'segunda_mano') return 'bg-warning/15 text-warning'
  if (condition === 'nuevo') return 'bg-accent/15 text-accent'
  return 'bg-surface-overlay text-zinc-500'
}

const activeColumns = computed(() =>
  props.visibleColumns.map((key) => ({ key, ...columnDefs[key] })),
)

const colspan = computed(() => activeColumns.value.length + 2)

const allSelected = computed(
  () =>
    props.products.length > 0 &&
    props.products.every((p) => selectedIds.value.includes(p.id)),
)

const someSelected = computed(
  () =>
    props.products.some((p) => selectedIds.value.includes(p.id)) && !allSelected.value,
)

watch([someSelected, allSelected], () => {
  if (selectAllRef.value) selectAllRef.value.indeterminate = someSelected.value
})

onMounted(() => {
  if (selectAllRef.value) selectAllRef.value.indeterminate = someSelected.value
})

const tableMinWidth = computed(() => {
  const cols = activeColumns.value.reduce(
    (sum, col) => sum + COLUMN_WIDTHS[col.key],
    76,
  )
  return `${cols}px`
})

function toggleSelectAll() {
  if (allSelected.value) {
    const visible = new Set(props.products.map((p) => p.id))
    selectedIds.value = selectedIds.value.filter((id) => !visible.has(id))
  } else {
    const ids = props.products.map((p) => p.id)
    selectedIds.value = [...new Set([...selectedIds.value, ...ids])]
  }
}

function toggleSelect(id: string) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((i) => i !== id)
  } else {
    selectedIds.value = [...selectedIds.value, id]
  }
}

async function loadImages(products: Product[]) {
  for (const p of products) {
    if (p.imagePath && !imageUrls.value[p.id]) {
      const url = await getFileUrl(p.imagePath)
      if (url) imageUrls.value[p.id] = url
    }
  }
}

watch(() => props.products, (list) => loadImages(list), { immediate: true })

onUnmounted(() => {
  Object.values(imageUrls.value).forEach((url) => URL.revokeObjectURL(url))
})

function cycleSort(key: InventoryTableSortKey) {
  const { sortBy, sortDir } = sort.value

  if (sortBy !== key) {
    sort.value = { sortBy: key, sortDir: 'asc' }
  } else if (sortDir === 'asc') {
    sort.value = { sortBy: key, sortDir: 'desc' }
  } else {
    sort.value = { sortBy: null, sortDir: null }
  }
}

function sortIcon(key: InventoryTableSortKey) {
  if (sort.value.sortBy !== key) return ArrowUpDown
  return sort.value.sortDir === 'asc' ? ArrowUp : ArrowDown
}

function columnWidth(key: InventoryTableColumn): string {
  return `${COLUMN_WIDTHS[key]}px`
}

function cellAlign(align: 'left' | 'right'): string {
  return align === 'right' ? 'text-right' : 'text-left'
}

function cellPadding(key: InventoryTableColumn): string {
  return key === 'product' ? 'py-3 pl-1.5 pr-4' : 'px-4 py-3'
}

function headerClasses(key: InventoryTableColumn, align: 'left' | 'right') {
  const isActive = sort.value.sortBy === key
  return [
    'group select-none font-medium transition',
    cellPadding(key),
    align === 'right' ? 'text-right' : 'text-left',
    isActive ? 'text-accent' : 'text-zinc-500 hover:text-zinc-300',
  ]
}
</script>

<template>
  <div class="overflow-x-auto rounded-xl border border-border">
    <table class="table-fixed text-left text-sm" :style="{ minWidth: tableMinWidth, width: '100%' }">
      <colgroup>
        <col style="width: 40px" />
        <col style="width: 36px" />
        <col
          v-for="col in activeColumns"
          :key="col.key"
          :style="{ width: columnWidth(col.key) }"
        />
      </colgroup>
      <thead class="border-b border-border bg-surface-overlay text-xs uppercase">
        <tr>
          <th class="py-3 pl-3 pr-1.5">
            <input
              ref="selectAllRef"
              type="checkbox"
              :checked="allSelected"
              @change="toggleSelectAll"
            />
          </th>
          <th class="py-3 px-1.5" />
          <th
            v-for="col in activeColumns"
            :key="col.key"
            :class="headerClasses(col.key, col.align)"
          >
            <div
              class="flex items-center"
              :class="col.align === 'right' ? 'justify-end' : 'justify-start'"
            >
              <button
                type="button"
                class="inline-flex items-center gap-1.5"
                @click="cycleSort(col.key)"
              >
                {{ col.label }}
                <component
                  :is="sortIcon(col.key)"
                  :size="14"
                  class="shrink-0 transition-opacity"
                  :class="
                    sort.sortBy === col.key
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-60'
                  "
                />
              </button>
            </div>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr
          v-for="product in products"
          :key="product.id"
          class="cursor-pointer transition hover:bg-surface-overlay/50"
          :class="{
            [ACTIVE_ROW_CLASS]: highlightId === product.id || selectedId === product.id,
            'bg-accent/10': selectedIds.includes(product.id),
          }"
          @click="emit('select', product)"
        >
          <td class="py-3 pl-3 pr-1.5" @click.stop>
            <input
              type="checkbox"
              :checked="selectedIds.includes(product.id)"
              @change="toggleSelect(product.id)"
            />
          </td>
          <td class="py-3 px-1.5" @click.stop>
            <RowActionsMenu :items="productActions" @select="runAction(product, $event)" />
          </td>
          <td
            v-for="col in activeColumns"
            :key="col.key"
            class="overflow-hidden"
            :class="[cellAlign(col.align), cellPadding(col.key)]"
          >
            <!-- Producto -->
            <div v-if="col.key === 'product'" class="flex min-w-0 items-center gap-2">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-overlay"
              >
                <img
                  v-if="imageUrls[product.id]"
                  :src="imageUrls[product.id]"
                  :alt="product.model"
                  class="h-full w-full object-cover"
                />
                <CategoryIcon v-else :category="product.category" :size="20" />
              </div>
              <div class="min-w-0">
                <p class="truncate font-medium text-zinc-100">
                  {{ product.brand }} {{ product.model }}
                </p>
                <p v-if="product.variant" class="truncate text-xs text-zinc-500">
                  {{ product.variant }}
                </p>
                <div
                  v-if="product.condition || acceptsBatteryHealth(product)"
                  class="mt-1 flex flex-wrap items-center gap-1"
                >
                  <span
                    v-if="product.condition"
                    class="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                    :class="conditionBadgeClass(product.condition)"
                  >
                    {{ CONDITION_LABELS[product.condition] }}
                  </span>
                  <BatteryHealthBadge
                    v-if="acceptsBatteryHealth(product)"
                    :health="product.batteryHealth"
                  />
                </div>
              </div>
            </div>

            <!-- Batería -->
            <span
              v-else-if="col.key === 'batteryHealth'"
              class="text-sm font-medium"
              :class="
                acceptsBatteryHealth(product) && parseBatteryHealth(product.batteryHealth) !== undefined
                  ? batteryHealthTextClass(parseBatteryHealth(product.batteryHealth)!)
                  : 'text-zinc-600'
              "
            >
              {{ batteryLabel(product) }}
            </span>

            <!-- Categoría -->
            <span
              v-else-if="col.key === 'category'"
              class="inline-flex items-center gap-1.5 rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-zinc-300"
            >
              <CategoryIcon :category="product.category" :size="12" />
              {{ CATEGORY_LABELS[product.category] }}
            </span>

            <!-- Condición -->
            <span
              v-else-if="col.key === 'condition'"
              class="inline-block rounded-md px-2 py-0.5 text-xs font-medium"
              :class="
                product.condition
                  ? conditionBadgeClass(product.condition)
                  : 'bg-surface-overlay text-zinc-600'
              "
            >
              {{ product.condition ? CONDITION_LABELS[product.condition] : '—' }}
            </span>

            <!-- Precio -->
            <template v-else-if="col.key === 'price'">
              <span
                v-if="!product.price || product.price <= 0"
                class="inline-flex items-center gap-1 text-warning"
                title="Este producto no tiene precio de venta. Edítalo para poder venderlo."
              >
                <AlertTriangle :size="14" />
                Sin precio
              </span>
              <template v-else>
                <span class="text-zinc-200">{{ formatCurrency(product.price) }}</span>
                <UsdEquivalent :bs="product.price" class="block" />
              </template>
            </template>

            <!-- Stock -->
            <span
              v-else-if="col.key === 'stock'"
              class="inline-flex items-center gap-1 font-medium"
              :class="isLowStock(product) ? 'text-warning' : 'text-zinc-200'"
            >
              <AlertTriangle v-if="isLowStock(product)" :size="14" />
              {{ product.stock }}
            </span>
          </td>
        </tr>
        <TableEmptyRow
          v-if="products.length === 0"
          :colspan="colspan"
          :filtered="!!filtered"
          empty-text="No hay productos registrados"
          @clear="emit('clearFilters')"
        />
      </tbody>
    </table>
  </div>
</template>