<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Download,
  Upload,
  Database,
  Palette,
  Sun,
  Moon,
  Monitor,
  DollarSign,
  Printer,
  Store,
  Save,
  Cloud,
  FolderOpen,
  LogOut,
  Shield,
  User,
  Smartphone,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-vue-next'
import { useStorage } from '@/composables/useStorage'
import { useTheme, type ThemePreference } from '@/composables/useTheme'
import { useCurrency } from '@/composables/useCurrency'
import { usePrintSettings } from '@/composables/usePrintSettings'
import { useStoreInfo } from '@/composables/useStoreInfo'
import {
  useCloudBackup,
  buildBackupData,
  type BackupFailure,
} from '@/composables/useCloudBackup'
import { formatDate, formatDateTime, todayIsoDate } from '@/utils/format'
import { useProductsStore } from '@/stores/products'
import { useSalesStore } from '@/stores/sales'
import { useAppStore } from '@/stores/app'
import { useAuth } from '@/composables/useAuth'
import AppModal from '@/components/common/AppModal.vue'
import PasswordInputForm from '@/components/auth/PasswordInputForm.vue'
import { PASSWORD_REQUIREMENTS_HINT, USERNAME_REQUIREMENTS_HINT } from '@/services/auth'
import UsernameInputForm from '@/components/auth/UsernameInputForm.vue'
import type { ExportData } from '@/services/storage'
import { addMissingIphoneCatalog } from '@/services/seed'
import SalesImportModal from '@/components/sales/SalesImportModal.vue'
import InventoryImportModal from '@/components/inventory/InventoryImportModal.vue'

const { backend, importData } = useStorage()
const { preference, setTheme } = useTheme()
const {
  exchangeRate,
  showUsd,
  setExchangeRate,
  setShowUsd,
  autoRate,
  rateUpdatedAt,
  refreshingRate,
  setAutoRate,
  refreshOfficialRate,
} = useCurrency()
const { autoPrint, setAutoPrint } = usePrintSettings()
const {
  name: storeName,
  description: storeDescription,
  phone: storePhone,
  address: storeAddress,
  setName: setStoreName,
  setDescription: setStoreDescription,
  setPhone: setStorePhone,
  setAddress: setStoreAddress,
} = useStoreInfo()

// Borrador editable de los datos de la tienda; se confirman al pulsar "Guardar".
const storeDraft = ref({
  name: storeName.value,
  description: storeDescription.value,
  phone: storePhone.value,
  address: storeAddress.value,
})

// Re-sincroniza el borrador si los datos cambian desde fuera (p. ej. al importar).
watch([storeName, storeDescription, storePhone, storeAddress], () => {
  storeDraft.value = {
    name: storeName.value,
    description: storeDescription.value,
    phone: storePhone.value,
    address: storeAddress.value,
  }
})

const storeDirty = computed(
  () =>
    storeDraft.value.name !== storeName.value ||
    storeDraft.value.description !== storeDescription.value ||
    storeDraft.value.phone !== storePhone.value ||
    storeDraft.value.address !== storeAddress.value,
)

function saveStoreInfo() {
  setStoreName(storeDraft.value.name.trim())
  setStoreDescription(storeDraft.value.description.trim())
  setStorePhone(storeDraft.value.phone.trim())
  setStoreAddress(storeDraft.value.address.trim())
  appStore.showToast('Datos de la tienda actualizados', 'success')
}

// Borrador editable del tipo de cambio; se confirma al salir del input.
const rateDraft = ref(String(exchangeRate.value))

// La cotización automática cambia el valor: el borrador la sigue.
watch(exchangeRate, (rate) => {
  rateDraft.value = String(rate)
})

async function handleToggleAutoRate() {
  const result = await setAutoRate(!autoRate.value)
  if (result && !result.ok) {
    appStore.showToast(`No se pudo obtener el dólar oficial: ${result.error}. Se mantiene ${exchangeRate.value} Bs.`, 'error')
  } else if (result?.ok) {
    appStore.showToast(`Dólar oficial: ${result.rate} Bs`, 'success')
  }
}

async function handleRefreshRate() {
  const result = await refreshOfficialRate({ force: true })
  if (result.ok) appStore.showToast(`Dólar oficial actualizado: ${result.rate} Bs`, 'success')
  else appStore.showToast(`No se pudo obtener el dólar oficial: ${result.error}`, 'error')
}

function commitRate() {
  const parsed = Number.parseFloat(rateDraft.value)
  if (Number.isFinite(parsed) && parsed > 0) {
    setExchangeRate(parsed)
    rateDraft.value = String(parsed)
  } else {
    rateDraft.value = String(exchangeRate.value)
  }
}
const productsStore = useProductsStore()
const salesStore = useSalesStore()
const appStore = useAppStore()
const { username, logout, updatePin, updateUsername } = useAuth()

const showChangeUsernameModal = ref(false)
const usernameDraft = ref('')
const savingUsername = ref(false)

const showChangePasswordModal = ref(false)
const changePasswordStep = ref<'current' | 'new' | 'confirm'>('current')
const changePasswordDraft = ref('')
const changePasswordCurrent = ref('')
const changePasswordNext = ref('')
const changingPassword = ref(false)

function resetChangePasswordFlow(): void {
  changePasswordStep.value = 'current'
  changePasswordDraft.value = ''
  changePasswordCurrent.value = ''
  changePasswordNext.value = ''
  changingPassword.value = false
}

function openChangePasswordModal(): void {
  resetChangePasswordFlow()
  showChangePasswordModal.value = true
}

function closeChangePasswordModal(): void {
  showChangePasswordModal.value = false
  resetChangePasswordFlow()
}

async function submitChangePassword(value: string): Promise<void> {
  if (changePasswordStep.value === 'current') {
    changePasswordCurrent.value = value
    changePasswordStep.value = 'new'
    changePasswordDraft.value = ''
    return
  }

  if (changePasswordStep.value === 'new') {
    changePasswordNext.value = value
    changePasswordStep.value = 'confirm'
    changePasswordDraft.value = ''
    return
  }

  if (value !== changePasswordNext.value) {
    appStore.showToast('Las contraseñas nuevas no coinciden', 'error')
    changePasswordStep.value = 'new'
    changePasswordNext.value = ''
    changePasswordDraft.value = ''
    return
  }

  changingPassword.value = true
  try {
    const result = await updatePin(changePasswordCurrent.value, value)
    if (result === 'invalid') {
      appStore.showToast('Contraseña actual incorrecta', 'error')
      resetChangePasswordFlow()
      return
    }
    appStore.showToast('Contraseña actualizada', 'success')
    closeChangePasswordModal()
  } catch (e) {
    appStore.showToast(
      e instanceof Error ? e.message : 'No se pudo cambiar la contraseña',
      'error',
    )
  } finally {
    changingPassword.value = false
  }
}

function openChangeUsernameModal(): void {
  usernameDraft.value = username.value ?? ''
  showChangeUsernameModal.value = true
}

function closeChangeUsernameModal(): void {
  showChangeUsernameModal.value = false
  usernameDraft.value = ''
  savingUsername.value = false
}

async function submitUsernameChange(value: string): Promise<void> {
  savingUsername.value = true
  try {
    await updateUsername(value)
    appStore.showToast('Nombre de usuario actualizado', 'success')
    closeChangeUsernameModal()
  } catch (e) {
    appStore.showToast(
      e instanceof Error ? e.message : 'No se pudo actualizar el usuario',
      'error',
    )
  } finally {
    savingUsername.value = false
  }
}

function handleLogout(): void {
  logout()
}

// ─── Respaldo en la nube (carpeta sincronizada iCloud/Drive) ──────────────────
const {
  supported: cloudSupported,
  folderName: cloudFolder,
  autoBackupEnabled,
  lastBackupAt,
  init: initCloudBackup,
  chooseFolder,
  forgetFolder,
  backupNow,
  setAutoBackup,
} = useCloudBackup()

const backingUp = ref(false)
/** Se muestra la guía de iCloud cuando el selector se cerró sin carpeta. */
const showFolderHelp = ref(false)

onMounted(() => {
  void initCloudBackup()
})

/** Traduce el motivo del fallo a un mensaje que diga qué hacer. */
function reportBackupFailure(reason: BackupFailure | undefined): void {
  if (reason === 'cancelled') return // cerró el selector: la guía queda visible en la tarjeta
  const messages: Record<string, string> = {
    blocked: 'Chrome no permite esa carpeta. Sigue los pasos de la tarjeta para usar Documentos › iLoc.',
    permission: 'No se concedió permiso de escritura sobre la carpeta',
    'no-folder': 'Primero elige una carpeta de respaldo',
    unsupported: 'Este navegador no soporta el respaldo a una carpeta. Usa Google Chrome.',
  }
  appStore.showToast(messages[reason ?? 'error'] ?? 'No se pudo completar el respaldo', 'error')
}

async function handleChooseFolder() {
  const result = await chooseFolder()
  if (!result.ok) {
    // Chrome a veces avisa "contiene archivos del sistema" y luego lo informa como
    // una cancelación: en ambos casos se ofrece la guía.
    if (result.reason === 'cancelled' || result.reason === 'blocked') showFolderHelp.value = true
    reportBackupFailure(result.reason)
    return
  }
  showFolderHelp.value = false
  if (result.persisted) {
    appStore.showToast(`Carpeta de respaldo: ${cloudFolder.value}`, 'success')
  } else {
    appStore.showToast(
      `Carpeta ${cloudFolder.value} lista, pero habrá que volver a elegirla al recargar`,
      'info',
    )
  }
}

async function handleForgetFolder() {
  await forgetFolder()
  setAutoBackup(false)
  appStore.showToast('Carpeta de respaldo desvinculada', 'info')
}

async function handleBackupNow() {
  backingUp.value = true
  try {
    const result = await backupNow()
    if (result.ok) {
      appStore.showToast('Respaldo guardado en la nube', 'success')
    } else {
      reportBackupFailure(result.reason)
    }
  } finally {
    backingUp.value = false
  }
}

async function handleToggleAuto() {
  if (!autoBackupEnabled.value && !cloudFolder.value) {
    await handleChooseFolder()
    if (!cloudFolder.value) return
  }
  setAutoBackup(!autoBackupEnabled.value)
}

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

const importing = ref(false)
const loadingCatalog = ref(false)
const showSalesImport = ref(false)
const showInventoryImport = ref(false)

async function handleLoadCatalog() {
  loadingCatalog.value = true
  try {
    const added = await addMissingIphoneCatalog()
    await productsStore.loadProducts()
    appStore.showToast(
      added > 0
        ? `${added} variante(s) de iPhone agregada(s) al inventario`
        : 'El catálogo de iPhone ya estaba completo',
      'success',
    )
  } catch {
    appStore.showToast('Error al cargar el catálogo de iPhone', 'error')
  } finally {
    loadingCatalog.value = false
  }
}

async function handleExportJson() {
  try {
    const data = await buildBackupData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iloc-backup-${todayIsoDate()}.json`
    a.click()
    URL.revokeObjectURL(url)
    appStore.showToast('Respaldo JSON descargado', 'success')
  } catch {
    appStore.showToast('Error al exportar datos', 'error')
  }
}

async function handleExportCsv() {
  try {
    await productsStore.loadProducts()
    const headers = ['brand', 'model', 'variant', 'category', 'condition', 'batteryHealth', 'price', 'cost', 'stock', 'minStock']
    const rows = productsStore.products.map((p) =>
      headers.map((h) => {
        const val = p[h as keyof typeof p]
        return val !== undefined ? String(val) : ''
      }),
    )
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iloc-productos-${todayIsoDate()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    appStore.showToast('CSV de productos descargado', 'success')
  } catch {
    appStore.showToast('Error al exportar CSV', 'error')
  }
}

async function handleImportJson(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importing.value = true
  try {
    const text = await file.text()
    const data = JSON.parse(text) as ExportData
    if (!data.version || !data.products) throw new Error('Formato inválido')
    await importData(data, true)
    if (data.settings) {
      if (typeof data.settings.exchangeRate === 'number') setExchangeRate(data.settings.exchangeRate)
      if (typeof data.settings.showUsd === 'boolean') setShowUsd(data.settings.showUsd)
      if (typeof data.settings.storeName === 'string') setStoreName(data.settings.storeName)
      if (typeof data.settings.storeDescription === 'string')
        setStoreDescription(data.settings.storeDescription)
      if (typeof data.settings.storePhone === 'string') setStorePhone(data.settings.storePhone)
      if (typeof data.settings.storeAddress === 'string') setStoreAddress(data.settings.storeAddress)
      rateDraft.value = String(exchangeRate.value)
    }
    await Promise.all([
      productsStore.loadProducts(),
      salesStore.loadSales(),
    ])
    appStore.showToast('Datos importados correctamente', 'success')
  } catch (e) {
    appStore.showToast(e instanceof Error ? e.message : 'Error al importar', 'error')
  } finally {
    importing.value = false
    input.value = ''
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-8">
    <section class="rounded-xl border border-border bg-surface-raised p-6">
      <div class="mb-4 flex items-center gap-3">
        <Shield :size="20" class="text-accent" />
        <h2 class="text-sm font-medium text-zinc-300">Seguridad</h2>
      </div>
      <p class="mb-4 text-sm text-zinc-500">
        Protege la app con un usuario y contraseña en este equipo. {{ PASSWORD_REQUIREMENTS_HINT }}
        Al cerrar sesión, recargar o cerrar la pestaña volverá a pedir la contraseña.
      </p>

      <dl class="mb-4 space-y-2 rounded-lg border border-border bg-surface-overlay px-4 py-3 text-sm">
        <div class="flex justify-between gap-4">
          <dt class="text-zinc-500">Usuario</dt>
          <dd class="text-right font-medium text-zinc-200">
            {{ username ?? 'Sin configurar' }}
          </dd>
        </div>
      </dl>

      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-zinc-300 transition hover:bg-surface-overlay"
          @click="openChangeUsernameModal"
        >
          <User :size="16" class="text-accent" />
          Cambiar usuario
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-zinc-300 transition hover:bg-surface-overlay"
          @click="openChangePasswordModal"
        >
          <Shield :size="16" class="text-accent" />
          Cambiar contraseña
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-zinc-300 transition hover:bg-surface-overlay"
          @click="handleLogout"
        >
          <LogOut :size="16" class="text-accent" />
          Cerrar sesión
        </button>
      </div>
    </section>

    <section class="rounded-xl border border-border bg-surface-raised p-6">
      <div class="mb-4 flex items-center gap-3">
        <Store :size="20" class="text-accent" />
        <h2 class="text-sm font-medium text-zinc-300">Datos de la tienda</h2>
      </div>
      <p class="mb-4 text-sm text-zinc-500">
        El nombre y la descripción se muestran en la parte superior izquierda. Todos estos datos
        aparecen en el encabezado de los tickets de venta, notas de devolución y órdenes de compra.
      </p>

      <div class="space-y-4">
        <div>
          <label for="store-name" class="mb-1.5 block text-sm text-zinc-400">Nombre</label>
          <input
            id="store-name"
            v-model="storeDraft.name"
            type="text"
            placeholder="iLoc Inventory"
            class="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent"
            @keydown.enter="saveStoreInfo"
          />
        </div>

        <div>
          <label for="store-description" class="mb-1.5 block text-sm text-zinc-400">
            Descripción
          </label>
          <input
            id="store-description"
            v-model="storeDraft.description"
            type="text"
            placeholder="Celulares y Accesorios"
            class="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent"
            @keydown.enter="saveStoreInfo"
          />
        </div>

        <div>
          <label for="store-phone" class="mb-1.5 block text-sm text-zinc-400">Teléfono</label>
          <input
            id="store-phone"
            v-model="storeDraft.phone"
            type="tel"
            placeholder="(55) 1234-5678"
            class="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent"
            @keydown.enter="saveStoreInfo"
          />
        </div>

        <div>
          <label for="store-address" class="mb-1.5 block text-sm text-zinc-400">Dirección</label>
          <input
            id="store-address"
            v-model="storeDraft.address"
            type="text"
            placeholder="Calle Falsa 123, La Paz"
            class="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent"
            @keydown.enter="saveStoreInfo"
          />
        </div>

        <div class="flex justify-end pt-1">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!storeDirty"
            @click="saveStoreInfo"
          >
            <Save :size="16" />
            Guardar cambios
          </button>
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-border bg-surface-raised p-6">
      <div class="mb-4 flex items-center gap-3">
        <Palette :size="20" class="text-accent" />
        <h2 class="text-sm font-medium text-zinc-300">Apariencia</h2>
      </div>
      <p class="mb-4 text-sm text-zinc-500">Elige el tema de la interfaz.</p>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          type="button"
          class="flex flex-col items-center gap-2 rounded-lg border px-4 py-4 text-sm transition"
          :class="
            preference === option.value
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-zinc-400 hover:bg-surface-overlay hover:text-zinc-200'
          "
          :aria-pressed="preference === option.value"
          @click="setTheme(option.value)"
        >
          <component :is="option.icon" :size="20" />
          <span class="font-medium">{{ option.label }}</span>
        </button>
      </div>
    </section>

    <section class="rounded-xl border border-border bg-surface-raised p-6">
      <div class="mb-4 flex items-center gap-3">
        <DollarSign :size="20" class="text-accent" />
        <h2 class="text-sm font-medium text-zinc-300">Moneda</h2>
      </div>
      <p class="mb-4 text-sm text-zinc-500">
        Todos los montos se registran en Bolivianos (Bs). Opcionalmente puedes mostrar su
        equivalente en dólares con el tipo de cambio oficial o uno manual.
      </p>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-zinc-300">Dólar oficial automático</p>
            <p class="text-xs text-zinc-500">
              Toma cada día el tipo de cambio oficial del Banco Central de Bolivia (vía DolarApi).
              Sin internet se mantiene el último valor.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="autoRate"
            class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
            :class="autoRate ? 'bg-accent' : 'bg-surface-overlay border border-border'"
            @click="handleToggleAutoRate"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition"
              :class="autoRate ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </div>

        <div>
          <label for="exchange-rate" class="mb-1.5 block text-sm text-zinc-400">
            Tipo de cambio actual
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm text-zinc-500">1 USD =</span>
            <input
              id="exchange-rate"
              v-model="rateDraft"
              type="number"
              step="0.01"
              min="0"
              inputmode="decimal"
              :disabled="autoRate"
              class="w-28 rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent disabled:opacity-60"
              @blur="commitRate"
              @keydown.enter="commitRate"
            />
            <span class="text-sm text-zinc-500">Bs</span>
            <button
              v-if="autoRate"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-zinc-400 transition hover:bg-surface-overlay hover:text-zinc-200 disabled:opacity-50"
              :disabled="refreshingRate"
              @click="handleRefreshRate"
            >
              <RefreshCw :size="13" :class="{ 'animate-spin': refreshingRate }" />
              {{ refreshingRate ? 'Consultando...' : 'Actualizar ahora' }}
            </button>
          </div>
          <p class="mt-1.5 text-xs text-zinc-500">
            <template v-if="autoRate">
              {{ rateUpdatedAt ? `Cotización oficial del ${formatDate(rateUpdatedAt.slice(0, 10))}` : 'Aún sin consultar la cotización oficial' }}
            </template>
            <template v-else>Manual: escribe el valor y se usa en las ventas nuevas.</template>
          </p>
        </div>

        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-zinc-300">Mostrar equivalente en USD</p>
            <p class="text-xs text-zinc-500">
              Solo en la app, para uso interno. Las notas de venta y los comprobantes no lo incluyen.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="showUsd"
            class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
            :class="showUsd ? 'bg-accent' : 'bg-surface-overlay border border-border'"
            @click="setShowUsd(!showUsd)"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition"
              :class="showUsd ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-border bg-surface-raised p-6">
      <div class="mb-4 flex items-center gap-3">
        <Printer :size="20" class="text-accent" />
        <h2 class="text-sm font-medium text-zinc-300">Impresión</h2>
      </div>
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm text-zinc-300">Imprimir automáticamente al registrar</p>
          <p class="text-xs text-zinc-500">
            Al registrar una venta, una devolución o un abono se abre el diálogo de impresión
            sin tocar Imprimir. Las órdenes de compra (hoja carta) se imprimen a mano. Se
            guarda solo en este equipo.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="autoPrint"
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
          :class="autoPrint ? 'bg-accent' : 'bg-surface-overlay border border-border'"
          @click="setAutoPrint(!autoPrint)"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition"
            :class="autoPrint ? 'translate-x-6' : 'translate-x-1'"
          />
        </button>
      </div>
    </section>

    <section class="rounded-xl border border-border bg-surface-raised p-6">
      <div class="mb-4 flex items-center gap-3">
        <Database :size="20" class="text-accent" />
        <h2 class="text-sm font-medium text-zinc-300">Almacenamiento local</h2>
      </div>
      <dl class="space-y-2 text-sm">
        <div class="flex justify-between">
          <dt class="text-zinc-500">Base de datos</dt>
          <dd class="text-zinc-200">Dexie.js (IndexedDB)</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-zinc-500">Archivos (fotos)</dt>
          <dd class="text-zinc-200">
            {{ backend === 'opfs' ? 'OPFS (Origin Private File System)' : 'Dexie fallback' }}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-zinc-500">Modo</dt>
          <dd class="text-success">100% offline</dd>
        </div>
      </dl>
    </section>

    <section class="rounded-xl border border-border bg-surface-raised p-6">
      <div class="mb-4 flex items-center gap-3">
        <Cloud :size="20" class="text-accent" />
        <h2 class="text-sm font-medium text-zinc-300">Respaldo automático en la nube</h2>
      </div>

      <template v-if="cloudSupported">
        <p class="mb-2 text-sm text-zinc-500">
          Elige una carpeta que iCloud Drive (o Google Drive) sincronice. La app guardará ahí un
          respaldo por día y la nube lo subirá sola. No incluye las fotos de productos.
        </p>
        <p class="mb-4 text-xs text-zinc-500">
          Tiene que ser una <span class="text-zinc-300">subcarpeta</span>: el navegador no deja
          elegir Escritorio, Documentos ni Descargas directamente. Recomendado:
          <span class="text-zinc-300">Documentos › iLoc</span>, con iCloud sincronizando Documentos.
          <button
            v-if="!showFolderHelp"
            type="button"
            class="text-accent transition hover:text-accent-hover"
            @click="showFolderHelp = true"
          >
            Ver cómo
          </button>
        </p>

        <div
          v-if="showFolderHelp"
          class="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-zinc-400"
        >
          <p class="mb-2 font-medium text-zinc-200">¿Chrome no te deja elegir la carpeta de iCloud?</p>
          <p class="mb-2">
            Algunas versiones de Chrome (como la de macOS Mojave) bloquean las carpetas de iCloud
            Drive y muestran "contiene archivos del sistema". No hay un permiso que lo destrabe,
            pero iCloud puede sincronizar la carpeta Documentos, que Chrome sí acepta:
          </p>
          <ol class="list-decimal space-y-1 pl-5">
            <li>
              Abre <span class="text-zinc-200">Preferencias del Sistema › iCloud</span> (o
              <span class="text-zinc-200">ID de Apple › iCloud</span>) y pulsa
              <span class="text-zinc-200">Opciones…</span> junto a iCloud Drive.
            </li>
            <li>
              Activa <span class="text-zinc-200">Carpetas Escritorio y Documentos</span> y pulsa
              Aceptar.
            </li>
            <li>En Finder, dentro de <span class="text-zinc-200">Documentos</span>, crea una carpeta llamada <span class="text-zinc-200">iLoc</span>.</li>
            <li>
              Aquí pulsa <span class="text-zinc-200">Elegir carpeta</span>, entra en Documentos,
              selecciona <span class="text-zinc-200">iLoc</span> y acepta el permiso de edición.
            </li>
          </ol>
          <button
            type="button"
            class="mt-2 text-zinc-500 transition hover:text-zinc-300"
            @click="showFolderHelp = false"
          >
            Ocultar
          </button>
        </div>

        <div class="space-y-4">
          <div class="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-overlay px-4 py-3">
            <div class="min-w-0">
              <p class="text-sm text-zinc-300">Carpeta de respaldo</p>
              <p class="truncate text-xs" :class="cloudFolder ? 'text-accent' : 'text-zinc-500'">
                {{ cloudFolder ? `📁 ${cloudFolder}` : 'Ninguna carpeta seleccionada' }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <button
                v-if="cloudFolder"
                type="button"
                class="rounded-lg border border-border px-2.5 py-1.5 text-xs text-zinc-400 transition hover:bg-surface-raised hover:text-zinc-200"
                @click="handleForgetFolder"
              >
                Quitar
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-surface-raised"
                @click="handleChooseFolder"
              >
                <FolderOpen :size="16" class="text-accent" />
                {{ cloudFolder ? 'Cambiar' : 'Elegir carpeta' }}
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-zinc-300">Respaldar después de cada venta</p>
              <p class="text-xs text-zinc-500">Guarda una copia automática al registrar cada venta.</p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="autoBackupEnabled"
              class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
              :class="autoBackupEnabled ? 'bg-accent' : 'bg-surface-overlay border border-border'"
              @click="handleToggleAuto"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white transition"
                :class="autoBackupEnabled ? 'translate-x-6' : 'translate-x-1'"
              />
            </button>
          </div>

          <div class="flex items-center justify-between gap-3">
            <p class="text-xs text-zinc-500">
              {{ lastBackupAt ? `Último respaldo: ${formatDateTime(lastBackupAt)}` : 'Sin respaldos aún' }}
            </p>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!cloudFolder || backingUp"
              @click="handleBackupNow"
            >
              <Cloud :size="16" />
              {{ backingUp ? 'Respaldando...' : 'Respaldar ahora' }}
            </button>
          </div>
        </div>
      </template>

      <p v-else class="text-sm text-zinc-500">
        Tu navegador no soporta el respaldo automático a una carpeta. Usa Google Chrome
        (versión 86 o superior) para activarlo. Mientras tanto, puedes exportar el respaldo
        manualmente más abajo.
      </p>
    </section>

    <section class="rounded-xl border border-border bg-surface-raised p-6">
      <h2 class="mb-4 text-sm font-medium text-zinc-300">Catálogo</h2>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left text-sm text-zinc-300 transition hover:bg-surface-overlay disabled:pointer-events-none disabled:opacity-50"
        :disabled="loadingCatalog"
        @click="handleLoadCatalog"
      >
        <Smartphone :size="18" class="text-accent" />
        <div>
          <p class="font-medium text-zinc-200">
            {{ loadingCatalog ? 'Cargando catálogo...' : 'Cargar catálogo de iPhone' }}
          </p>
          <p class="text-xs text-zinc-500">
            Del iPhone X en adelante, cada color y capacidad, en Nuevo y Segunda mano. Agrega
            solo las variantes que falten, sin precio ni stock; no modifica productos existentes.
          </p>
        </div>
      </button>
      <button
        type="button"
        class="mt-3 flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left text-sm text-zinc-300 transition hover:bg-surface-overlay"
        @click="showSalesImport = true"
      >
        <FileSpreadsheet :size="18" class="text-accent" />
        <div>
          <p class="font-medium text-zinc-200">Importar ventas desde planilla</p>
          <p class="text-xs text-zinc-500">
            Registro de ventas en .ods, .xlsx o .csv. Crea las ventas históricas y sus clientes,
            sin tocar el stock. Muestra una vista previa antes de guardar.
          </p>
        </div>
      </button>
      <button
        type="button"
        class="mt-3 flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left text-sm text-zinc-300 transition hover:bg-surface-overlay"
        @click="showInventoryImport = true"
      >
        <FileSpreadsheet :size="18" class="text-accent" />
        <div>
          <p class="font-medium text-zinc-200">Carga inicial de inventario</p>
          <p class="text-xs text-zinc-500">
            Descargá la plantilla, completala y subila para cargar lo que ya tenés en el local.
            Crea productos nuevos y actualiza precio, costo y stock de los existentes. La
            reposición con proveedor va por Órdenes de compra.
          </p>
        </div>
      </button>
      <SalesImportModal v-model="showSalesImport" />
      <InventoryImportModal v-model="showInventoryImport" />
    </section>

    <section class="rounded-xl border border-border bg-surface-raised p-6">
      <h2 class="mb-4 text-sm font-medium text-zinc-300">Respaldo y restauración</h2>
      <div class="space-y-3">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left text-sm text-zinc-300 transition hover:bg-surface-overlay"
          @click="handleExportJson"
        >
          <Download :size="18" class="text-accent" />
          <div>
            <p class="font-medium text-zinc-200">Exportar todo (JSON)</p>
            <p class="text-xs text-zinc-500">
              Productos, ventas, movimientos, contactos y compras
            </p>
          </div>
        </button>

        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left text-sm text-zinc-300 transition hover:bg-surface-overlay"
          @click="handleExportCsv"
        >
          <Download :size="18" class="text-accent" />
          <div>
            <p class="font-medium text-zinc-200">Exportar productos (CSV)</p>
            <p class="text-xs text-zinc-500">Solo inventario de productos</p>
          </div>
        </button>

        <label
          class="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 text-left text-sm text-zinc-300 transition hover:bg-surface-overlay"
          :class="{ 'pointer-events-none opacity-50': importing }"
        >
          <Upload :size="18" class="text-accent" />
          <div>
            <p class="font-medium text-zinc-200">
              {{ importing ? 'Importando...' : 'Importar respaldo (JSON)' }}
            </p>
            <p class="text-xs text-zinc-500">Reemplaza todos los datos actuales</p>
          </div>
          <input type="file" accept=".json" class="hidden" @change="handleImportJson" />
        </label>
      </div>
    </section>

    <AppModal v-model="showChangeUsernameModal" title="Cambiar usuario" size="sm">
      <p class="mb-4 text-sm text-zinc-500">{{ USERNAME_REQUIREMENTS_HINT }}</p>
      <UsernameInputForm
        v-model="usernameDraft"
        submit-label="Guardar"
        :busy="savingUsername"
        input-id="settings-username"
        @submit="submitUsernameChange"
      />
      <div class="mt-4 flex justify-end">
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-sm text-zinc-400 transition hover:bg-surface-overlay"
          @click="closeChangeUsernameModal"
        >
          Cancelar
        </button>
      </div>
    </AppModal>

    <AppModal v-model="showChangePasswordModal" title="Cambiar contraseña" size="sm">
      <p class="mb-4 text-sm text-zinc-500">
        {{
          changePasswordStep === 'current'
            ? 'Escribe tu contraseña actual.'
            : changePasswordStep === 'new'
              ? `Elige una contraseña nueva. ${PASSWORD_REQUIREMENTS_HINT}`
              : 'Confirma la contraseña nueva.'
        }}
      </p>
      <PasswordInputForm
        v-model="changePasswordDraft"
        :label="
          changePasswordStep === 'current'
            ? 'Contraseña actual'
            : changePasswordStep === 'new'
              ? 'Contraseña nueva'
              : 'Confirmar contraseña'
        "
        :submit-label="changePasswordStep === 'confirm' ? 'Guardar' : 'Continuar'"
        :busy="changingPassword"
        input-id="change-password"
        @submit="submitChangePassword"
      />
      <div class="mt-4 flex justify-end">
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-sm text-zinc-400 transition hover:bg-surface-overlay"
          @click="closeChangePasswordModal"
        >
          Cancelar
        </button>
      </div>
    </AppModal>
  </div>
</template>