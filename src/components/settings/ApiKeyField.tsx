import { useEffect, useRef, useState } from 'react'
import { IconEditOutline16, IconRefreshOutline16, IconTrashOutline16 } from '../base/icons.js'
import { setApiKey, useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { IconButton } from '../base/IconButton.js'
import { useApiKeyForm } from './useApiKeyForm.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './Settings.module.css'
import { fetchBalance } from '../../services/api/client.js'
import type { BalanceInfo } from '../../services/api/types.js'

const BALANCE_TTL_MS = 5 * 60 * 1000 // 同一 API Key 5 分钟内不重复请求

type BalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'data'; info: BalanceInfo; available: boolean }
  | { status: 'error'; message: string }

const pickBalanceInfo = (infos: BalanceInfo[]): BalanceInfo | null => {
  if (infos.length === 0) {
    return null
  }
  const cny = infos.find((info) => info.currency === 'CNY')
  return cny ?? infos[0]
}

const formatMoney = (value: string) => {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return '0.00'
  }
  return num.toFixed(2)
}

/**
 * 账户余额加载：跟随 apiKey 变化，带 5 分钟缓存。
 * 调用方传入 showSaved（等于 apiKey && !editing）确保只在掩码状态下查询。
 */
const useBalance = (apiKey: string | null, showSaved: boolean) => {
  const [state, setState] = useState<BalanceState>({ status: 'idle' })
  const cacheRef = useRef<{ key: string; fetchedAt: number } | null>(null)
  const lastKeyRef = useRef<string | null>(null)
  const loadRef = useRef<(force?: boolean) => Promise<void>>(async () => {})

  loadRef.current = async (force = false) => {
    if (!apiKey || !showSaved) {
      setState({ status: 'idle' })
      return
    }
    if (
      !force &&
      cacheRef.current?.key === apiKey &&
      Date.now() - cacheRef.current.fetchedAt < BALANCE_TTL_MS
    ) {
      return
    }
    setState({ status: 'loading' })
    try {
      const response = await fetchBalance(apiKey)
      const info = pickBalanceInfo(response.balance_infos)
      if (!info) {
        setState({ status: 'error', message: 'no_balance_info' })
        return
      }
      cacheRef.current = { key: apiKey, fetchedAt: Date.now() }
      setState({ status: 'data', info, available: response.is_available })
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  useEffect(() => {
    if (!apiKey || !showSaved) {
      setState({ status: 'idle' })
      lastKeyRef.current = null
      return
    }
    // 新 apiKey 强制刷新，老 apiKey 走缓存
    const force = lastKeyRef.current !== apiKey
    lastKeyRef.current = apiKey
    void loadRef.current(force)
  }, [apiKey, showSaved])

  return { state, refresh: () => void loadRef.current(true) }
}

/** API Key 的编辑状态：输入框与移动端底部的「确定」按钮共用 */
export const useApiKeyEditor = () => {
  const apiKey = useSettings((state) => state.apiKey)
  const [editing, setEditing] = useState(false)
  const form = useApiKeyForm(() => setEditing(false))
  return { apiKey, editing, setEditing, form, showInput: !apiKey || editing }
}

type ApiKeyEditor = ReturnType<typeof useApiKeyEditor>

/** API Key：保存后只显示掩码，点编辑按钮才能重新输入 */
export const ApiKeyField = ({ editor }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const { apiKey, editing, setEditing, form, showInput } = editor
  const showSaved = Boolean(apiKey && !editing)
  const { state: balance, refresh: refreshBalance } = useBalance(apiKey, showSaved)

  return (
    <div className={styles.cell}>
      <div className={styles.apiKey}>
        <div className={styles.label}>{t('apiKeyStart')}</div>
        {apiKey && !editing ? (
          <div className={styles.apiKeySaved}>
            <span className={styles.apiKeyMask}>{'*'.repeat(apiKey.length)}</span>
            <div className={styles.apiKeyActions}>
              <IconButton
                tone="primary"
                icon={<IconEditOutline16 />}
                tooltip={t('apiKeyEdit')}
                onClick={() => setEditing(true)}
              />
              <IconButton
                tone="danger"
                icon={<IconTrashOutline16 />}
                tooltip={t('apiKeyDelete')}
                onClick={() => setApiKey(null)}
              />
            </div>
          </div>
        ) : (
          <div className={styles.apiKeyInput}>
            <input
              type="password"
              placeholder={t('apiKeyPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              // 移动端打开设置时不弹键盘，点编辑后才聚焦
              autoFocus={!isMobile || editing}
              value={form.value}
              onChange={(event) => form.setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  void form.submit()
                }
              }}
              onBlur={() => {
                // 修改时没输入就离开，回到已保存的状态
                if (apiKey && !form.value.trim()) {
                  setEditing(false)
                }
              }}
            />
            {!isMobile && form.value.trim() ? (
              <>
                <span className={styles.divider} />
                <button
                  type="button"
                  className={styles.confirm}
                  disabled={form.verifying}
                  // 保持输入框焦点
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void form.submit()}
                >
                  {form.verifying ? t('apiKeyVerifying') : t('confirm')}
                </button>
              </>
            ) : null}
          </div>
        )}
        {showInput && form.error ? <div className={styles.error}>{form.error}</div> : null}
        {showSaved ? (
          <div className={styles.balance}>
            {balance.status === 'loading' ? (
              <span className={styles.balanceLoading}>{t('balanceLoading')}</span>
            ) : balance.status === 'error' ? (
              <span className={styles.balanceError}>{t('balanceError')}</span>
            ) : balance.status === 'data' ? (
              balance.available ? (
                <span className={styles.balanceText}>
                  {t('balanceTotal', {
                    currency: balance.info.currency,
                    amount: formatMoney(balance.info.total_balance),
                  })}
                  <span className={styles.balanceSplit}>
                    {t('balanceDetail', {
                      granted: formatMoney(balance.info.granted_balance),
                      toppedUp: formatMoney(balance.info.topped_up_balance),
                    })}
                  </span>
                </span>
              ) : (
                <span className={styles.balanceError}>{t('balanceUnavailable')}</span>
              )
            ) : null}
            <IconButton
              tone="primary"
              icon={<IconRefreshOutline16 />}
              tooltip={t('balanceRefresh')}
              onClick={() => refreshBalance()}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 移动端：输入 API Key 时在选项下方显示整行「确定」 */
export const ApiKeyConfirm = ({ editor: { showInput, form } }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  return showInput && form.value.trim() ? (
    <button
      type="button"
      className={styles.mobileConfirm}
      disabled={form.verifying}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void form.submit()}
    >
      {form.verifying ? t('apiKeyVerifying') : t('confirm')}
    </button>
  ) : null
}
