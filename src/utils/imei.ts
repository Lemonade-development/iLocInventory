import type { DeviceImeis, ProductCategory } from '@/types'

export function isPhoneCategory(category: ProductCategory): boolean {
  return category === 'celular'
}

/** iPhone: marca Apple y modelo que contiene "iPhone". Esos equipos muestran el IMEI 2 siempre. */
export function isIphoneDevice(product: { brand: string; model: string }): boolean {
  const brand = product.brand.trim().toLowerCase()
  const model = product.model.trim().toLowerCase()
  return brand === 'apple' && model.includes('iphone')
}

export const IMEI_MAX_LENGTH = 20

/** Deja solo dígitos y recorta al máximo permitido. */
export function normalizeImei(value: string): string {
  return value.replace(/\D/g, '').slice(0, IMEI_MAX_LENGTH)
}

export function isValidImei(value: string): boolean {
  return new RegExp(`^\\d{1,${IMEI_MAX_LENGTH}}$`).test(value)
}

/** Borrador de una unidad mientras se arma la venta. */
export interface ImeiDraft {
  imei: string
  imei2: string
  /** El campo IMEI 2 está visible. En un iPhone queda abierto desde el inicio. */
  showImei2: boolean
}

export function emptyImeiDraft(iphone: boolean): ImeiDraft {
  return { imei: '', imei2: '', showImei2: iphone }
}

/** Ajusta la lista al número de unidades, conservando lo ya escrito. */
export function resizeImeiDrafts(
  current: ImeiDraft[] | undefined,
  quantity: number,
  iphone: boolean,
): ImeiDraft[] {
  const next = (current ?? []).slice(0, quantity).map((draft) => ({
    imei: draft.imei,
    imei2: draft.imei2,
    showImei2: iphone || draft.showImei2 || draft.imei2.length > 0,
  }))
  while (next.length < quantity) next.push(emptyImeiDraft(iphone))
  return next
}

export function toStoredImeis(drafts: ImeiDraft[], quantity: number): DeviceImeis[] {
  return drafts.slice(0, quantity).map((draft) => {
    const imei = normalizeImei(draft.imei)
    const imei2 = draft.showImei2 ? normalizeImei(draft.imei2) : ''
    return imei2 ? { imei, imei2 } : { imei }
  })
}

/** Lee IMEIs guardados. Acepta el formato nuevo y el anterior de un solo número por unidad. */
export function readImeiUnits(value: unknown): DeviceImeis[] {
  if (!Array.isArray(value)) return []
  const units: DeviceImeis[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      const imei = normalizeImei(entry)
      if (imei) units.push({ imei })
      continue
    }
    if (entry && typeof entry === 'object' && 'imei' in entry) {
      const raw = entry as { imei?: unknown; imei2?: unknown }
      const imei = normalizeImei(String(raw.imei ?? ''))
      const imei2 = raw.imei2 ? normalizeImei(String(raw.imei2)) : ''
      if (imei) units.push(imei2 ? { imei, imei2 } : { imei })
    }
  }
  return units
}

/** Líneas para la nota, el detalle y el historial. */
export function imeiDisplayLines(value: unknown): string[] {
  const units = readImeiUnits(value)
  const multi = units.length > 1
  const lines: string[] = []
  units.forEach((unit, index) => {
    const prefix = multi ? `Unidad ${index + 1} · ` : ''
    lines.push(`${prefix}IMEI ${unit.imei}`)
    if (unit.imei2) lines.push(`${prefix}IMEI 2 ${unit.imei2}`)
  })
  return lines
}

export function imeiMatchesQuery(value: unknown, query: string): boolean {
  return readImeiUnits(value).some(
    (unit) => unit.imei.includes(query) || (unit.imei2?.includes(query) ?? false),
  )
}

export interface ImeiLine {
  label: string
  category: ProductCategory
  quantity: number
  imeis?: ImeiDraft[]
}

/** Primer error de IMEI de la venta, o null si los teléfonos están completos. */
export function phoneImeiError(lines: ImeiLine[]): string | null {
  const seen = new Set<string>()
  for (const line of lines) {
    if (!isPhoneCategory(line.category)) continue
    const drafts = (line.imeis ?? []).slice(0, line.quantity)
    for (let i = 0; i < line.quantity; i++) {
      const draft = drafts[i] ?? emptyImeiDraft(false)
      const which = line.quantity > 1 ? ` (unidad ${i + 1})` : ''
      const imei = normalizeImei(draft.imei)
      const imei2 = draft.showImei2 ? normalizeImei(draft.imei2) : ''
      if (!isValidImei(imei)) {
        return `${line.label}${which}: ingresa el IMEI (solo números, máximo ${IMEI_MAX_LENGTH})`
      }
      if (seen.has(imei)) return `El IMEI ${imei} está repetido en esta venta`
      seen.add(imei)
      if (!imei2) continue
      if (!isValidImei(imei2)) {
        return `${line.label}${which}: el IMEI 2 debe tener solo números (máximo ${IMEI_MAX_LENGTH})`
      }
      if (imei2 === imei) {
        return `${line.label}${which}: el IMEI 2 no puede ser igual al IMEI`
      }
      if (seen.has(imei2)) return `El IMEI ${imei2} está repetido en esta venta`
      seen.add(imei2)
    }
  }
  return null
}
