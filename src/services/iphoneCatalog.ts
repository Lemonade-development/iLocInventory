import type { Product, ProductCondition } from '@/types'
import { generateId } from '@/utils/id'

/**
 * Catálogo de iPhone desde el iPhone X: cada modelo con sus colores y
 * capacidades oficiales. Se carga en una base nueva y desde Configuración.
 * Los colores usan los nombres de Apple en español.
 */
interface IphoneModel {
  model: string
  colors: string[]
  storages: string[]
}

const IPHONE_MODELS: IphoneModel[] = [
  // 2017
  { model: 'iPhone X', colors: ['Gris espacial', 'Plata'], storages: ['64GB', '256GB'] },
  // 2018
  {
    model: 'iPhone XR',
    colors: ['Negro', 'Blanco', 'Azul', 'Amarillo', 'Coral', '(PRODUCT)RED'],
    storages: ['64GB', '128GB', '256GB'],
  },
  { model: 'iPhone XS', colors: ['Gris espacial', 'Plata', 'Oro'], storages: ['64GB', '256GB', '512GB'] },
  { model: 'iPhone XS Max', colors: ['Gris espacial', 'Plata', 'Oro'], storages: ['64GB', '256GB', '512GB'] },
  // 2019
  {
    model: 'iPhone 11',
    colors: ['Negro', 'Blanco', 'Verde', 'Amarillo', 'Morado', '(PRODUCT)RED'],
    storages: ['64GB', '128GB', '256GB'],
  },
  {
    model: 'iPhone 11 Pro',
    colors: ['Gris espacial', 'Plata', 'Oro', 'Verde noche'],
    storages: ['64GB', '256GB', '512GB'],
  },
  {
    model: 'iPhone 11 Pro Max',
    colors: ['Gris espacial', 'Plata', 'Oro', 'Verde noche'],
    storages: ['64GB', '256GB', '512GB'],
  },
  // 2020
  {
    model: 'iPhone SE (2.ª generación)',
    colors: ['Negro', 'Blanco', '(PRODUCT)RED'],
    storages: ['64GB', '128GB', '256GB'],
  },
  {
    model: 'iPhone 12 mini',
    colors: ['Negro', 'Blanco', '(PRODUCT)RED', 'Verde', 'Azul', 'Morado'],
    storages: ['64GB', '128GB', '256GB'],
  },
  {
    model: 'iPhone 12',
    colors: ['Negro', 'Blanco', '(PRODUCT)RED', 'Verde', 'Azul', 'Morado'],
    storages: ['64GB', '128GB', '256GB'],
  },
  {
    model: 'iPhone 12 Pro',
    colors: ['Grafito', 'Plata', 'Oro', 'Azul pacífico'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    model: 'iPhone 12 Pro Max',
    colors: ['Grafito', 'Plata', 'Oro', 'Azul pacífico'],
    storages: ['128GB', '256GB', '512GB'],
  },
  // 2021
  {
    model: 'iPhone 13 mini',
    colors: ['Medianoche', 'Blanco estelar', 'Azul', 'Rosa', 'Verde', '(PRODUCT)RED'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    model: 'iPhone 13',
    colors: ['Medianoche', 'Blanco estelar', 'Azul', 'Rosa', 'Verde', '(PRODUCT)RED'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    model: 'iPhone 13 Pro',
    colors: ['Grafito', 'Plata', 'Oro', 'Azul sierra', 'Verde alpino'],
    storages: ['128GB', '256GB', '512GB', '1TB'],
  },
  {
    model: 'iPhone 13 Pro Max',
    colors: ['Grafito', 'Plata', 'Oro', 'Azul sierra', 'Verde alpino'],
    storages: ['128GB', '256GB', '512GB', '1TB'],
  },
  // 2022
  {
    model: 'iPhone SE (3.ª generación)',
    colors: ['Medianoche', 'Blanco estelar', '(PRODUCT)RED'],
    storages: ['64GB', '128GB', '256GB'],
  },
  {
    model: 'iPhone 14',
    colors: ['Medianoche', 'Blanco estelar', 'Azul', 'Morado', 'Amarillo', '(PRODUCT)RED'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    model: 'iPhone 14 Plus',
    colors: ['Medianoche', 'Blanco estelar', 'Azul', 'Morado', 'Amarillo', '(PRODUCT)RED'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    model: 'iPhone 14 Pro',
    colors: ['Negro espacial', 'Plata', 'Oro', 'Morado oscuro'],
    storages: ['128GB', '256GB', '512GB', '1TB'],
  },
  {
    model: 'iPhone 14 Pro Max',
    colors: ['Negro espacial', 'Plata', 'Oro', 'Morado oscuro'],
    storages: ['128GB', '256GB', '512GB', '1TB'],
  },
  // 2023
  {
    model: 'iPhone 15',
    colors: ['Negro', 'Azul', 'Verde', 'Amarillo', 'Rosa'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    model: 'iPhone 15 Plus',
    colors: ['Negro', 'Azul', 'Verde', 'Amarillo', 'Rosa'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    model: 'iPhone 15 Pro',
    colors: ['Titanio negro', 'Titanio blanco', 'Titanio azul', 'Titanio natural'],
    storages: ['128GB', '256GB', '512GB', '1TB'],
  },
  {
    model: 'iPhone 15 Pro Max',
    colors: ['Titanio negro', 'Titanio blanco', 'Titanio azul', 'Titanio natural'],
    storages: ['256GB', '512GB', '1TB'],
  },
  // 2024
  {
    model: 'iPhone 16',
    colors: ['Negro', 'Blanco', 'Rosa', 'Verde azulado', 'Ultramarino'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    model: 'iPhone 16 Plus',
    colors: ['Negro', 'Blanco', 'Rosa', 'Verde azulado', 'Ultramarino'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    model: 'iPhone 16 Pro',
    colors: ['Titanio negro', 'Titanio blanco', 'Titanio natural', 'Titanio del desierto'],
    storages: ['128GB', '256GB', '512GB', '1TB'],
  },
  {
    model: 'iPhone 16 Pro Max',
    colors: ['Titanio negro', 'Titanio blanco', 'Titanio natural', 'Titanio del desierto'],
    storages: ['256GB', '512GB', '1TB'],
  },
  // 2025
  { model: 'iPhone 16e', colors: ['Negro', 'Blanco'], storages: ['128GB', '256GB', '512GB'] },
  {
    model: 'iPhone 17',
    colors: ['Negro', 'Blanco', 'Azul neblina', 'Salvia', 'Lavanda'],
    storages: ['256GB', '512GB'],
  },
  {
    model: 'iPhone Air',
    colors: ['Negro espacial', 'Blanco nube', 'Oro claro', 'Azul cielo'],
    storages: ['256GB', '512GB', '1TB'],
  },
  {
    model: 'iPhone 17 Pro',
    colors: ['Plata', 'Naranja cósmico', 'Azul profundo'],
    storages: ['256GB', '512GB', '1TB'],
  },
  {
    model: 'iPhone 17 Pro Max',
    colors: ['Plata', 'Naranja cósmico', 'Azul profundo'],
    storages: ['256GB', '512GB', '1TB', '2TB'],
  },
  // 2026
  { model: 'iPhone 17e', colors: ['Negro', 'Blanco', 'Rosa suave'], storages: ['256GB', '512GB'] },
  {
    model: 'iPhone 18 Pro',
    colors: ['Negro', 'Plata', 'Glaciar', 'Borgoña'],
    storages: ['256GB', '512GB', '1TB', '2TB'],
  },
  {
    model: 'iPhone 18 Pro Max',
    colors: ['Negro', 'Plata', 'Glaciar', 'Borgoña'],
    storages: ['256GB', '512GB', '1TB', '2TB'],
  },
  {
    model: 'iPhone Duo',
    colors: ['Blanco estrella', 'Cielo nocturno'],
    storages: ['256GB', '512GB', '1TB', '2TB'],
  },
]

const CONDITIONS: ProductCondition[] = ['nuevo', 'segunda_mano']

/** Clave para no repetir un producto: marca, modelo, variante y condición. */
export function catalogKey(p: Pick<Product, 'brand' | 'model' | 'variant' | 'condition'>): string {
  return [p.brand, p.model, p.variant ?? '', p.condition ?? 'nuevo']
    .map((part) => part.trim().toLowerCase())
    .join('|')
}

/**
 * Todas las combinaciones modelo × capacidad × color, en Nuevo y Segunda mano.
 * Entran sin precio ni stock, y con mínimo 0 para que no avisen de stock bajo.
 */
export function buildIphoneCatalog(): Product[] {
  const now = new Date().toISOString()
  const products: Product[] = []
  for (const condition of CONDITIONS) {
    for (const { model, colors, storages } of IPHONE_MODELS) {
      for (const storage of storages) {
        for (const color of colors) {
          products.push({
            id: generateId(),
            brand: 'Apple',
            model,
            variant: `${color} ${storage}`,
            category: 'celular',
            condition,
            price: 0,
            cost: 0,
            stock: 0,
            minStock: 0,
            specs: { storage, color },
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }
  }
  return products
}
