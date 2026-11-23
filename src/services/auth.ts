import { create } from 'zustand'
import {
  AuthApiError,
  changePassword as changePasswordRequest,
  getMe,
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
 * 会话凭证由后端通过 HttpOnly Cookie 下发，前端不保存、也不读取 Token。
 * 启动时用 GET /auth/me 恢复登录态，Cookie 的属性与有效期全部由服务端决定。
 * 服务端撤销（改密、锁定）要等下一次受保护请求返回 401/403 时才能感知。
 */

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous'

type AuthState = {
  status: AuthStatus
  username: string | null
  expiresAt: number
  /** 最近一次认证失败的错误码 */
  error: string | null
}

export const useAuth = create<AuthState>(() => ({
  status: 'checking',
  username: null,
  expiresAt: 0,
  error: null,
}))

const setAuthenticated = (username: string | null, expiresAt: number) => {
  useAuth.setState({ status: 'authenticated', username, expiresAt, error: null })
}

const clearSession = (error: string | null = null) => {
  useAuth.setState({ status: 'anonymous', username: null, expiresAt: 0, error })
}

/** 启动探测：Cookie 有效则恢复登录态；401 或网络失败都退回登录页 */
export const restoreSession = async (): Promise<void> => {
  try {
    const me = await getMe()
    setAuthenticated(me.username || null, me.expiresAt)
  } catch (error) {
    clearSession(error instanceof AuthApiError ? error.code : null)
  }
}

const encryptForBackend = async (payload: string): Promise<string> => {
  const key = await getPublicKey()
  return encryptAuthPayload(key.publicKey, payload, normalizeOaepHash(key.oaepHash))
}

/** 登录：WebCrypto 加密后只发送密文，会话由响应里的 Set-Cookie 建立 */
export const login = async (username: string, password: string): Promise<void> => {
  const account = username.trim()
  try {
    const key = await getPublicKey()
    const payload = encodeLoginPayload(account, password, key.maxPlaintextBytes)
    const result = await loginRequest(await encryptForBackend(payload))
    setAuthenticated(result.username || account, result.expiresAt)
  } catch (error) {
    useAuth.setState({ error: error instanceof AuthApiError ? error.code : null })
    throw error
  }
}

/** 登出失败也清本地状态；服务端会话与 Cookie 由后端尽力清理 */
export const logout = async (): Promise<void> => {
  try {
    await logoutRequest()
  } catch {
    // 网络或会话失效不能阻止本地退出
  } finally {
    clearSession()
  }
}

/**
 * 改密成功后后端递增 credential_version，全部旧会话立即失效并清除 Cookie。
 * 因此前端无论服务端是否成功撤销，都直接回登录页。
 */
export const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
  const username = useAuth.getState().username
  if (!username) {
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
    await changePasswordRequest(await encryptForBackend(payload))
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
  if (unauthorizedHandled || useAuth.getState().status !== 'authenticated') {
    return
  }
  unauthorizedHandled = true
  clearSession('TOKEN_EXPIRED')
  window.setTimeout(() => {
    unauthorizedHandled = false
  }, 0)
}

export const clearAuthError = () => useAuth.setState({ error: null })
