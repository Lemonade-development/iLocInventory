import { getMeta, setMeta } from '@/services/storage'
import {
  AUTH_META_KEY,
  isUnlocked,
  restoreSessionFromStorage,
  setPinConfigured,
  setUnlockedState,
} from '@/services/authSession'

export {
  AUTH_META_KEY,
  AuthError,
  assertUnlocked,
  isPinConfigured,
  isUnlocked,
  lockApp,
} from '@/services/authSession'

const PBKDF2_ITERATIONS = 600_000
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 64
const PASSWORD_PATTERN = /^[a-zA-Z0-9_-]+$/
export const PASSWORD_REQUIREMENTS_HINT =
  'Mínimo 8 caracteres. Solo letras, números, guion (-) y guion bajo (_).'

export const USERNAME_MIN_LENGTH = 2
export const USERNAME_MAX_LENGTH = 32
export const USERNAME_REQUIREMENTS_HINT =
  'Entre 2 y 32 caracteres. Letras, números, espacios, guion (-) y guion bajo (_).'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 30_000

interface StoredAuthConfig {
  salt: string
  hash: string
  iterations: number
  username?: string
}

let failedAttempts = 0
let lockedUntil = 0
let cachedUsername: string | null = null

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const saltBytes = Uint8Array.from(salt)
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return new Uint8Array(bits)
}

export function sanitizePasswordInput(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, PASSWORD_MAX_LENGTH)
}

export function sanitizeUsernameInput(value: string): string {
  return value.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, USERNAME_MAX_LENGTH)
}

export function normalizeUsername(value: string): string {
  return sanitizeUsernameInput(value).trim().replace(/\s+/g, ' ')
}

export function isValidPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    PASSWORD_PATTERN.test(password)
  )
}

export function isValidUsername(value: string): boolean {
  const normalized = normalizeUsername(value)
  return (
    normalized.length >= USERNAME_MIN_LENGTH &&
    normalized.length <= USERNAME_MAX_LENGTH &&
    /^[a-zA-Z0-9 _-]+$/.test(normalized)
  )
}

export function getUsername(): string | null {
  return cachedUsername
}

export function getLockoutRemainingMs(): number {
  return Math.max(0, lockedUntil - Date.now())
}

export async function loadAuthState(): Promise<void> {
  const raw = await getMeta(AUTH_META_KEY)
  setPinConfigured(Boolean(raw))
  if (raw) {
    try {
      const config = JSON.parse(raw) as StoredAuthConfig
      cachedUsername = config.username?.trim() || null
    } catch {
      cachedUsername = null
    }
  } else {
    cachedUsername = null
  }
  restoreSessionFromStorage()
}

async function writeAuthConfig(config: StoredAuthConfig): Promise<void> {
  await setMeta(AUTH_META_KEY, JSON.stringify(config))
  setPinConfigured(true)
  cachedUsername = config.username?.trim() || null
}

async function verifyPasswordAgainstConfig(
  password: string,
  config: StoredAuthConfig,
): Promise<boolean> {
  const salt = base64ToBytes(config.salt)
  const expected = base64ToBytes(config.hash)
  const derived = await derivePasswordHash(password, salt, config.iterations)
  return timingSafeEqual(derived, expected)
}

async function readAuthConfig(): Promise<StoredAuthConfig | null> {
  const raw = await getMeta(AUTH_META_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredAuthConfig
  } catch {
    return null
  }
}

export async function setupAuth(username: string, password: string): Promise<void> {
  if (!isValidUsername(username)) throw new Error(USERNAME_REQUIREMENTS_HINT)
  if (!isValidPassword(password)) throw new Error(PASSWORD_REQUIREMENTS_HINT)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS)
  await writeAuthConfig({
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    iterations: PBKDF2_ITERATIONS,
    username: normalizeUsername(username),
  })
  failedAttempts = 0
  lockedUntil = 0
  setUnlockedState(true)
}

export async function unlockWithPin(password: string): Promise<'ok' | 'invalid' | 'lockout'> {
  if (getLockoutRemainingMs() > 0) return 'lockout'

  const config = await readAuthConfig()
  if (!config) throw new Error('No hay contraseña configurada')

  const valid = await verifyPasswordAgainstConfig(password, config)
  if (!valid) {
    failedAttempts++
    if (failedAttempts >= MAX_ATTEMPTS) {
      failedAttempts = 0
      lockedUntil = Date.now() + LOCKOUT_MS
    }
    return 'invalid'
  }

  failedAttempts = 0
  lockedUntil = 0
  setUnlockedState(true)
  return 'ok'
}

/**
 * Confirma la contraseña para una acción sensible (p. ej. borrar las ventas).
 * Comparte el contador de intentos con el desbloqueo: 5 fallos bloquean 30 s.
 */
export async function verifyPassword(password: string): Promise<'ok' | 'invalid' | 'lockout'> {
  if (!isUnlocked()) throw new Error('La aplicación está bloqueada')
  if (getLockoutRemainingMs() > 0) return 'lockout'

  const config = await readAuthConfig()
  if (!config) throw new Error('No hay contraseña configurada')

  if (!(await verifyPasswordAgainstConfig(password, config))) {
    failedAttempts++
    if (failedAttempts >= MAX_ATTEMPTS) {
      failedAttempts = 0
      lockedUntil = Date.now() + LOCKOUT_MS
    }
    return 'invalid'
  }

  failedAttempts = 0
  return 'ok'
}

export async function changePin(
  currentPassword: string,
  newPassword: string,
): Promise<'ok' | 'invalid'> {
  if (!isUnlocked()) throw new Error('La aplicación está bloqueada')
  if (!isValidPassword(newPassword)) throw new Error(PASSWORD_REQUIREMENTS_HINT)

  const config = await readAuthConfig()
  if (!config) throw new Error('No hay contraseña configurada')

  const valid = await verifyPasswordAgainstConfig(currentPassword, config)
  if (!valid) return 'invalid'

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derivePasswordHash(newPassword, salt, PBKDF2_ITERATIONS)
  await writeAuthConfig({
    ...config,
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    iterations: PBKDF2_ITERATIONS,
  })
  return 'ok'
}

export async function changeUsername(next: string): Promise<void> {
  if (!isUnlocked()) throw new Error('La aplicación está bloqueada')
  if (!isValidUsername(next)) throw new Error(USERNAME_REQUIREMENTS_HINT)

  const config = await readAuthConfig()
  if (!config) throw new Error('No hay cuenta configurada')

  await writeAuthConfig({
    ...config,
    username: normalizeUsername(next),
  })
}