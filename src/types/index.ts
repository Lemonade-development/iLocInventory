export type ProductCategory =
  | 'celular'
  | 'tablet'
  | 'smartwatch'
  | 'computadora'
  | 'accesorio'
  | 'otro'
export type ProductCondition = 'nuevo' | 'segunda_mano'
export type PaymentMethod =
  | 'efectivo'
  | 'tarjeta'
  | 'transferencia'
  | 'canje'
  | 'credito'
  | 'otro'
export type DiscountType = 'percent' | 'fixed'
export type MovementType = 'in' | 'out' | 'adjustment'

export interface Product {
  id: string
  brand: string
  model: string
  variant?: string
  category: ProductCategory
  condition?: ProductCondition
  /** Salud de batería, 1–100. Solo productos de segunda mano. */
  batteryHealth?: number
  price: number
  cost: number
  stock: number
  minStock?: number
  imei?: string
  specs?: Record<string, unknown>
  imagePath?: string
  createdAt: string
  updatedAt: string
}

/** Cuenta Apple creada para el cliente durante la venta. */
export interface AppleAccount {
  appleId: string
  password?: string
}

export interface DeviceImeis {
  imei: string
  /** Segunda línea o eSIM. Solo si se capturó en la venta. */
  imei2?: string
}

export interface SaleItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
  /** IMEIs de los teléfonos vendidos, un par por unidad. Se capturan en la venta. */
  imeis?: DeviceImeis[]
}

/** Equipo recibido a cuenta (canje / trade-in); entra al inventario */
export interface TradeInItem {
  productId: string
  productName: string
  quantity: number
  /** Valor acordado por unidad (crédito otorgado al cliente) */
  unitValue: number
  /** IMEIs de los teléfonos recibidos en permuta, un par por unidad. */
  imeis?: DeviceImeis[]
}

export type RefundMethod = 'efectivo' | 'tarjeta' | 'transferencia'

export interface SaleReturnItem {
  productId: string
  productName: string
  quantity: number
  /** Monto reembolsado por unidad (precio pagado con descuento prorrateado) */
  refundPerUnit: number
  /** Si el producto se reingresó al inventario (revendible) */
  restocked: boolean
}

/** Devolución (total o parcial) de una venta */
export interface SaleReturn {
  id: string
  date: string
  items: SaleReturnItem[]
  /** Monto total reembolsado al cliente (editable por cargos/parciales) */
  refundAmount: number
  /** Parte del reembolso aplicada a reducir el saldo de una venta a crédito */
  balanceApplied: number
  /** Método del reembolso en efectivo (excedente tras aplicar a saldo) */
  refundMethod: RefundMethod
  reason: string
  notes?: string
}

export type ContactType = 'customer' | 'supplier'

export interface Contact {
  id: string
  name: string
  /** Clasificación del contacto: cliente (ventas) o proveedor (compras) */
  type: ContactType
  phone?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

/** Abono registrado después de la venta contra el saldo a crédito. */
export interface CreditPayment {
  date: string
  amount: number
  /** Saldo que quedó después del abono. Los abonos viejos no lo tienen. */
  balanceAfter?: number
  /** Fecha del siguiente pago acordada en ese momento, si quedó saldo. */
  nextDueDate?: string
}

export interface Sale {
  id: string
  date: string
  /** Contacto asociado a la venta (para el historial de compras del cliente) */
  contactId?: string
  customerName?: string
  customerPhone?: string
  items: SaleItem[]
  /** Total de los productos antes de aplicar descuento */
  subtotal?: number
  discountType?: DiscountType
  /** Valor ingresado por el usuario (porcentaje o monto fijo) */
  discountValue?: number
  /** Monto monetario efectivamente descontado */
  discountAmount?: number
  total: number
  paymentMethod: PaymentMethod
  /** Equipos recibidos a cuenta (canje / trade-in) */
  tradeInItems?: TradeInItem[]
  /** Valor total acordado del canje, que reduce el saldo a pagar */
  tradeInValue?: number
  /** Venta a crédito: abono inicial pagado al momento de la venta */
  creditDownPayment?: number
  /** Saldo pendiente por cobrar en una venta a crédito */
  creditBalance?: number
  /** Fecha acordada para el pago final (YYYY-MM-DD) */
  creditDueDate?: string
  /** Si el saldo a crédito ya fue liquidado */
  creditPaid?: boolean
  /** Abonos registrados después de la venta (para saldar el crédito) */
  creditPayments?: CreditPayment[]
  /** Devoluciones registradas contra esta venta */
  returns?: SaleReturn[]
  /** Suma reembolsada por devoluciones (reduce el ingreso neto) */
  refundedTotal?: number
  /** Estado de devolución de la venta */
  returnStatus?: 'partial' | 'full'
  /** Tipo de cambio (Bs por 1 USD) vigente al crear la venta; congela el equivalente en USD del histórico */
  exchangeRate?: number
  /** Cuenta Apple entregada al cliente. Opcional. */
  appleAccount?: AppleAccount
  notes?: string
  createdAt: string
}

export interface InventoryMovement {
  id: string
  date: string
  type: MovementType
  productId: string
  quantity: number
  reason: string
  relatedSaleId?: string
  notes?: string
}

export type PurchaseOrderStatus = 'pending' | 'partial' | 'received' | 'cancelled'

export interface PurchaseOrderItem {
  /** Producto existente vinculado; ausente si es un modelo nuevo aún no catalogado */
  productId?: string
  brand: string
  model: string
  variant?: string
  category: ProductCategory
  condition: ProductCondition
  /** Precio de venta sugerido; se usa al crear el producto si es un modelo nuevo */
  price?: number
  /** Cantidad solicitada al proveedor */
  quantity: number
  /** Cantidad ya recibida e ingresada a inventario (para recepciones parciales) */
  receivedQuantity: number
  /** Costo unitario acordado con el proveedor */
  unitCost: number
  notes?: string
}

export interface PurchaseOrder {
  id: string
  /** Folio consecutivo, p. ej. OC-0001 */
  code: string
  date: string
  supplierId?: string
  /** Nombre del proveedor (desnormalizado para conservar el historial) */
  supplierName: string
  items: PurchaseOrderItem[]
  status: PurchaseOrderStatus
  subtotal: number
  total: number
  /** Fecha estimada de entrega (YYYY-MM-DD) */
  expectedDate?: string
  /** Tipo de cambio (Bs por 1 USD) vigente al crear la orden; congela el equivalente en USD del histórico */
  exchangeRate?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface PurchaseOrderFormData {
  supplierId?: string
  supplierName: string
  expectedDate?: string
  notes?: string
  items: PurchaseOrderItem[]
}

export interface StoredFile {
  path: string
  mimeType: string
  data: Blob
  createdAt: string
}

export interface AppMeta {
  key: string
  value: string
}

export interface DashboardKPIs {
  totalStock: number
  salesToday: number
  salesWeek: number
  lowStockCount: number
  totalRevenue: number
  revenueToday: number
  revenueWeek: number
}

export type InventoryTableColumn =
  | 'product'
  | 'batteryHealth'
  | 'category'
  | 'condition'
  | 'price'
  | 'stock'

export type InventoryTableSortKey = InventoryTableColumn

export interface TableSortState {
  sortBy: InventoryTableSortKey | null
  sortDir: 'asc' | 'desc' | null
}

export interface ProductFilters {
  search: string
  brand: string
  category: ProductCategory | ''
  condition: ProductCondition | ''
  lowStockOnly: boolean
  sortBy: InventoryTableSortKey | null
  sortDir: 'asc' | 'desc' | null
}

export interface SaleFilters {
  search: string
  dateFrom: string
  dateTo: string
}

export type ProductFormData = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>

export type ContactFormData = Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>