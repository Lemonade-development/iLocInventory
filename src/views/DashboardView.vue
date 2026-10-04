<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Package,
  ShoppingCart,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Truck,
} from 'lucide-vue-next'
import KpiCard from '@/components/common/KpiCard.vue'
import UsdEquivalent from '@/components/common/UsdEquivalent.vue'
import { useProductsStore } from '@/stores/products'
import { useSalesStore } from '@/stores/sales'
import { usePurchaseOrdersStore } from '@/stores/purchaseOrders'
import { formatCurrency } from '@/utils/format'
import { minStockOf } from '@/utils/product'

const router = useRouter()
const productsStore = useProductsStore()
const salesStore = useSalesStore()
const purchaseOrdersStore = usePurchaseOrdersStore()

onMounted(async () => {
  await Promise.all([
    productsStore.loadProducts(),
    salesStore.loadSales(),
    purchaseOrdersStore.loadPurchaseOrders(),
  ])
})
</script>

<template>
  <div class="space-y-8">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Stock total"
        :value="productsStore.totalStock"
        :icon="Package"
        trend="Unidades en inventario"
      />
      <KpiCard
        label="Ventas hoy"
        :value="salesStore.salesToday.length"
        :icon="ShoppingCart"
        :trend="`${formatCurrency(salesStore.revenueToday)} facturado`"
        variant="success"
      />
      <KpiCard
        label="Ventas semana"
        :value="salesStore.salesWeek.length"
        :icon="TrendingUp"
        :trend="`${formatCurrency(salesStore.revenueWeek)} facturado`"
      />
      <KpiCard
        label="Stock bajo"
        :value="productsStore.lowStockProducts.length"
        :icon="AlertTriangle"
        trend="Productos bajo mínimo"
        :variant="productsStore.lowStockProducts.length > 0 ? 'warning' : 'default'"
      />
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="rounded-xl border border-border bg-surface-raised p-6 lg:col-span-2">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-sm font-medium text-zinc-300">Ingresos totales</h2>
          <DollarSign :size="18" class="text-accent" />
        </div>
        <p class="text-3xl font-semibold text-zinc-100">
          {{ formatCurrency(salesStore.totalRevenue) }}
        </p>
        <UsdEquivalent :bs="salesStore.totalRevenue" class="mt-0.5 block !text-sm" />
        <p class="mt-1 text-sm text-zinc-500">
          {{ salesStore.sales.length }} ventas registradas · ingreso neto
        </p>
        <p v-if="salesStore.returnsCount > 0" class="mt-2 text-sm text-danger">
          −{{ formatCurrency(salesStore.refundedTotalAll) }} en {{ salesStore.returnsCount }} devolución(es)
        </p>
      </div>

      <div class="rounded-xl border border-border bg-surface-raised p-6">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-sm font-medium text-zinc-300">Compras por recibir</h2>
          <Truck :size="18" class="text-amber-500" />
        </div>
        <p class="text-3xl font-semibold text-zinc-100">
          {{ purchaseOrdersStore.openPurchaseOrders.length }}
        </p>
        <p class="mt-1 text-sm text-zinc-500">
          {{ formatCurrency(purchaseOrdersStore.pendingPurchasesValue) }} en mercancía pendiente
        </p>
        <button
          type="button"
          class="mt-3 text-sm text-accent hover:underline"
          @click="router.push('/compras')"
        >
          Ver compras →
        </button>
      </div>
    </div>

    <!-- Low stock alert -->
    <div
      v-if="productsStore.lowStockProducts.length > 0"
      class="rounded-xl border border-warning/30 bg-warning/5 p-6"
    >
      <h2 class="mb-4 flex items-center gap-2 text-sm font-medium text-warning">
        <AlertTriangle :size="16" />
        Productos con stock bajo
      </h2>
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="product in productsStore.lowStockProducts.slice(0, 6)"
          :key="product.id"
          class="flex items-center justify-between rounded-lg bg-surface-raised px-4 py-2.5"
        >
          <div class="min-w-0">
            <p class="truncate text-sm text-zinc-200">
              {{ product.brand }} {{ product.model }}
            </p>
            <p class="text-xs text-zinc-500">Mín: {{ minStockOf(product) }}</p>
          </div>
          <span class="ml-2 font-medium text-warning">{{ product.stock }}</span>
        </div>
      </div>
      <button
        v-if="productsStore.lowStockProducts.length > 6"
        type="button"
        class="mt-3 text-sm text-accent hover:underline"
        @click="router.push({ name: 'inventory', query: { lowStock: '1' } })"
      >
        Ver todos ({{ productsStore.lowStockProducts.length }}) →
      </button>
    </div>

    <!-- Recent sales -->
    <div v-if="salesStore.sales.length > 0" class="rounded-xl border border-border bg-surface-raised p-6">
      <h2 class="mb-4 text-sm font-medium text-zinc-300">Últimas ventas</h2>
      <div class="space-y-2">
        <div
          v-for="sale in salesStore.sales.slice(0, 5)"
          :key="sale.id"
          class="flex items-center justify-between rounded-lg bg-surface-overlay px-4 py-2.5"
        >
          <div>
            <p class="text-sm text-zinc-200">{{ sale.customerName ?? 'Cliente general' }}</p>
            <p class="text-xs text-zinc-500">{{ sale.items.length }} producto(s)</p>
          </div>
          <span class="font-medium text-zinc-100">{{ formatCurrency(sale.total) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>