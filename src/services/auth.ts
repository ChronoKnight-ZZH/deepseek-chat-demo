import { create } from 'zustand'

/** 登录方式；当前阶段仅记录来源，不做真实鉴权 */
export type LoginMethod = 'sms' | 'password' | 'wechat' | 'apple'

export type LoginUser = {
  account: string
  method: LoginMethod
  loggedAt: number
}

const KEY = 'chat-demo:login-user'

const isLoginMethod = (value: unknown): value is LoginMethod =>
  value === 'sms' || value === 'password' || value === 'wechat' || value === 'apple'

/** 读取本机登录记录；数据损坏时按未登录处理 */
const readUser = (): LoginUser | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const user = parsed as Partial<LoginUser>
    if (
      typeof user.account !== 'string' ||
      typeof user.loggedAt !== 'number' ||
      !isLoginMethod(user.method)
    ) {
      return null
    }
    return { account: user.account, method: user.method, loggedAt: user.loggedAt }
  } catch {
    return null
  }
}

type AuthState = {
  user: LoginUser | null
}

/** 登录状态存 localStorage，刷新页面后保持登录 */
export const useAuth = create<AuthState>(() => ({ user: readUser() }))

export const signIn = (account: string, method: LoginMethod): LoginUser => {
  const user: LoginUser = { account, method, loggedAt: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(user))
  } catch {
    // 存储不可用时只在内存中生效
  }
  useAuth.setState({ user })
  return user
}

export const signOut = () => {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 存储不可用时只需清空内存状态
  }
  useAuth.setState({ user: null })
}
