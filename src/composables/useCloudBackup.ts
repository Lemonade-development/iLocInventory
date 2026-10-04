import { ref } from 'vue'
import {
  clearBackupFolderHandle,
  exportAllData,
  getBackupFolderHandle,
  saveBackupFolderHandle,
  type ExportData,
} from '@/services/storage'
import { useCurrency } from '@/composables/useCurrency'
import { todayIsoDate } from '@/utils/format'
import { useStoreInfo } from '@/composables/useStoreInfo'

const AUTO_KEY = 'iloc-cloud-auto-backup'
const LAST_KEY = 'iloc-cloud-last-backup'

// ¿El navegador soporta la File System Access API? (Chrome/Edge 86+, no Safari/Firefox)
const supported =
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

// Estado singleton reactivo compartido por toda la app.
const folderName = ref<string | null>(null)
const autoBackupEnabled = ref<boolean>(readLS(AUTO_KEY) === 'true')
const lastBackupAt = ref<string | null>(readLS(LAST_KEY))

// El handle vive fuera de Vue (no es serializable ni conviene hacerlo reactivo).
let dirHandle: FileSystemDirectoryHandle | null = null
let initialized = false

/**
 * Ensambla el respaldo completo (datos + ajustes de moneda y tienda), la misma
 * estructura que produce "Exportar todo (JSON)". No incluye las fotos.
 */
export async function buildBackupData(): Promise<ExportData> {
  const data = await exportAllData()
  const { exchangeRate, showUsd } = useCurrency()
  const { name, description, phone, address } = useStoreInfo()
  data.settings = {
    exchangeRate: exchangeRate.value,
    showUsd: showUsd.value,
    storeName: name.value,
    storeDescription: description.value,
    storePhone: phone.value,
    storeAddress: address.value,
  }
  return data
}

async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  request: boolean,
): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  const current = handle.queryPermission ? await handle.queryPermission(opts) : 'granted'
  if (current === 'granted') return true
  if (request && handle.requestPermission) {
    return (await handle.requestPermission(opts)) === 'granted'
  }
  return false
}

export type BackupFailure =
  | 'unsupported' // el navegador no tiene File System Access API
  | 'no-folder' // aún no se ha elegido carpeta
  | 'cancelled' // el usuario cerró el selector sin elegir
  | 'blocked' // Chrome no deja usar esa carpeta (ver classifyPickerError)
  | 'permission' // el usuario no concedió el acceso de escritura
  | 'error'

export interface BackupResult {
  ok: boolean
  reason?: BackupFailure
  error?: unknown
  /** Solo en chooseFolder: la carpeta sirve, pero no se pudo recordar para la próxima sesión. */
  persisted?: boolean
}

/**
 * `showDirectoryPicker` lanza AbortError tanto si cierras el selector como si
 * Chrome veta la carpeta (las raíces de iCloud Drive, Google Drive o cualquier
 * ruta bajo ~/Library están en su lista negra). El mensaje es lo único que los
 * distingue, así que lo miramos para no dar un error donde solo hubo cancelación.
 */
function classifyPickerError(error: unknown): BackupFailure {
  if (error instanceof DOMException) {
    if (error.name === 'AbortError') {
      const blocked = /blocked|not allowed|system files|sensitive/i.test(error.message)
      return blocked ? 'blocked' : 'cancelled'
    }
    if (error.name === 'SecurityError' || error.name === 'NotAllowedError') return 'permission'
  }
  return 'error'
}

export function useCloudBackup() {
  /** Recupera la carpeta guardada previamente (si la hay). Idempotente. */
  async function init(): Promise<void> {
    if (initialized) return
    initialized = true
    if (!supported) return
    try {
      const handle = await getBackupFolderHandle()
      if (handle) {
        dirHandle = handle
        folderName.value = handle.name
      }
    } catch {
      // sin carpeta guardada
    }
  }

  /** Abre el selector para elegir la carpeta de respaldo. Requiere gesto de usuario. */
  async function chooseFolder(): Promise<BackupResult> {
    if (!supported || !window.showDirectoryPicker) return { ok: false, reason: 'unsupported' }

    let handle: FileSystemDirectoryHandle
    try {
      handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'iloc-backup' })
    } catch (error) {
      return { ok: false, reason: classifyPickerError(error), error }
    }

    if (!(await verifyPermission(handle, true))) {
      return { ok: false, reason: 'permission' }
    }

    // La carpeta ya es usable: la activamos antes de persistirla para que un fallo
    // al guardarla en IndexedDB no deje el botón de respaldo deshabilitado.
    dirHandle = handle
    folderName.value = handle.name
    initialized = true

    try {
      await saveBackupFolderHandle(handle)
      return { ok: true, persisted: true }
    } catch (error) {
      return { ok: true, persisted: false, error }
    }
  }

  /** Deja de recordar la carpeta elegida. */
  async function forgetFolder(): Promise<void> {
    try {
      await clearBackupFolderHandle()
    } catch {
      // aunque no se pueda borrar de IndexedDB, la soltamos en memoria
    }
    dirHandle = null
    folderName.value = null
  }

  /**
   * Escribe el respaldo en la carpeta elegida. Un archivo por día
   * (iloc-backup-AAAA-MM-DD.json), que se sobrescribe si ya existe ese día.
   * En modo `silent` (respaldo automático) nunca abre diálogos de permiso:
   * si el permiso no está concedido, simplemente no hace nada.
   */
  async function backupNow(options: { silent?: boolean } = {}): Promise<BackupResult> {
    const silent = options.silent ?? false
    if (!supported) return { ok: false, reason: 'unsupported' }
    await init()
    if (!dirHandle) return { ok: false, reason: 'no-folder' }

    const granted = await verifyPermission(dirHandle, !silent)
    if (!granted) return { ok: false, reason: 'permission' }

    try {
      const data = await buildBackupData()
      const filename = `iloc-backup-${todayIsoDate()}.json`
      const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(JSON.stringify(data, null, 2))
      await writable.close()

      lastBackupAt.value = new Date().toISOString()
      try {
        localStorage.setItem(LAST_KEY, lastBackupAt.value)
      } catch {
        // localStorage no disponible
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: 'error', error }
    }
  }

  /** Respaldo automático tras una venta: silencioso y sin bloquear el flujo. */
  async function maybeAutoBackup(): Promise<void> {
    if (!supported || !autoBackupEnabled.value) return
    await init()
    if (!dirHandle) return
    try {
      await backupNow({ silent: true })
    } catch {
      // Nunca interrumpir la venta por un fallo de respaldo.
    }
  }

  function setAutoBackup(next: boolean): void {
    autoBackupEnabled.value = next
    try {
      localStorage.setItem(AUTO_KEY, String(next))
    } catch {
      // localStorage no disponible
    }
  }

  return {
    supported,
    folderName,
    autoBackupEnabled,
    lastBackupAt,
    init,
    chooseFolder,
    forgetFolder,
    backupNow,
    maybeAutoBackup,
    setAutoBackup,
  }
}
