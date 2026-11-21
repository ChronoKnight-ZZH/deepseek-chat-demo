import { useEffect, useState, type FormEvent } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useSettings } from '../../services/settings.js'
import { login } from '../../services/auth.js'
import { describeAuthError, getAuthRetryAfter } from '../../services/auth/errors.js'
import { isWebCryptoAvailable } from '../../services/auth/crypto.js'
import type { TranslationKey } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { IconEyeOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { DeepSeekMark, IconEyeOffOutline16, WeChatMark } from './LoginIcons.js'
import { QrPlaceholder } from './QrPlaceholder.js'
import styles from './LoginPage.module.css'

const TERMS_PATH = '/deepseek-terms-of-use.html'
const PRIVACY_PATH = '/deepseek-privacy-policy.html'

/**
 * 登录页：密码登录走 RSA-OAEP 加密，后端返回 Bearer Token。
 * 短信、微信、Apple 后端尚未开通，只保留“暂未开放”，不再做任何本地假登录。
 */
export const LoginPage = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) {
      return
    }
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const policyLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US'
  const comingSoon = () => showToast({ key: 'loginComingSoon' })

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || cooldown > 0) {
      return
    }
    if (!account.trim()) {
      setErrorKey('loginAccountRequired')
      return
    }
    if (!password) {
      setErrorKey('loginPasswordRequired')
      return
    }
    if (!isWebCryptoAvailable()) {
      setErrorKey('authWebCryptoUnavailable')
      return
    }
    setErrorKey(null)
    setSubmitting(true)
    try {
      await login(account, password)
      showToast({ key: 'loginSuccess' })
    } catch (error) {
      setErrorKey(describeAuthError(error))
      const retryAfter = getAuthRetryAfter(error)
      if (retryAfter !== undefined && retryAfter > 0) {
        setCooldown(retryAfter)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.logo} role="img" aria-label={t('loginLogoLabel')}>
          <span className={styles.logoMark}>
            <DeepSeekMark />
          </span>
          <span className={styles.logoText}>deepseek</span>
        </div>

        <div className={styles.panelRow}>
          <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
            <div className={styles.field}>
              <input
                className={styles.input}
                type="text"
                autoComplete="username"
                autoFocus
                maxLength={128}
                aria-label={t('loginAccountPlaceholder')}
                placeholder={t('loginAccountPlaceholder')}
                value={account}
                onChange={(event) => setAccount(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <input
                className={styles.input}
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                aria-label={t('loginPasswordPlaceholder')}
                placeholder={t('loginPasswordPlaceholder')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className={styles.eyeButton}
                aria-label={t(passwordVisible ? 'loginHidePassword' : 'loginShowPassword')}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <IconEyeOutline16 /> : <IconEyeOffOutline16 />}
              </button>
            </div>

            {errorKey ? (
              <p className={styles.errorText} role="alert">
                {t(errorKey)}
              </p>
            ) : null}
            {cooldown > 0 ? (
              <p className={styles.errorText} role="status" aria-live="polite">
                {t('loginRetryIn', { seconds: cooldown })}
              </p>
            ) : null}

            <p className={styles.agreement}>
              {t('loginAgreementPrefix')}
              <a
                className={styles.agreementLink}
                href={`https://cdn.deepseek.com/policies/${policyLocale}${TERMS_PATH}`}
                target="_blank"
                rel="noreferrer"
              >
                {t('loginTerms')}
              </a>
              {t('loginAgreementAnd')}
              <a
                className={styles.agreementLink}
                href={`https://cdn.deepseek.com/policies/${policyLocale}${PRIVACY_PATH}`}
                target="_blank"
                rel="noreferrer"
              >
                {t('loginPrivacy')}
              </a>
            </p>

            <div className={styles.linksRow}>
              <button type="button" className={styles.textLink} onClick={comingSoon}>
                {t('loginForgotPassword')}
              </button>
              <button type="button" className={styles.textLink} onClick={comingSoon}>
                {t('loginRegister')}
              </button>
            </div>

            <Button
              type="submit"
              block
              className={styles.submit}
              disabled={submitting || cooldown > 0}
              aria-busy={submitting}
            >
              {t(submitting ? 'loginSubmitting' : 'loginButton')}
            </Button>

            <div className={styles.switchRow}>
              <button type="button" className={styles.mutedLink} onClick={comingSoon}>
                {t('loginSwitchToSms')}
              </button>
              <span className={styles.switchDivider} aria-hidden="true" />
              <button type="button" className={styles.mutedLink} onClick={comingSoon}>
                {t('loginApple')}
              </button>
            </div>
          </form>

          <button
            type="button"
            className={styles.qrPanel}
            aria-label={t('loginWechatTitle')}
            aria-disabled="true"
            disabled
          >
            <span className={styles.qrTitle}>
              <span className={styles.qrTitleIcon}>
                <WeChatMark />
              </span>
              {t('loginWechatTitle')}
            </span>
            <span className={styles.qrBox}>
              <QrPlaceholder />
            </span>
            <span className={styles.qrHint}>{t('loginWechatUnavailable')}</span>
          </button>
        </div>
      </main>

      <footer className={styles.footer}>
        <a href="https://www.deepseek.com" target="_blank" rel="noreferrer">
          {t('loginContactUs')}
        </a>
      </footer>
    </div>
  )
}
