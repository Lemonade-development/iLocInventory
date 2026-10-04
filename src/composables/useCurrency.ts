import { ref } from 'vue'
import { formatUsd } from '@/utils/format'

const RATE_KEY = 'iloc-exchange-rate'
const SHOW_USD_KEY = 'iloc-show-usd'
const AUTO_RATE_KEY = 'iloc-exchange-rate-auto'
const RATE_UPDATED_KEY = 'iloc-exchange-rate-updated'
const RATE_CHECKED_KEY = 'iloc-exchange-rate-checked'

/**
 * Dólar oficial del BCB publicado por DolarApi Bolivia. El sitio del BCB no
 * permite consultas desde el navegador; DolarApi replica su cotización diaria.
 */
export const OFFICIAL_RATE_URL = 'https://bo.dolarapi.com/v1/dolares/oficial'
/** Cada cuánto se vuelve a consultar mientras la app está abierta. */
const REFRESH_EVERY_MS = 3 * 60 * 60 * 1000

// Tipo de cambio por defecto (Bs por 1 USD) hasta la primera consulta del oficial:
// el del BCB a octubre de 2026.
const DEFAULT_RATE = 12

function readStoredRate(): number {
  try {
    const raw = localStorage.getItem(RATE_KEY)
    if (raw !== null) {
      const parsed = Number.parseFloat(raw)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  } catch {
    // localStorage no disponible
  }
  return DEFAULT_RATE
}

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLS(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // localStorage no disponible
  }
}

/** Mostrar el equivalente en USD: activo salvo que se haya apagado. */
function readStoredShowUsd(): boolean {
  return readLS(SHOW_USD_KEY) !== 'false'
}

// Estado a nivel de módulo: un único origen de verdad compartido por toda la app.
const exchangeRate = ref<number>(readStoredRate())
const showUsd = ref<boolean>(readStoredShowUsd())
/** Actualizar el tipo de cambio con el oficial cada día. Activo por defecto. */
const autoRate = ref<boolean>(readLS(AUTO_RATE_KEY) !== 'false')
/** Fecha de la cotización oficial vigente (ISO), según la fuente. */
const rateUpdatedAt = ref<string | null>(readLS(RATE_UPDATED_KEY))
const refreshingRate = ref(false)
let autoRefreshStarted = false

export interface RateRefreshResult {
  ok: boolean
  rate?: number
  error?: string
}

/**
 * Trae el dólar oficial y lo guarda como tipo de cambio actual. Sin forzar,
 * no consulta si ya lo hizo en las últimas horas. Un fallo (sin internet,
 * fuente caída) deja el último valor conocido.
 */
async function refreshOfficialRate(options: { force?: boolean } = {}): Promise<RateRefreshResult> {
  if (!options.force) {
    if (!autoRate.value) return { ok: false, error: 'manual' }
    const checked = Date.parse(readLS(RATE_CHECKED_KEY) ?? '')
    if (Number.isFinite(checked) && Date.now() - checked < REFRESH_EVERY_MS) {
      return { ok: true, rate: exchangeRate.value }
    }
  }
  if (refreshingRate.value) return { ok: false, error: 'busy' }
  refreshingRate.value = true
  try {
    const response = await fetch(OFFICIAL_RATE_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`La fuente respondió ${response.status}`)
    const data = (await response.json()) as { venta?: unknown; fechaActualizacion?: unknown }
    const rate = Number(data.venta)
    // Valor razonable para Bs por USD: descarta respuestas rotas.
    if (!Number.isFinite(rate) || rate < 1 || rate > 100) throw new Error('Cotización no válida')
    exchangeRate.value = rate
    writeLS(RATE_KEY, String(rate))
    rateUpdatedAt.value = typeof data.fechaActualizacion === 'string' ? data.fechaActualizacion : null
    writeLS(RATE_UPDATED_KEY, rateUpdatedAt.value ?? '')
    writeLS(RATE_CHECKED_KEY, new Date().toISOString())
    return { ok: true, rate }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo obtener el dólar oficial' }
  } finally {
    refreshingRate.value = false
  }
}

/** Al abrir la app, al volver a ella y cada hora revisa si toca actualizar. */
export function startOfficialRateAutoRefresh(): void {
  if (autoRefreshStarted || typeof window === 'undefined') return
  autoRefreshStarted = true
  const check = () => void refreshOfficialRate()
  check()
  window.setInterval(check, 60 * 60 * 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.addEventListener('online', check)
}

/**
 * Composable de moneda. La app almacena todos los montos en Bolivianos (Bs);
 * el dólar es solo un equivalente de visualización, calculado con un tipo de
 * cambio configurable. Para registros históricos (ventas, compras) se pasa el
 * tipo de cambio guardado en el registro para congelar su valor en USD.
 *
 * El estado es un singleton reactivo persistido en localStorage.
 */
export function useCurrency() {
  function setExchangeRate(next: number): void {
    if (!Number.isFinite(next) || next <= 0) return
    exchangeRate.value = next
    try {
      localStorage.setItem(RATE_KEY, String(next))
    } catch {
      // localStorage no disponible
    }
  }

  function setShowUsd(next: boolean): void {
    showUsd.value = next
    try {
      localStorage.setItem(SHOW_USD_KEY, String(next))
    } catch {
      // localStorage no disponible
    }
  }

  /** Activa o desactiva la actualización automática; al activarla consulta ya. */
  async function setAutoRate(next: boolean): Promise<RateRefreshResult | undefined> {
    autoRate.value = next
    writeLS(AUTO_RATE_KEY, String(next))
    if (next) return refreshOfficialRate({ force: true })
    return undefined
  }

  /** Convierte un monto en Bs a USD usando el tipo de cambio dado o el actual. */
  function toUsd(amountBs: number, rate?: number): number {
    const r = rate && rate > 0 ? rate : exchangeRate.value
    return amountBs / r
  }

  /** Devuelve el equivalente en USD ya formateado (p. ej. "$12.34"). */
  function formatUsdEquivalent(amountBs: number, rate?: number): string {
    return formatUsd(toUsd(amountBs, rate))
  }

  return {
    exchangeRate,
    showUsd,
    setExchangeRate,
    setShowUsd,
    autoRate,
    rateUpdatedAt,
    refreshingRate,
    setAutoRate,
    refreshOfficialRate,
    toUsd,
    formatUsdEquivalent,
  }
}
