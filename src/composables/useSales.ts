import { computed, ref } from 'vue'
import type {
  DiscountType,
  InventoryMovement,
  PaymentMethod,
  Product,
  RefundMethod,
  Sale,
  SaleFilters,
  SaleItem,
  SaleReturn,
  SaleReturnItem,
} from '@/types'
import {
  executeReturnTransaction,
  executeSaleTransaction,
  getAllSales,
  saveSale,
} from '@/services/storage'
import { generateId } from '@/utils/id'
import { formatProductName } from '@/utils/product'
import {
  imeiMatchesQuery,
  isPhoneCategory,
  phoneImeiError,
  toStoredImeis,
  type ImeiDraft,
} from '@/utils/imei'
import {
  appleAccountError,
  toStoredAppleAccount,
  type AppleAccountDraft,
} from '@/utils/appleAccount'
import { useCurrency } from '@/composables/useCurrency'
import { useCloudBackup } from '@/composables/useCloudBackup'
import { isAfter, isBefore, parseISO, startOfDay, startOfWeek } from 'date-fns'

export interface CartItem {
  product: Product
  quantity: number
  /** Un par de IMEIs por unidad cuando el producto es un teléfono. */
  imeis: ImeiDraft[]
}

export interface Discount {
  type: DiscountType
  value: number
}

export interface TradeInEntry {
  product: Product
  quantity: number
  /** Valor acordado por unidad (crédito otorgado al cliente) */
  unitValue: number
  /** Un par de IMEIs por unidad cuando el equipo recibido es un teléfono. */
  imeis: ImeiDraft[]
}

/** Devuelve una copia plana (sin proxies reactivos) apta para IndexedDB. */
function toPlainSale(sale: Sale): Sale {
  return JSON.parse(JSON.stringify(sale))
}

export function useSales() {
  const sales = ref<Sale[]>([])
  const loading = ref(false)

  async function loadSales(): Promise<void> {
    loading.value = true
    try {
      sales.value = await getAllSales()
    } finally {
      loading.value = false
    }
  }

  function filterSales(filters: SaleFilters): Sale[] {
    let result = [...sales.value]

    if (filters.search) {
      const q = filters.search.toLowerCase()
      result = result.filter(
        (s) =>
          s.customerName?.toLowerCase().includes(q) ||
          s.customerPhone?.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.items.some(
            (i) =>
              i.productName.toLowerCase().includes(q) ||
              imeiMatchesQuery(i.imeis, q),
          ) ||
          s.tradeInItems?.some(
            (t) =>
              t.productName.toLowerCase().includes(q) ||
              imeiMatchesQuery(t.imeis, q),
          ),
      )
    }

    if (filters.dateFrom) {
      const from = startOfDay(parseISO(filters.dateFrom))
      result = result.filter((s) => !isBefore(parseISO(s.date), from))
    }

    if (filters.dateTo) {
      const to = startOfDay(parseISO(filters.dateTo))
      to.setHours(23, 59, 59, 999)
      result = result.filter((s) => !isAfter(parseISO(s.date), to))
    }

    return result
  }

  const salesToday = computed(() => {
    const today = startOfDay(new Date())
    return sales.value.filter((s) => !isBefore(parseISO(s.date), today))
  })

  const salesWeek = computed(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    return sales.value.filter((s) => !isBefore(parseISO(s.date), weekStart))
  })

  // Ingreso neto = total de la venta menos lo reembolsado por devoluciones.
  const netTotal = (s: Sale) => s.total - (s.refundedTotal ?? 0)

  const totalRevenue = computed(() => sales.value.reduce((sum, s) => sum + netTotal(s), 0))

  const revenueToday = computed(() => salesToday.value.reduce((sum, s) => sum + netTotal(s), 0))

  const revenueWeek = computed(() => salesWeek.value.reduce((sum, s) => sum + netTotal(s), 0))

  const refundedTotalAll = computed(() =>
    sales.value.reduce((sum, s) => sum + (s.refundedTotal ?? 0), 0),
  )

  const returnsCount = computed(() =>
    sales.value.reduce((sum, s) => sum + (s.returns?.length ?? 0), 0),
  )

  function validateCart(cart: CartItem[]): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    for (const item of cart) {
      if (item.quantity <= 0) {
        errors.push(`${item.product.brand} ${item.product.model}: cantidad inválida`)
      }
      if (item.quantity > item.product.stock) {
        errors.push(
          `${item.product.brand} ${item.product.model}: stock insuficiente (${item.product.stock} disponibles)`,
        )
      }
    }
    if (cart.length === 0) errors.push('El carrito está vacío')
    return { valid: errors.length === 0, errors }
  }

  /** Total de los productos antes de aplicar cualquier descuento. */
  function cartSubtotal(cart: CartItem[]): number {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  }

  /**
   * Monto monetario del descuento, acotado para que nunca sea negativo ni
   * mayor que el subtotal (porcentaje limitado a 0–100%).
   */
  function computeDiscountAmount(subtotal: number, discount?: Discount | null): number {
    if (!discount || !discount.value || discount.value <= 0) return 0
    if (discount.type === 'percent') {
      const pct = Math.min(discount.value, 100)
      return Math.round(subtotal * pct) / 100
    }
    return Math.min(discount.value, subtotal)
  }

  function cartTotal(cart: CartItem[], discount?: Discount | null): number {
    const subtotal = cartSubtotal(cart)
    return subtotal - computeDiscountAmount(subtotal, discount)
  }

  async function createSale(
    cart: CartItem[],
    paymentMethod: PaymentMethod,
    customerName?: string,
    customerPhone?: string,
    notes?: string,
    discount?: Discount | null,
    tradeInItems?: TradeInEntry[] | null,
    contactId?: string,
    credit?: { downPayment: number; dueDate?: string } | null,
    appleAccount?: AppleAccountDraft | null,
  ): Promise<Sale> {
    const validation = validateCart(cart)
    if (!validation.valid) throw new Error(validation.errors.join('\n'))

    const imeiError = phoneImeiError([
      ...cart.map((item) => ({
        label: `${item.product.brand} ${item.product.model}`,
        category: item.product.category,
        quantity: item.quantity,
        imeis: item.imeis,
      })),
      ...((paymentMethod === 'canje' ? tradeInItems : null) ?? []).map((item) => ({
        label: `Permuta ${item.product.brand} ${item.product.model}`,
        category: item.product.category,
        quantity: item.quantity,
        imeis: item.imeis,
      })),
    ])
    if (imeiError) throw new Error(imeiError)

    const accountError = appleAccount ? appleAccountError(appleAccount) : null
    if (accountError) throw new Error(accountError)

    const { exchangeRate } = useCurrency()
    const now = new Date().toISOString()
    const saleId = generateId()

    const items: SaleItem[] = cart.map((item) => {
      return {
        productId: item.product.id,
        productName: formatProductName(item.product),
        quantity: item.quantity,
        unitPrice: item.product.price,
        subtotal: item.product.price * item.quantity,
        imeis: isPhoneCategory(item.product.category)
          ? toStoredImeis(item.imeis, item.quantity)
          : undefined,
      }
    })

    const subtotal = cartSubtotal(cart)
    const discountAmount = computeDiscountAmount(subtotal, discount)

    const tradeIns =
      paymentMethod === 'canje' && tradeInItems
        ? tradeInItems.filter((t) => t.quantity > 0)
        : []
    const tradeInTotal = tradeIns.reduce((sum, t) => sum + (t.unitValue || 0) * t.quantity, 0)

    const saleTotal = subtotal - discountAmount
    const isCredit = paymentMethod === 'credito' && !!credit
    const creditDownPayment = isCredit
      ? Math.min(Math.max(credit!.downPayment || 0, 0), saleTotal)
      : undefined
    const creditBalance = isCredit ? saleTotal - creditDownPayment! : undefined

    const sale: Sale = {
      id: saleId,
      date: now,
      contactId,
      customerName,
      customerPhone,
      items,
      subtotal,
      discountType: discountAmount > 0 ? discount!.type : undefined,
      discountValue: discountAmount > 0 ? discount!.value : undefined,
      discountAmount: discountAmount > 0 ? discountAmount : undefined,
      total: subtotal - discountAmount,
      paymentMethod,
      tradeInItems: tradeIns.length
        ? tradeIns.map((t) => ({
            productId: t.product.id,
            productName: formatProductName(t.product),
            quantity: t.quantity,
            unitValue: t.unitValue || 0,
            imeis: isPhoneCategory(t.product.category)
              ? toStoredImeis(t.imeis, t.quantity)
              : undefined,
          }))
        : undefined,
      tradeInValue: tradeInTotal > 0 ? tradeInTotal : undefined,
      creditDownPayment,
      creditBalance,
      creditDueDate: isCredit ? credit!.dueDate : undefined,
      creditPaid: isCredit ? creditBalance! <= 0 : undefined,
      exchangeRate: exchangeRate.value,
      appleAccount: appleAccount ? toStoredAppleAccount(appleAccount) : undefined,
      notes,
      createdAt: now,
    }

    const movements = cart.map((item) => ({
      id: generateId(),
      date: now,
      type: 'out' as const,
      productId: item.product.id,
      quantity: item.quantity,
      reason: 'Venta',
      relatedSaleId: saleId,
    }))

    const stockUpdates = cart.map((item) => ({
      productId: item.product.id,
      newStock: item.product.stock - item.quantity,
    }))

    // El equipo recibido a cuenta entra al inventario (stock += cantidad).
    const tradeInMovements = tradeIns.map((t) => ({
      id: generateId(),
      date: now,
      type: 'in' as const,
      productId: t.product.id,
      quantity: t.quantity,
      reason: 'Equipo a cuenta',
      relatedSaleId: saleId,
    }))

    const tradeInStockUpdates = tradeIns.map((t) => ({
      productId: t.product.id,
      newStock: t.product.stock + t.quantity,
    }))

    await executeSaleTransaction({
      sale,
      movements: [...movements, ...tradeInMovements],
      stockUpdates: [...stockUpdates, ...tradeInStockUpdates],
    })
    await loadSales()

    // Respaldo automático en la nube (silencioso, no bloquea el flujo de venta).
    void useCloudBackup().maybeAutoBackup()

    return sale
  }

  /** Edita los datos de una venta ya registrada (precio, descuento, contacto…). */
  async function updateSale(id: string, patch: Partial<Sale>): Promise<Sale> {
    const existing = sales.value.find((s) => s.id === id)
    if (!existing) throw new Error('Venta no encontrada')
    // Copia plana: `existing` es un proxy reactivo y IndexedDB no puede clonarlo.
    const updated: Sale = toPlainSale({ ...existing, ...patch })
    await saveSale(updated)
    await loadSales()
    return updated
  }

  /**
   * Registra un abono contra el saldo pendiente de una venta a crédito.
   * Si queda saldo, `nextDueDate` actualiza la fecha del siguiente pago.
   */
  async function registerCreditPayment(
    id: string,
    amount: number,
    nextDueDate?: string,
  ): Promise<Sale> {
    const existing = sales.value.find((s) => s.id === id)
    if (!existing) throw new Error('Venta no encontrada')
    const currentBalance = existing.creditBalance ?? 0
    const applied = Math.min(Math.max(amount, 0), currentBalance)
    const newBalance = currentBalance - applied
    const creditDueDate = newBalance > 0 && nextDueDate ? nextDueDate : existing.creditDueDate
    const updated: Sale = toPlainSale({
      ...existing,
      creditBalance: newBalance,
      creditPaid: newBalance <= 0,
      creditDueDate,
      creditPayments: [
        ...(existing.creditPayments ?? []),
        {
          date: new Date().toISOString(),
          amount: applied,
          balanceAfter: newBalance,
          nextDueDate: newBalance > 0 ? creditDueDate : undefined,
        },
      ],
    })
    await saveSale(updated)
    await loadSales()
    return updated
  }

  /** Cantidad ya devuelta de un producto en una venta. */
  function returnedQty(sale: Sale, productId: string): number {
    return (sale.returns ?? []).reduce(
      (sum, r) => sum + r.items.filter((i) => i.productId === productId).reduce((s, i) => s + i.quantity, 0),
      0,
    )
  }

  /**
   * Registra una devolución (total o parcial) de una venta.
   * En ventas a crédito el reembolso reduce primero el saldo pendiente y solo
   * el excedente se devuelve en efectivo. Los ítems reingresados suman al stock.
   */
  async function registerReturn(
    saleId: string,
    data: {
      items: SaleReturnItem[]
      refundAmount: number
      refundMethod: RefundMethod
      reason: string
      notes?: string
    },
  ): Promise<Sale> {
    const existing = sales.value.find((s) => s.id === saleId)
    if (!existing) throw new Error('Venta no encontrada')
    const items = data.items.filter((i) => i.quantity > 0)
    if (items.length === 0) throw new Error('Selecciona al menos un producto a devolver')

    const now = new Date().toISOString()
    const refundAmount = Math.max(data.refundAmount, 0)

    // Crédito: reducir el saldo primero, reembolsar el excedente.
    let balanceApplied = 0
    let newCreditBalance = existing.creditBalance
    let creditPaid = existing.creditPaid
    if (existing.paymentMethod === 'credito') {
      const balance = existing.creditBalance ?? 0
      balanceApplied = Math.min(refundAmount, balance)
      newCreditBalance = balance - balanceApplied
      creditPaid = newCreditBalance <= 0
    }

    const saleReturn: SaleReturn = {
      id: generateId(),
      date: now,
      items,
      refundAmount,
      balanceApplied,
      refundMethod: data.refundMethod,
      reason: data.reason,
      notes: data.notes,
    }

    const returns = [...(existing.returns ?? []), saleReturn]
    const refundedTotal = (existing.refundedTotal ?? 0) + refundAmount

    const returnedByProduct = new Map<string, number>()
    for (const r of returns) {
      for (const it of r.items) {
        returnedByProduct.set(it.productId, (returnedByProduct.get(it.productId) ?? 0) + it.quantity)
      }
    }
    const fullyReturned = existing.items.every(
      (it) => (returnedByProduct.get(it.productId) ?? 0) >= it.quantity,
    )

    const updated: Sale = toPlainSale({
      ...existing,
      returns,
      refundedTotal,
      returnStatus: fullyReturned ? 'full' : 'partial',
      creditBalance: newCreditBalance,
      creditPaid,
    })

    const restockItems = items.filter((i) => i.restocked)
    const movements: InventoryMovement[] = restockItems.map((i) => ({
      id: generateId(),
      date: now,
      type: 'in' as const,
      productId: i.productId,
      quantity: i.quantity,
      reason: 'Devolución',
      relatedSaleId: saleId,
    }))
    const restock = restockItems.map((i) => ({ productId: i.productId, quantity: i.quantity }))

    await executeReturnTransaction({ sale: updated, movements, restock })
    await loadSales()
    return updated
  }

  return {
    sales,
    loading,
    salesToday,
    salesWeek,
    totalRevenue,
    revenueToday,
    revenueWeek,
    refundedTotalAll,
    returnsCount,
    loadSales,
    filterSales,
    validateCart,
    cartSubtotal,
    computeDiscountAmount,
    cartTotal,
    createSale,
    updateSale,
    registerCreditPayment,
    returnedQty,
    registerReturn,
  }
}