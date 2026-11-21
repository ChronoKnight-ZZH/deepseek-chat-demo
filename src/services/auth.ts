import { create } from 'zustand'
import {
  AuthApiError,
  changePassword as changePasswordRequest,
  getPublicKey,
  login as loginRequest,
  logout as logoutRequest,
} from './api/auth.js'
import {
  encodeChangePasswordPayload,
  encodeLoginPayload,
  encryptAuthPayload,
  normalizeOaepHash,
} from './auth/crypto.js'

/**
 * 当前后端（auth-demo）使用 Opaque Bearer Token，没有 Cookie 会话。
 * Token 只放 sessionStorage：关闭标签页即失效，不跨标签页共享。
 * 由于本期不实现 /auth/me，启动时只能用本地 expiresAt 做一次离线校验，
 * 服务端撤销（改密、锁定）要等下一次受保护请求返回 401 时才能感知。
 */
const SESSION_KEY = 'chat-demo.auth.session'

type StoredSession = {
  token: string
  /** epoch 毫秒；0 表示后端未返回 */
  expiresAt: number
  /** 登录时输入的用户名，改密 payload 需要它与账号一致 */
  username: string
}

export type AuthStatus = 'authenticated' | 'anonymous'

type AuthState = {
  status: AuthStatus
  username: string | null
  expiresAt: number
  /** 最近一次认证失败的错误码 */
  error: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readStoredSession = (): StoredSession | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) {
      return null
    }
    const value: unknown = JSON.parse(raw)
    if (
      !isRecord(value) ||
      typeof value.token !== 'string' ||
      !value.token ||
      typeof value.username !== 'string'
    ) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    const expiresAt = typeof value.expiresAt === 'number' ? value.expiresAt : 0
    if (expiresAt > 0 && expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return { token: value.token, expiresAt, username: value.username }
  } catch {
    // sessionStorage 不可用（隐私模式、file://）时退回纯内存会话
    return null
  }
}

const writeStoredSession = (session: StoredSession) => {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // 写不进去也不影响当前标签页的内存会话
  }
}

const removeStoredSession = () => {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // 忽略
  }
}

let currentToken: string | null = null

const restoreSession = (session: StoredSession) => {
  currentToken = session.token
  useAuth.setState({
    status: 'authenticated',
    username: session.username,
    expiresAt: session.expiresAt,
    error: null,
  })
}

const setSession = (session: StoredSession) => {
  writeStoredSession(session)
  restoreSession(session)
}

const clearSession = (error: string | null = null) => {
  currentToken = null
  removeStoredSession()
  useAuth.setState({ status: 'anonymous', username: null, expiresAt: 0, error })
}

const storedSession = readStoredSession()

export const useAuth = create<AuthState>(() => ({
  status: storedSession ? 'authenticated' : 'anonymous',
  username: storedSession?.username ?? null,
  expiresAt: storedSession?.expiresAt ?? 0,
  error: null,
}))

if (storedSession) {
  currentToken = storedSession.token
}

/** 供后续聊天 BFF 代理携带 `Authorization: Bearer <token>` */
export const getAuthToken = (): string | null => currentToken

const encryptForBackend = async (payload: string): Promise<string> => {
  const key = await getPublicKey()
  return encryptAuthPayload(key.publicKey, payload, normalizeOaepHash(key.oaepHash))
}

/** 登录：WebCrypto 加密后只发送密文，Token 由响应体返回 */
export const login = async (username: string, password: string): Promise<void> => {
  const account = username.trim()
  try {
    const key = await getPublicKey()
    const payload = encodeLoginPayload(account, password, key.maxPlaintextBytes)
    const result = await loginRequest(await encryptForBackend(payload))
    setSession({ token: result.token, expiresAt: result.expiresAt, username: account })
  } catch (error) {
    useAuth.setState({ error: error instanceof AuthApiError ? error.code : null })
    throw error
  }
}

/** 登出失败也清本地状态；服务端会话由后端尽力删除 */
export const logout = async (): Promise<void> => {
  const token = currentToken
  try {
    if (token) {
      await logoutRequest(token)
    }
  } catch {
    // 网络或 Token 失效不能阻止本地退出
  } finally {
    clearSession()
  }
}

/**
 * 改密成功后后端递增 credential_version，全部旧 Token 立即失效。
 * 因此前端无论服务端是否成功撤销，都直接回登录页。
 */
export const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
  const token = currentToken
  const username = useAuth.getState().username
  if (!token || !username) {
    clearSession('TOKEN_MISSING')
    throw new AuthApiError('TOKEN_MISSING', 'Not signed in', 401)
  }
  try {
    const key = await getPublicKey()
    const payload = encodeChangePasswordPayload(
      username,
      oldPassword,
      newPassword,
      key.maxPlaintextBytes
    )
    await changePasswordRequest(token, await encryptForBackend(payload))
    clearSession()
  } catch (error) {
    const code = error instanceof AuthApiError ? error.code : null
    // 只有凭证本身失效才回登录页；INVALID_CREDENTIALS 表示旧密码错误，必须保留会话。
    // SESSION_WRITE_FAILED 也不假装成功，由改密弹窗提示用户重新登录确认。
    const sessionInvalid =
      code === 'TOKEN_MISSING' ||
      code === 'TOKEN_INVALID' ||
      code === 'TOKEN_EXPIRED' ||
      code === 'ACCOUNT_LOCKED'
    if (sessionInvalid) {
      clearSession(code)
    } else {
      useAuth.setState({ error: code })
    }
    throw error
  }
}

let unauthorizedHandled = false

/** 多个受保护请求同时 401 时只处理一次，避免重复提示 */
export const handleUnauthorized = () => {
  if (unauthorizedHandled || useAuth.getState().status === 'anonymous') {
    return
  }
  unauthorizedHandled = true
  clearSession('TOKEN_EXPIRED')
  window.setTimeout(() => {
    unauthorizedHandled = false
  }, 0)
}

export const clearAuthError = () => useAuth.setState({ error: null })
