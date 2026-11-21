import type { TranslationKey } from '../../i18n/index.js'
import { AuthApiError } from '../api/auth.js'
import { AuthPayloadError } from './crypto.js'

/** 把认证错误码收敛成登录页/改密弹窗可展示的本地化文案 */
export const describeAuthError = (
  error: unknown,
  invalidCredentialsKey: TranslationKey = 'authInvalidCredentials'
): TranslationKey => {
  if (error instanceof AuthPayloadError) {
    return 'authInputTooLong'
  }
  if (!(error instanceof AuthApiError)) {
    return 'authFailed'
  }
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return invalidCredentialsKey
    case 'TOKEN_INVALID':
    case 'TOKEN_EXPIRED':
      return 'authSessionExpired'
    case 'TOKEN_MISSING':
      return 'authSessionExpired'
    case 'TOO_MANY_ATTEMPTS':
      return 'authTooManyAttempts'
    case 'AUTH_BUSY':
      return 'authBusy'
    case 'ACCOUNT_LOCKED':
      return 'authAccountLocked'
    case 'INVALID_INPUT':
      return 'authInvalidInput'
    case 'SESSION_STORE_UNAVAILABLE':
    case 'SESSION_WRITE_FAILED':
    case 'NETWORK_ERROR':
      return 'authServiceUnavailable'
    default:
      return error.status !== undefined && error.status >= 500
        ? 'authServiceUnavailable'
        : 'authFailed'
  }
}

export const getAuthRetryAfter = (error: unknown): number | undefined =>
  error instanceof AuthApiError ? error.retryAfter : undefined
