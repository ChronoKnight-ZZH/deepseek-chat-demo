import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { formatSize } from '../../services/attachments.js'
import {
  loadPreviewContent,
  PREVIEW_MAX_CHARS,
  type PreviewContent,
} from '../../services/filePreview.js'
import { copyText } from '../../utils/clipboard.js'
import { saveBlob } from '../../utils/download.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { closeFilePreview, useFilePreview } from './filePreviewState.js'
import styles from './FilePreviewDialog.module.css'

type Content = { status: 'loading' } | { status: 'failed' } | ({ status: 'ready' } & PreviewContent)

/**
 * 消息附件的文本预览：原件优先读本地 IndexedDB，本地缺失时用 p 票据取内联字节，
 * 在弹窗里按文本展示；不是文本或读取失败时提示原因，仍可下载原件。
 */
export const FilePreviewDialog = () => {
  const t = useTranslate()
  const target = useFilePreview((state) => state.target)
  const [content, setContent] = useState<Content>({ status: 'loading' })

  useEffect(() => {
    if (!target) {
      return
    }
    let cancelled = false
    setContent({ status: 'loading' })
    loadPreviewContent(target)
      .then((result) => {
        if (!cancelled) {
          setContent({ status: 'ready', ...result })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent({ status: 'failed' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [target])

  if (!target) {
    return null
  }

  const ready = content.status === 'ready' ? content : null
  const text = ready && !ready.binary ? ready.text : ''

  /** 已取到原件字节时直接保存，文件名与原件一致；否则退回 r 票据地址 */
  const download = () => {
    if (ready) {
      saveBlob(ready.blob, target.name)
    } else if (target.downloadUrl) {
      window.open(target.downloadUrl, '_blank', 'noreferrer')
    }
  }

  return (
    <Modal
      title={
        <span className={styles.title}>
          <span className={styles.name}>{target.name}</span>
          <span className={styles.meta}>{formatSize(target.size)}</span>
        </span>
      }
      closable
      className={styles.dialog}
      mainClassName={styles.main}
      onClose={closeFilePreview}
      footer={
        <>
          <Button
            variant="outlined"
            size="s"
            disabled={text.length === 0}
            onClick={() => {
              void copyText(text).then((ok) => showToast({ key: ok ? 'copied' : 'copyFailed' }))
            }}
          >
            {t('copy')}
          </Button>
          <Button
            variant="primary"
            size="s"
            disabled={!ready && !target.downloadUrl}
            onClick={download}
          >
            {t('download')}
          </Button>
        </>
      }
    >
      {content.status === 'loading' ? (
        <div className={styles.hint}>{t('filePreviewLoading')}</div>
      ) : content.status === 'failed' ? (
        <div className={styles.hint}>{t('filePreviewFailed')}</div>
      ) : content.binary ? (
        <div className={styles.hint}>{t('filePreviewBinary')}</div>
      ) : text.length === 0 ? (
        <div className={styles.hint}>{t('filePreviewEmpty')}</div>
      ) : (
        <>
          <pre className={styles.text}>{text}</pre>
          {content.truncated ? (
            <div className={styles.truncated}>
              {t('filePreviewTruncated', { count: PREVIEW_MAX_CHARS.toLocaleString() })}
            </div>
          ) : null}
        </>
      )}
    </Modal>
  )
}
