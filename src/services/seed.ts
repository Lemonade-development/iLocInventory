import { buildIphoneCatalog, catalogKey } from './iphoneCatalog'
import { db, getAllProducts, isSeeded, markSeeded } from './storage'

/** Una base nueva arranca con el catálogo de iPhone, sin datos de ejemplo. */
export async function seedDatabaseIfNeeded(): Promise<void> {
  if (await isSeeded()) return

  await db.products.bulkAdd(buildIphoneCatalog())

  await markSeeded()
}

/**
 * Agrega las variantes del catálogo de iPhone que todavía no existen.
 * No modifica ni borra productos. Devuelve cuántos agregó.
 */
export async function addMissingIphoneCatalog(): Promise<number> {
  const existing = new Set((await getAllProducts()).map(catalogKey))
  const missing = buildIphoneCatalog().filter((p) => !existing.has(catalogKey(p)))
  if (missing.length) await db.products.bulkAdd(missing)
  return missing.length
}
