import { MAX_AUTH_PLAINTEXT_BYTES } from '../auth/crypto.js'

/** 同源认证前缀；开发环境由 rspack devServer 代理到本地后端 */
export const AUTH_BASE = __AUTH_BASE__.replace(/\/+$/, '')

export type PublicKeyResponse = {
  publicKey: string
  algorithm: string
  oaepHash: string
  maxPlaintextBytes: number
}

export type LoginResponse = {
  token: string
  /** epoch 毫秒 */
  expiresAt: number
}

export type AuthErrorCode = string

export class AuthApiError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly status?: number,
    readonly retryAfter?: number
  ) {
    super(message)
    this.name = 'AuthApiError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readRetryAfter = (response: Response, body: unknown): number | undefined => {
  const header = response.headers.get('Retry-After')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds)
    }
    const date = Date.parse(header)
    if (!Number.isNaN(date)) {
      return Math.max(0, Math.ceil((date - Date.now()) / 1000))
    }
  }
  if (isRecord(body) && typeof body.retryAfter === 'number') {
    return Math.max(0, Math.ceil(body.retryAfter))
  }
  if (isRecord(body) && isRecord(body.error) && typeof body.error.retryAfter === 'number') {
    return Math.max(0, Math.ceil(body.error.retryAfter))
  }
  return undefined
}

const readError = async (response: Response): Promise<AuthApiError> => {
  const text = await response.text().catch(() => '')
  let code: AuthErrorCode = `HTTP_${response.status}`
  let message = response.statusText || 'Request failed'
  let retryAfter: number | undefined
  try {
    const body: unknown = JSON.parse(text)
    const envelope = isRecord(body) && isRecord(body.error) ? body.error : body
    if (isRecord(envelope)) {
      if (typeof envelope.code === 'string') {
        code = envelope.code
      }
      if (typeof envelope.message === 'string' && envelope.message) {
        message = envelope.message
      }
    }
    retryAfter = readRetryAfter(response, body)
  } catch {
    // Nginx 的 HTML 错误页不能直接展示给用户
    message = response.statusText || 'Request failed'
    retryAfter = readRetryAfter(response, null)
  }
  if (response.status === 429 && retryAfter === undefined) {
    retryAfter = 30
  }
  return new AuthApiError(code, message, response.status, retryAfter)
}

const authFetch = async <T>(
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<T> => {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  let response: Response
  try {
    response = await fetch(`${AUTH_BASE}${path}`, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }
    throw new AuthApiError(
      'NETWORK_ERROR',
      error instanceof Error ? error.message : String(error)
    )
  }
  if (!response.ok) {
    throw await readError(response)
  }
  if (response.status === 204) {
    return undefined as T
  }
  const text = await response.text()
  if (!text) {
    return undefined as T
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AuthApiError('PROTOCOL_ERROR', 'Response is not JSON', response.status)
  }
}

let publicKey: PublicKeyResponse | null = null
let publicKeyRequest: Promise<PublicKeyResponse> | null = null

const fetchPublicKey = async (): Promise<PublicKeyResponse> => {
  const body = await authFetch<unknown>('/public-key')
  if (!isRecord(body) || typeof body.publicKey !== 'string' || !body.publicKey) {
    throw new AuthApiError('PROTOCOL_ERROR', 'Public key response is missing key')
  }
  return {
    publicKey: body.publicKey,
    algorithm: typeof body.algorithm === 'string' ? body.algorithm : 'RSA-OAEP',
    oaepHash: typeof body.oaepHash === 'string' ? body.oaepHash : 'sha256',
    maxPlaintextBytes:
      typeof body.maxPlaintextBytes === 'number'
        ? body.maxPlaintextBytes
        : MAX_AUTH_PLAINTEXT_BYTES,
  }
}

export const getPublicKey = (force = false): Promise<PublicKeyResponse> => {
  if (force) {
    publicKey = null
    publicKeyRequest = null
  }
  if (publicKey) {
    return Promise.resolve(publicKey)
  }
  publicKeyRequest ??= fetchPublicKey()
    .then((value) => {
      publicKey = value
      return value
    })
    .catch((error: unknown) => {
      publicKeyRequest = null
      throw error
    })
  return publicKeyRequest
}

export const login = async (encrypted: string): Promise<LoginResponse> => {
  const body = await authFetch<unknown>('/login', {
    method: 'POST',
    body: JSON.stringify({ encrypted }),
  })
  if (!isRecord(body) || typeof body.token !== 'string' || !body.token) {
    throw new AuthApiError('PROTOCOL_ERROR', 'Login response is missing token')
  }
  return {
    token: body.token,
    expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : 0,
  }
}

export const logout = async (token: string): Promise<void> => {
  await authFetch<unknown>('/logout', { method: 'POST', body: '{}' }, token)
}

export const changePassword = async (token: string, encrypted: string): Promise<void> => {
  await authFetch<unknown>(
    '/change-password',
    { method: 'POST', body: JSON.stringify({ encrypted }) },
    token
  )
}
