import { computed, ref } from 'vue'
import type { Product, ProductFilters, ProductFormData } from '@/types'
import {
  deleteProduct as dbDeleteProduct,
  getAllProducts,
  saveProduct,
} from '@/services/storage'
import { generateId } from '@/utils/id'
import { isLowStock, matchesProductSearch } from '@/utils/product'

export function useProducts() {
  const products = ref<Product[]>([])
  const loading = ref(false)

  async function loadProducts(): Promise<void> {
    loading.value = true
    try {
      products.value = await getAllProducts()
    } finally {
      loading.value = false
    }
  }

  function filterProducts(filters: ProductFilters): Product[] {
    let result = [...products.value]

    if (filters.search.trim()) {
      result = result.filter((p) => matchesProductSearch(p, filters.search))
    }

    if (filters.brand) {
      result = result.filter((p) => p.brand === filters.brand)
    }

    if (filters.category) {
      result = result.filter((p) => p.category === filters.category)
    }

    if (filters.condition) {
      result = result.filter((p) => p.condition === filters.condition)
    }

    if (filters.lowStockOnly) {
      result = result.filter(isLowStock)
    }

    if (filters.sortBy && filters.sortDir) {
      const dir = filters.sortDir === 'asc' ? 1 : -1
      result.sort((a, b) => compareProducts(a, b, filters.sortBy!, dir))
    }

    return result
  }

  function getProductDisplayName(product: Product): string {
    return [product.brand, product.model, product.variant].filter(Boolean).join(' ')
  }

  function compareProducts(a: Product, b: Product, key: ProductFilters['sortBy'], dir: number): number {
    if (!key) return 0

    if (key === 'product') {
      return getProductDisplayName(a).localeCompare(getProductDisplayName(b), 'es', { sensitivity: 'base' }) * dir
    }

    if (key === 'condition') {
      const av = a.condition ?? ''
      const bv = b.condition ?? ''
      return String(av).localeCompare(String(bv), 'es', { sensitivity: 'base' }) * dir
    }

    if (key === 'batteryHealth') {
      const av = a.batteryHealth ?? -1
      const bv = b.batteryHealth ?? -1
      return (av - bv) * dir
    }

    const av = a[key] ?? ''
    const bv = b[key] ?? ''
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv), 'es', { sensitivity: 'base' }) * dir
  }

  const brands = computed(() => [...new Set(products.value.map((p) => p.brand))].sort())

  const lowStockProducts = computed(() =>
    products.value.filter(isLowStock),
  )

  const totalStock = computed(() => products.value.reduce((sum, p) => sum + p.stock, 0))

  async function createProduct(data: ProductFormData): Promise<Product> {
    const now = new Date().toISOString()
    const payload = { ...data }
    if (!payload.condition) payload.condition = 'nuevo'
    if (payload.batteryHealth == null) delete payload.batteryHealth
    delete (payload as ProductFormData & { sku?: string }).sku
    const product: Product = {
      ...payload,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    await saveProduct(product)
    await loadProducts()
    return product
  }

  async function updateProduct(id: string, data: Partial<ProductFormData>): Promise<Product> {
    const existing = products.value.find((p) => p.id === id)
    if (!existing) throw new Error('Producto no encontrado')

    const updated: Product = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    }
    // La clave vacía tiene que salir del registro: el spread de undefined no la borra en IndexedDB.
    if ('batteryHealth' in data && data.batteryHealth == null) {
      delete updated.batteryHealth
    }
    delete (updated as Product & { sku?: string }).sku
    await saveProduct(updated)
    await loadProducts()
    return updated
  }

  async function removeProduct(id: string): Promise<void> {
    await dbDeleteProduct(id)
    await loadProducts()
  }

  async function removeProducts(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => dbDeleteProduct(id)))
    await loadProducts()
  }

  function getProductById(id: string): Product | undefined {
    return products.value.find((p) => p.id === id)
  }

  /**
   * Búsqueda rápida para venta, permuta, compras y búsqueda global.
   * `inStockOnly` filtra antes de recortar, así los productos sin stock no
   * ocupan los primeros resultados.
   */
  function searchProducts(query: string, options: { inStockOnly?: boolean } = {}): Product[] {
    if (!query.trim()) return []
    return products.value
      .filter((p) => (!options.inStockOnly || p.stock > 0) && matchesProductSearch(p, query))
      .slice(0, 10)
  }

  return {
    products,
    loading,
    brands,
    lowStockProducts,
    totalStock,
    loadProducts,
    filterProducts,
    createProduct,
    updateProduct,
    removeProduct,
    removeProducts,
    getProductById,
    searchProducts,
  }
}