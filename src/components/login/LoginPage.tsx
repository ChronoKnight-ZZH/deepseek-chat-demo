import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { useSettings } from '../../services/settings.js'
import { signIn } from '../../services/auth.js'
import { Button } from '../base/Button.js'
import { IconEyeOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { DeepSeekMark, IconEyeOffOutline16, WeChatMark } from './LoginIcons.js'
import { QrPlaceholder } from './QrPlaceholder.js'
import styles from './LoginPage.module.css'

type LoginMode = 'sms' | 'password'

/** 验证码倒计时时长（秒） */
const RESEND_SECONDS = 60

const TERMS_PATH = '/deepseek-terms-of-use.html'
const PRIVACY_PATH = '/deepseek-privacy-policy.html'

/**
 * 登录页：左侧为验证码 / 密码登录表单，右侧为微信扫码占位面板。
 * 当前阶段不做真实鉴权，输入非空内容点击登录即可进入应用。
 */
export const LoginPage = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const isMobile = useIsMobile()
  const [mode, setMode] = useState<LoginMode>('sms')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const phoneInputRef = useRef<HTMLInputElement>(null)
  const accountInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (countdown <= 0) {
      return
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  // 切换登录方式后把焦点交给对应输入框；移动端不自动弹起键盘
  useEffect(() => {
    if (isMobile) {
      return
    }
    if (mode === 'sms') {
      phoneInputRef.current?.focus()
    } else {
      accountInputRef.current?.focus()
    }
  }, [isMobile, mode])

  const policyLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US'
  const comingSoon = () => showToast({ key: 'loginComingSoon' })

  const sendCode = () => {
    if (!phone.trim()) {
      showToast({ key: 'loginPhoneRequired', type: 'error' })
      return
    }
    if (countdown > 0) {
      return
    }
    setCountdown(RESEND_SECONDS)
    showToast({ key: 'loginCodeSent' })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (mode === 'sms') {
      if (!phone.trim()) {
        showToast({ key: 'loginPhoneRequired', type: 'error' })
        return
      }
      if (!code.trim()) {
        showToast({ key: 'loginCodeRequired', type: 'error' })
        return
      }
      signIn(phone.trim(), 'sms')
    } else {
      if (!account.trim()) {
        showToast({ key: 'loginAccountRequired', type: 'error' })
        return
      }
      if (!password.trim()) {
        showToast({ key: 'loginPasswordRequired', type: 'error' })
        return
      }
      signIn(account.trim(), 'password')
    }
    showToast({ key: 'loginSuccess' })
  }

  const quickLogin = () => {
    signIn('wechat', 'wechat')
    showToast({ key: 'loginSuccess' })
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
          <form className={styles.form} onSubmit={submit} noValidate>
            {mode === 'sms' ? (
              <>
                <div className={styles.field}>
                  <span className={styles.prefix}>+86</span>
                  <span className={styles.divider} aria-hidden="true" />
                  <input
                    ref={phoneInputRef}
                    className={styles.input}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={11}
                    aria-label={t('loginPhonePlaceholder')}
                    placeholder={t('loginPhonePlaceholder')}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <input
                    className={styles.input}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    aria-label={t('loginCodePlaceholder')}
                    placeholder={t('loginCodePlaceholder')}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.sendCode}
                    disabled={countdown > 0}
                    onClick={sendCode}
                  >
                    {countdown > 0
                      ? t('loginResendCode', { seconds: countdown })
                      : t('loginSendCode')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.field}>
                  <input
                    ref={accountInputRef}
                    className={styles.input}
                    type="text"
                    autoComplete="username"
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
              </>
            )}

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
              {mode === 'sms' ? t('loginAgreementSuffixSms') : null}
            </p>

            {mode === 'password' ? (
              <div className={styles.linksRow}>
                <button type="button" className={styles.textLink} onClick={comingSoon}>
                  {t('loginForgotPassword')}
                </button>
                <button type="button" className={styles.textLink} onClick={comingSoon}>
                  {t('loginRegister')}
                </button>
              </div>
            ) : null}

            <Button type="submit" block className={styles.submit}>
              {t('loginButton')}
            </Button>

            <div className={styles.switchRow}>
              <button
                type="button"
                className={styles.mutedLink}
                onClick={() => setMode(mode === 'sms' ? 'password' : 'sms')}
              >
                {t(mode === 'sms' ? 'loginSwitchToPassword' : 'loginSwitchToSms')}
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
            aria-label={t('loginQuickLogin')}
            onClick={quickLogin}
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
            <span className={styles.qrHint}>{t('loginQuickLogin')}</span>
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
