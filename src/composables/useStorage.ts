import { ref, shallowRef } from 'vue'
import {
  exportAllData,
  getStorageBackend,
  importAllData,
  initStorage,
  type ExportData,
  type StorageBackend,
} from '@/services/storage'
import { seedDatabaseIfNeeded } from '@/services/seed'

const ready = ref(false)
const loading = ref(false)
const error = shallowRef<string | null>(null)
const backend = ref<StorageBackend>('dexie')

export function useStorage() {
  async function initialize(): Promise<void> {
    if (ready.value) return
    loading.value = true
    error.value = null
    try {
      await initStorage()
      backend.value = getStorageBackend()
      await seedDatabaseIfNeeded()
      ready.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error al inicializar almacenamiento'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function exportData(): Promise<ExportData> {
    return exportAllData()
  }

  async function importData(data: ExportData, replace = true): Promise<void> {
    await importAllData(data, replace)
  }

  return {
    ready,
    loading,
    error,
    backend,
    initialize,
    exportData,
    importData,
  }
}