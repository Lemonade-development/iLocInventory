import { computed, ref } from 'vue'
import type {
  InventoryMovement,
  Product,
  PurchaseOrder,
  PurchaseOrderFormData,
  PurchaseOrderItem,
} from '@/types'
import {
  deletePurchaseOrder,
  executeReceivePurchaseOrder,
  getAllProducts,
  getAllPurchaseOrders,
  getProductById,
  nextPurchaseOrderCode,
  savePurchaseOrder,
} from '@/services/storage'
import { generateId } from '@/utils/id'
import { productMatchKey } from '@/utils/product'
import { useCurrency } from '@/composables/useCurrency'

/** Cantidades a recibir por índice de línea de la orden */
export type ReceiptQuantities = Record<number, number>

function normalizeItem(item: PurchaseOrderItem): PurchaseOrderItem {
  return {
    ...item,
    quantity: Number(item.quantity) || 0,
    receivedQuantity: Number(item.receivedQuantity) || 0,
    unitCost: Number(item.unitCost) || 0,
    price: item.price != null ? Number(item.price) : undefined,
  }
}

function computeTotals(items: PurchaseOrderItem[]): { subtotal: number; total: number } {
  const subtotal = items.reduce((sum, i) => sum + i.unitCost * i.quantity, 0)
  return { subtotal, total: subtotal }
}

function itemToProduct(item: PurchaseOrderItem, stock: number): Product {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    brand: item.brand,
    model: item.model,
    variant: item.variant || undefined,
    category: item.category,
    condition: item.condition,
    price: item.price ?? 0,
    cost: item.unitCost,
    stock,
    minStock: 5,
    createdAt: now,
    updatedAt: now,
  }
}

export function usePurchaseOrders() {
  const purchaseOrders = ref<PurchaseOrder[]>([])
  const loading = ref(false)

  async function loadPurchaseOrders(): Promise<void> {
    loading.value = true
    try {
      purchaseOrders.value = await getAllPurchaseOrders()
    } finally {
      loading.value = false
    }
  }

  /** Órdenes aún por recibir (pendientes o parcialmente recibidas) */
  const openPurchaseOrders = computed(() =>
    purchaseOrders.value.filter((o) => o.status === 'pending' || o.status === 'partial'),
  )

  /** Costo estimado de la mercancía aún por recibir (líneas pendientes de órdenes abiertas) */
  const pendingPurchasesValue = computed(() =>
    openPurchaseOrders.value.reduce(
      (sum, o) =>
        sum +
        o.items.reduce(
          (s, i) => s + Math.max(0, i.quantity - i.receivedQuantity) * i.unitCost,
          0,
        ),
      0,
    ),
  )

  function getPurchaseOrderById(id: string): PurchaseOrder | undefined {
    return purchaseOrders.value.find((o) => o.id === id)
  }

  async function createPurchaseOrder(data: PurchaseOrderFormData): Promise<PurchaseOrder> {
    const { exchangeRate } = useCurrency()
    const now = new Date().toISOString()
    const items = data.items.map(normalizeItem)
    const { subtotal, total } = computeTotals(items)
    const order: PurchaseOrder = {
      id: generateId(),
      code: await nextPurchaseOrderCode(),
      date: now,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      items,
      status: 'pending',
      subtotal,
      total,
      expectedDate: data.expectedDate,
      exchangeRate: exchangeRate.value,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    }
    await savePurchaseOrder(order)
    await loadPurchaseOrders()
    return order
  }

  /** Edita una orden que aún no tiene recepciones registradas */
  async function updatePurchaseOrder(id: string, data: PurchaseOrderFormData): Promise<PurchaseOrder> {
    const existing = getPurchaseOrderById(id)
    if (!existing) throw new Error('Pedido de compra no encontrado')
    if (existing.status !== 'pending') {
      throw new Error('Solo se puede editar un pedido pendiente sin recepciones')
    }
    const items = data.items.map(normalizeItem)
    const { subtotal, total } = computeTotals(items)
    const updated: PurchaseOrder = {
      ...existing,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      items,
      subtotal,
      total,
      expectedDate: data.expectedDate,
      notes: data.notes,
      updatedAt: new Date().toISOString(),
    }
    await savePurchaseOrder(updated)
    await loadPurchaseOrders()
    return updated
  }

  async function cancelPurchaseOrder(id: string): Promise<void> {
    const existing = getPurchaseOrderById(id)
    if (!existing) throw new Error('Pedido de compra no encontrado')
    await savePurchaseOrder({
      ...existing,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    })
    await loadPurchaseOrders()
  }

  async function removePurchaseOrder(id: string): Promise<void> {
    await deletePurchaseOrder(id)
    await loadPurchaseOrders()
  }

  /**
   * Registra la recepción de mercancía: incrementa el stock de los productos
   * vinculados, crea en el catálogo los modelos nuevos y genera los movimientos
   * de entrada correspondientes. `receipts` indica cuánto recibir por línea;
   * si se omite, se reciben todas las cantidades pendientes.
   */
  async function receivePurchaseOrder(id: string, receipts?: ReceiptQuantities): Promise<void> {
    const source = getPurchaseOrderById(id)
    if (!source) throw new Error('Pedido de compra no encontrado')
    if (source.status === 'received' || source.status === 'cancelled') {
      throw new Error('El pedido ya no admite recepciones')
    }

    const now = new Date().toISOString()
    const items = source.items.map((i) => ({ ...i }))
    const newProducts: Product[] = []
    const movements: InventoryMovement[] = []
    // Acumula incrementos por producto existente (una misma referencia puede
    // aparecer en varias líneas) partiendo de su stock actual.
    const stockMap = new Map<string, { base: Product; add: number; cost: number; price?: number }>()
    // Una línea sin vincular se reconoce por marca, modelo, variante y condición:
    // así recibir "iPhone 13 Pro Azul sierra 256GB" suma al del catálogo en lugar de duplicarlo.
    const byKey = new Map((await getAllProducts()).map((p) => [productMatchKey(p), p]))
    const createdByKey = new Map<string, Product>()

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]
      const remaining = item.quantity - item.receivedQuantity
      if (remaining <= 0) continue
      const requested = receipts ? Math.max(0, Math.floor(receipts[idx] ?? 0)) : remaining
      const qty = Math.min(requested, remaining)
      if (qty <= 0) continue

      const key = productMatchKey(item)
      const linked = item.productId ? await getProductById(item.productId) : undefined
      const existing = linked ?? byKey.get(key)
      const created = existing ? undefined : createdByKey.get(key)

      if (existing) {
        item.productId = existing.id
        const entry = stockMap.get(existing.id) ?? { base: existing, add: 0, cost: item.unitCost }
        entry.add += qty
        entry.cost = item.unitCost
        // Un producto sin precio (como los del catálogo) toma el precio de venta de la orden.
        if (!existing.price && item.price) entry.price = item.price
        stockMap.set(existing.id, entry)
      } else if (created) {
        // Otra línea de esta misma recepción ya creó el producto.
        created.stock += qty
        item.productId = created.id
      } else {
        const product = itemToProduct(item, qty)
        newProducts.push(product)
        createdByKey.set(key, product)
        // Persiste el vínculo para que recepciones parciales futuras sumen al
        // mismo producto en lugar de crear duplicados.
        item.productId = product.id
      }

      movements.push({
        id: generateId(),
        date: now,
        type: 'in',
        productId: item.productId!,
        quantity: qty,
        reason: `Compra ${source.code}`,
        notes: item.notes,
      })
      item.receivedQuantity += qty
    }

    if (movements.length === 0) {
      throw new Error('No hay cantidades pendientes por recibir')
    }

    const stockUpdates = [...stockMap.values()].map((e) => ({
      productId: e.base.id,
      stock: e.base.stock + e.add,
      cost: e.cost,
      ...(e.price ? { price: e.price } : {}),
    }))

    const allReceived = items.every((i) => i.receivedQuantity >= i.quantity)
    const status: PurchaseOrder['status'] = allReceived ? 'received' : 'partial'

    const order: PurchaseOrder = { ...source, items, status, updatedAt: now }

    await executeReceivePurchaseOrder({ order, newProducts, stockUpdates, movements })
    await loadPurchaseOrders()
  }

  return {
    purchaseOrders,
    loading,
    openPurchaseOrders,
    pendingPurchasesValue,
    loadPurchaseOrders,
    getPurchaseOrderById,
    createPurchaseOrder,
    updatePurchaseOrder,
    cancelPurchaseOrder,
    removePurchaseOrder,
    receivePurchaseOrder,
  }
}
