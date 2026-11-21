import { useId, useRef, useState, type FormEvent } from 'react'
import type { TranslationKey } from '../../i18n/index.js'
import { useTranslate } from '../../i18n/index.js'
import { changePassword } from '../../services/auth.js'
import { AuthApiError } from '../../services/api/auth.js'
import { isWebCryptoAvailable } from '../../services/auth/crypto.js'
import { describeAuthError } from '../../services/auth/errors.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './Settings.module.css'

/** 改密成功后服务端撤销全部会话，因此这里不保留登录态 */
export const ChangePasswordDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate()
  const formId = useId()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
  const submittingRef = useRef(false)

  const close = () => {
    if (!submittingRef.current) {
      onClose()
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submittingRef.current) {
      return
    }
    if (!oldPassword.trim() || !newPassword.trim()) {
      setErrorKey('authInvalidInput')
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorKey('loginPasswordMismatch')
      return
    }
    if (!isWebCryptoAvailable()) {
      setErrorKey('authWebCryptoUnavailable')
      return
    }
    submittingRef.current = true
    setErrorKey(null)
    setSubmitting(true)
    try {
      await changePassword(oldPassword, newPassword)
      showToast({ key: 'loginPasswordChanged' })
    } catch (error) {
      // 改密已经提交但 Redis 撤销失败：密码可能已修改，不能简单提示“失败”
      setErrorKey(
        error instanceof AuthApiError && error.code === 'SESSION_WRITE_FAILED'
          ? 'authChangePasswordUncertain'
          : describeAuthError(error, 'authOldPasswordIncorrect')
      )
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={t('loginChangePasswordTitle')}
      closable={!submitting}
      className={styles.changePassword}
      onClose={close}
      footer={
        <div className={styles.changePasswordActions} aria-busy={submitting}>
          <Button variant="outlined" size="m" disabled={submitting} onClick={close}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            size="m"
            disabled={submitting}
          >
            {t(submitting ? 'loginChangingPassword' : 'loginChangePassword')}
          </Button>
        </div>
      }
    >
      <form id={formId} className={styles.changePasswordForm} onSubmit={(event) => void submit(event)} noValidate>
        <label className={styles.passwordField}>
          <span>{t('loginOldPassword')}</span>
          <input
            className={styles.passwordInput}
            type="password"
            autoComplete="current-password"
            autoFocus
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
          />
        </label>
        <label className={styles.passwordField}>
          <span>{t('loginNewPassword')}</span>
          <input
            className={styles.passwordInput}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <label className={styles.passwordField}>
          <span>{t('loginConfirmPassword')}</span>
          <input
            className={styles.passwordInput}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
        {errorKey ? (
          <p className={styles.passwordError} role="alert">
            {t(errorKey)}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
