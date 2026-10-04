import Dexie, { type Table } from 'dexie'
import { assertUnlocked, AUTH_META_KEY } from '@/services/authSession'
import type {
  AppMeta,
  Contact,
  InventoryMovement,
  Product,
  PurchaseOrder,
  Sale,
  StoredFile,
} from '@/types'

const DB_NAME = 'iloc-inventory'
const OPFS_ROOT = 'product-images'
const META_SEEDED_KEY = 'seeded'
const META_PO_COUNTER_KEY = 'po_counter'

export type StorageBackend = 'opfs' | 'dexie'

class InventoryDatabase extends Dexie {
  products!: Table<Product, string>
  sales!: Table<Sale, string>
  inventoryMovements!: Table<InventoryMovement, string>
  contacts!: Table<Contact, string>
  purchaseOrders!: Table<PurchaseOrder, string>
  files!: Table<StoredFile, string>
  meta!: Table<AppMeta, string>
  backupFolder!: Table<BackupFolderRecord, string>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({
      products: 'id, sku, brand, model, category, stock, updatedAt',
      sales: 'id, date, customerName, createdAt',
      inventoryMovements: 'id, date, type, productId, relatedSaleId',
      orders: 'id, date, status, customerName, createdAt',
      files: 'path, createdAt',
      meta: 'key',
    })
    this.version(2).stores({
      products: 'id, sku, brand, model, category, condition, stock, updatedAt',
      sales: 'id, date, customerName, createdAt',
      inventoryMovements: 'id, date, type, productId, relatedSaleId',
      orders: 'id, date, status, customerName, createdAt',
      files: 'path, createdAt',
      meta: 'key',
    }).upgrade(async (tx) => {
      await tx
        .table('products')
        .toCollection()
        .modify((p: Product) => {
          if (p.category === 'celular' && !p.condition) {
            p.condition = 'nuevo'
          }
        })
    })
    this.version(3).stores({
      products: 'id, sku, brand, model, category, condition, stock, updatedAt',
      sales: 'id, date, contactId, customerName, createdAt',
      inventoryMovements: 'id, date, type, productId, relatedSaleId',
      orders: 'id, date, status, customerName, createdAt',
      contacts: 'id, name, phone, updatedAt',
      files: 'path, createdAt',
      meta: 'key',
    })
    // v4: se elimina el módulo de pedidos (tabla orders) y se clasifica el
    // contacto como cliente/proveedor (campo type, sin índice).
    this.version(4)
      .stores({
        orders: null,
        contacts: 'id, name, type, phone, updatedAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('contacts')
          .toCollection()
          .modify((c: Contact) => {
            if (!c.type) c.type = 'customer'
          })
      })
    // v5: módulo de pedidos de compra (reposición de inventario a proveedores).
    this.version(5).stores({
      purchaseOrders: 'id, code, date, supplierId, status, createdAt',
    })
    // v6: carpeta elegida para respaldos en la nube (guarda el FileSystemHandle,
    // que es clonable estructuralmente y persiste entre sesiones).
    this.version(6).stores({
      backupFolder: 'id',
    })
  }
}

export interface BackupFolderRecord {
  id: string
  handle: FileSystemDirectoryHandle
}

export const db = new InventoryDatabase()

let opfsRoot: FileSystemDirectoryHandle | null = null
let storageBackend: StorageBackend = 'dexie'

/** Detecta si OPFS está disponible en el navegador */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.getDirectory === 'function'
  )
}

export function getStorageBackend(): StorageBackend {
  return storageBackend
}

async function initOpfs(): Promise<boolean> {
  if (!isOpfsSupported()) return false
  try {
    const root = await navigator.storage.getDirectory()
    opfsRoot = await root.getDirectoryHandle(OPFS_ROOT, { create: true })
    storageBackend = 'opfs'
    return true
  } catch {
    storageBackend = 'dexie'
    return false
  }
}

/**
 * Solicita almacenamiento persistente al navegador para que los datos (IndexedDB
 * y OPFS) no sean desalojados bajo presión de disco. Es la mejor garantía para
 * que la base de datos local sobreviva reinicios y limpiezas automáticas.
 */
async function requestPersistentStorage(): Promise<void> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function' &&
      typeof navigator.storage.persisted === 'function'
    ) {
      const already = await navigator.storage.persisted()
      if (!already) await navigator.storage.persist()
    }
  } catch {
    // No soportado: los datos siguen en IndexedDB, pero el navegador podría
    // desalojarlos si el disco se llena. No es un error fatal.
  }
}

export async function initStorage(): Promise<StorageBackend> {
  await db.open()
  await initOpfs()
  await requestPersistentStorage()
  return storageBackend
}

// ─── Meta ───────────────────────────────────────────────────────────────────

export async function getMeta(key: string): Promise<string | undefined> {
  const row = await db.meta.get(key)
  return row?.value
}

export async function setMeta(key: string, value: string): Promise<void> {
  if (key !== AUTH_META_KEY) assertUnlocked()
  await db.meta.put({ key, value })
}

export async function isSeeded(): Promise<boolean> {
  return (await getMeta(META_SEEDED_KEY)) === 'true'
}

export async function markSeeded(): Promise<void> {
  await setMeta(META_SEEDED_KEY, 'true')
}

// ─── Backup folder handle ─────────────────────────────────────────────────────

const BACKUP_FOLDER_ID = 'dir'

export async function saveBackupFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  assertUnlocked()
  await db.backupFolder.put({ id: BACKUP_FOLDER_ID, handle })
}

export async function getBackupFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const row = await db.backupFolder.get(BACKUP_FOLDER_ID)
  return row?.handle ?? null
}

export async function clearBackupFolderHandle(): Promise<void> {
  assertUnlocked()
  await db.backupFolder.delete(BACKUP_FOLDER_ID)
}

// ─── Products ───────────────────────────────────────────────────────────────

function withoutSku<T extends object>(record: T): T {
  if (!('sku' in record)) return record
  const copy = { ...record }
  delete (copy as { sku?: unknown }).sku
  return copy
}

export async function getAllProducts(): Promise<Product[]> {
  const products = await db.products.orderBy('updatedAt').reverse().toArray()
  return products.map(withoutSku)
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const product = await db.products.get(id)
  return product ? withoutSku(product) : undefined
}

export async function saveProduct(product: Product): Promise<void> {
  assertUnlocked()
  await db.products.put(withoutSku(product))
}

export async function deleteProduct(id: string): Promise<void> {
  assertUnlocked()
  await db.products.delete(id)
}

// ─── Sales ──────────────────────────────────────────────────────────────────

export async function getAllSales(): Promise<Sale[]> {
  return db.sales.orderBy('date').reverse().toArray()
}

export async function getSaleById(id: string): Promise<Sale | undefined> {
  return db.sales.get(id)
}

export async function saveSale(sale: Sale): Promise<void> {
  assertUnlocked()
  await db.sales.put(sale)
}

// ─── Inventory Movements ────────────────────────────────────────────────────

export async function getAllMovements(): Promise<InventoryMovement[]> {
  return db.inventoryMovements.orderBy('date').reverse().toArray()
}

export async function saveMovement(movement: InventoryMovement): Promise<void> {
  assertUnlocked()
  await db.inventoryMovements.put(movement)
}

// ─── Contacts ───────────────────────────────────────────────────────────────

export async function getAllContacts(): Promise<Contact[]> {
  return db.contacts.orderBy('name').toArray()
}

export async function getContactById(id: string): Promise<Contact | undefined> {
  return db.contacts.get(id)
}

export async function saveContact(contact: Contact): Promise<void> {
  assertUnlocked()
  await db.contacts.put(contact)
}

export async function deleteContact(id: string): Promise<void> {
  assertUnlocked()
  await db.contacts.delete(id)
}

/**
 * Guarda ventas históricas importadas y sus clientes nuevos en una sola
 * transacción. No toca productos ni movimientos de inventario.
 */
export async function importHistoricalSales(data: { sales: Sale[]; contacts: Contact[] }): Promise<void> {
  assertUnlocked()
  await db.transaction('rw', db.sales, db.contacts, async () => {
    if (data.contacts.length) await db.contacts.bulkAdd(data.contacts)
    if (data.sales.length) await db.sales.bulkAdd(data.sales)
  })
}

/**
 * Aplica la importación de inventario en una sola transacción: productos
 * nuevos, productos actualizados y las entradas de stock.
 */
export async function importInventory(data: {
  newProducts: Product[]
  updatedProducts: Product[]
  movements: InventoryMovement[]
}): Promise<void> {
  assertUnlocked()
  await db.transaction('rw', db.products, db.inventoryMovements, async () => {
    if (data.newProducts.length) await db.products.bulkAdd(data.newProducts)
    if (data.updatedProducts.length) await db.products.bulkPut(data.updatedProducts)
    if (data.movements.length) await db.inventoryMovements.bulkAdd(data.movements)
  })
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

export async function getAllPurchaseOrders(): Promise<PurchaseOrder[]> {
  return db.purchaseOrders.orderBy('createdAt').reverse().toArray()
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder | undefined> {
  return db.purchaseOrders.get(id)
}

export async function savePurchaseOrder(order: PurchaseOrder): Promise<void> {
  assertUnlocked()
  await db.purchaseOrders.put(order)
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  assertUnlocked()
  await db.purchaseOrders.delete(id)
}

/** Genera el siguiente folio consecutivo de orden de compra (OC-0001, OC-0002, …) */
export async function nextPurchaseOrderCode(): Promise<string> {
  const next = Number((await getMeta(META_PO_COUNTER_KEY)) ?? '0') + 1
  await setMeta(META_PO_COUNTER_KEY, String(next))
  return `OC-${String(next).padStart(4, '0')}`
}

export interface ReceivePurchaseOrderData {
  /** Orden con receivedQuantity/estado actualizados y vínculos de producto ya resueltos */
  order: PurchaseOrder
  /** Modelos nuevos a crear en el catálogo */
  newProducts: Product[]
  /** Incrementos de stock/costo para productos existentes */
  stockUpdates: { productId: string; stock: number; cost: number; price?: number }[]
  /** Movimientos de entrada generados por la recepción */
  movements: InventoryMovement[]
}

export async function executeReceivePurchaseOrder(data: ReceivePurchaseOrderData): Promise<void> {
  assertUnlocked()
  const now = new Date().toISOString()
  await db.transaction('rw', db.products, db.inventoryMovements, db.purchaseOrders, async () => {
    for (const product of data.newProducts) {
      await db.products.put(product)
    }
    for (const u of data.stockUpdates) {
      await db.products.update(u.productId, {
        stock: u.stock,
        cost: u.cost,
        ...(u.price ? { price: u.price } : {}),
        updatedAt: now,
      })
    }
    for (const movement of data.movements) {
      await db.inventoryMovements.put(movement)
    }
    await db.purchaseOrders.put(data.order)
  })
}

// ─── File Storage (OPFS + Dexie fallback) ───────────────────────────────────

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function saveFile(
  file: File,
  subfolder = 'products',
): Promise<string> {
  assertUnlocked()
  const fileName = `${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
  const path = `${subfolder}/${fileName}`

  if (storageBackend === 'opfs' && opfsRoot) {
    const parts = path.split('/')
    let dir = opfsRoot
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i]!, { create: true })
    }
    const handle = await dir.getFileHandle(parts.at(-1)!, { create: true })
    const writable = await handle.createWritable()
    await writable.write(file)
    await writable.close()
  } else {
    await db.files.put({
      path,
      mimeType: file.type,
      data: file,
      createdAt: new Date().toISOString(),
    })
  }

  return path
}

export async function readFile(path: string): Promise<Blob | null> {
  if (storageBackend === 'opfs' && opfsRoot) {
    try {
      const parts = path.split('/')
      let dir: FileSystemDirectoryHandle = opfsRoot
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i]!)
      }
      const handle = await dir.getFileHandle(parts.at(-1)!)
      return await handle.getFile()
    } catch {
      // fallback to dexie
    }
  }

  const stored = await db.files.get(path)
  return stored?.data ?? null
}

export async function getFileUrl(path: string): Promise<string | null> {
  const blob = await readFile(path)
  if (!blob) return null
  return URL.createObjectURL(blob)
}

export async function deleteFile(path: string): Promise<void> {
  assertUnlocked()
  if (storageBackend === 'opfs' && opfsRoot) {
    try {
      const parts = path.split('/')
      let dir: FileSystemDirectoryHandle = opfsRoot
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i]!)
      }
      await dir.removeEntry(parts.at(-1)!)
      return
    } catch {
      // fallback
    }
  }
  await db.files.delete(path)
}

// ─── Transactions ───────────────────────────────────────────────────────────

export interface SaleTransactionData {
  sale: Sale
  movements: InventoryMovement[]
  stockUpdates: { productId: string; newStock: number }[]
}

export async function executeSaleTransaction(data: SaleTransactionData): Promise<void> {
  assertUnlocked()
  await db.transaction('rw', db.products, db.sales, db.inventoryMovements, async () => {
    for (const update of data.stockUpdates) {
      await db.products.update(update.productId, { stock: update.newStock })
    }
    await db.sales.put(data.sale)
    for (const movement of data.movements) {
      await db.inventoryMovements.put(movement)
    }
  })
}

export interface ReturnTransactionData {
  sale: Sale
  movements: InventoryMovement[]
  /** Productos a reingresar al stock (incremento relativo) */
  restock: { productId: string; quantity: number }[]
}

export async function executeReturnTransaction(data: ReturnTransactionData): Promise<void> {
  assertUnlocked()
  await db.transaction('rw', db.products, db.sales, db.inventoryMovements, async () => {
    for (const r of data.restock) {
      const product = await db.products.get(r.productId)
      if (product) await db.products.update(r.productId, { stock: product.stock + r.quantity })
    }
    await db.sales.put(data.sale)
    for (const movement of data.movements) {
      await db.inventoryMovements.put(movement)
    }
  })
}

export interface StockAdjustmentData {
  product: Product
  movement: InventoryMovement
}

export async function executeStockAdjustment(data: StockAdjustmentData): Promise<void> {
  assertUnlocked()
  await db.transaction('rw', db.products, db.inventoryMovements, async () => {
    await db.products.put(data.product)
    await db.inventoryMovements.put(data.movement)
  })
}

// ─── Export / Import ────────────────────────────────────────────────────────

export interface AppSettingsExport {
  exchangeRate?: number
  showUsd?: boolean
  storeName?: string
  storeDescription?: string
  storePhone?: string
  storeAddress?: string
}

export interface ExportData {
  version: 1
  exportedAt: string
  products: Product[]
  sales: Sale[]
  inventoryMovements: InventoryMovement[]
  contacts?: Contact[]
  purchaseOrders?: PurchaseOrder[]
  settings?: AppSettingsExport
}

export async function exportAllData(): Promise<ExportData> {
  const [products, sales, inventoryMovements, contacts, purchaseOrders] = await Promise.all([
    db.products.toArray(),
    db.sales.toArray(),
    db.inventoryMovements.toArray(),
    db.contacts.toArray(),
    db.purchaseOrders.toArray(),
  ])
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    products: products.map(withoutSku),
    sales,
    inventoryMovements,
    contacts,
    purchaseOrders: purchaseOrders.map((order) => ({
      ...order,
      items: order.items.map(withoutSku),
    })),
  }
}

export async function importAllData(data: ExportData, replace = true): Promise<void> {
  assertUnlocked()
  await db.transaction(
    'rw',
    db.products,
    db.sales,
    db.inventoryMovements,
    db.contacts,
    db.purchaseOrders,
    async () => {
      if (replace) {
        await Promise.all([
          db.products.clear(),
          db.sales.clear(),
          db.inventoryMovements.clear(),
          db.contacts.clear(),
          db.purchaseOrders.clear(),
        ])
      }
      await db.products.bulkPut(data.products.map(withoutSku))
      await db.sales.bulkPut(data.sales)
      await db.inventoryMovements.bulkPut(data.inventoryMovements)
      if (data.contacts?.length) await db.contacts.bulkPut(data.contacts)
      if (data.purchaseOrders?.length) await db.purchaseOrders.bulkPut(data.purchaseOrders)
    },
  )
}
