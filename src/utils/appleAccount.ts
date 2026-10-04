import type { AppleAccount } from '@/types'

export interface AppleAccountDraft {
  appleId: string
  password: string
}

export const APPLE_ACCOUNT_NOTICE =
  'Cuenta creada a pedido del cliente y de su propiedad. Cambie la contraseña y guarde estos datos en un lugar seguro.'

export function emptyAppleAccountDraft(): AppleAccountDraft {
  return { appleId: '', password: '' }
}

export function appleAccountDraftFrom(account?: AppleAccount): AppleAccountDraft {
  return { appleId: account?.appleId ?? '', password: account?.password ?? '' }
}

/** La contraseña sin Apple ID no se puede entregar al cliente. */
export function appleAccountError(draft: AppleAccountDraft): string | null {
  if (draft.password && !draft.appleId.trim()) return 'Ingresa el Apple ID de la cuenta'
  return null
}

/** Devuelve undefined cuando los dos campos están vacíos. */
export function toStoredAppleAccount(draft: AppleAccountDraft): AppleAccount | undefined {
  const appleId = draft.appleId.trim()
  if (!appleId) return undefined
  return draft.password ? { appleId, password: draft.password } : { appleId }
}
