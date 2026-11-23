import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  loadPreviewContent,
  PREVIEW_MAX_CHARS,
  type FilePreviewTarget,
  type PreviewContent,
} from '../../services/filePreview.js'
import { copyText } from '../../utils/clipboard.js'
import { saveBlob } from '../../utils/download.js'
import { Button } from '../base/Button.js'
import { IconCopyOutline16, IconDownloadOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { showToast } from '../base/toastState.js'
import { SidePanel } from '../sidePanel/SidePanel.js'
import { closeFilePreview, useSidePanel } from '../sidePanel/sidePanelState.js'
import { requestFileDownload } from './fileDownloadState.js'
import styles from './FilePreviewPanel.module.css'

type Content = { status: 'loading' } | { status: 'failed' } | ({ status: 'ready' } & PreviewContent)

/**
 * 右侧文件预览面板：文本按等宽排版展示，PDF 交给浏览器内置阅读器；
 * 读取失败或嗅探为二进制时不强行展示，改为确认后下载原件。
 */
export const FilePreviewPanel = () => {
  const t = useTranslate()
  const content = useSidePanel((state) => state.content)
  const target = content?.kind === 'file' ? content.target : null
  // 关闭时保留最后一个文件，让面板滑出时不至于瞬间清空
  const [lastTarget, setLastTarget] = useState<FilePreviewTarget | null>(null)
  const displayTarget = target ?? lastTarget
  const [state, setState] = useState<Content>({ status: 'loading' })

  useEffect(() => {
    if (target) {
      setLastTarget(target)
    }
  }, [target])

  useEffect(() => {
    if (!displayTarget) {
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    loadPreviewContent(displayTarget)
      .then((result) => {
        if (!cancelled) {
          setState({ status: 'ready', ...result })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'failed' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [displayTarget])

  // PDF 需要可被 iframe 打开的地址；补齐 MIME 以兼容 IndexedDB 里没有 type 的原件
  const pdfBlob = state.status === 'ready' && state.kind === 'pdf' ? state.blob : null
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!pdfBlob) {
      setPdfUrl(null)
      return
    }
    // 原件已带正确 MIME 时直接复用，避免大文件再复制一份
    const typed =
      pdfBlob.type === 'application/pdf'
        ? pdfBlob
        : new Blob([pdfBlob], { type: 'application/pdf' })
    const url = URL.createObjectURL(typed)
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pdfBlob])

  if (!displayTarget) {
    return null
  }

  const ready = state.status === 'ready' ? state : null
  const text = ready?.kind === 'text' ? ready.text : ''
  const canDownload = Boolean(ready) || Boolean(displayTarget.downloadUrl)

  /** 可预览的内容直接保存；读不出来或不是文本时先确认再下载 */
  const download = () => {
    if (ready && ready.kind !== 'binary') {
      saveBlob(ready.blob, displayTarget.name)
      return
    }
    requestFileDownload({
      name: displayTarget.name,
      blob: ready?.blob ?? null,
      url: displayTarget.downloadUrl,
    })
  }

  return (
    <SidePanel
      open={target !== null}
      title={displayTarget.name}
      ariaLabel={t('filePreview')}
      onClose={closeFilePreview}
      headerExtra={
        <>
          <IconButton
            icon={<IconCopyOutline16 />}
            tooltip={t('copy')}
            disabled={text.length === 0}
            onClick={() => {
              void copyText(text).then((ok) => showToast({ key: ok ? 'copied' : 'copyFailed' }))
            }}
          />
          <IconButton
            icon={<IconDownloadOutline16 />}
            tooltip={t('download')}
            disabled={!canDownload}
            onClick={download}
          />
        </>
      }
    >
      {state.status === 'loading' ? (
        <div className={styles.hint}>{t('filePreviewLoading')}</div>
      ) : state.status === 'failed' ? (
        <div className={styles.hint}>
          <span>{t('filePreviewFailed')}</span>
          <Button variant="outlined" size="s" disabled={!canDownload} onClick={download}>
            {t('download')}
          </Button>
        </div>
      ) : state.kind === 'pdf' ? (
        pdfUrl ? (
          <iframe
            className={styles.pdf}
            title={displayTarget.name}
            src={`${pdfUrl}#toolbar=1&navpanes=0&view=FitH`}
            referrerPolicy="no-referrer"
          />
        ) : null
      ) : state.kind === 'binary' ? (
        <div className={styles.hint}>
          <span>{t('filePreviewBinary')}</span>
          <Button variant="outlined" size="s" disabled={!canDownload} onClick={download}>
            {t('download')}
          </Button>
        </div>
      ) : text.length === 0 ? (
        <div className={styles.hint}>{t('filePreviewEmpty')}</div>
      ) : (
        <div className={styles.textWrap}>
          {state.truncated ? (
            <div className={styles.truncated}>
              {t('filePreviewTruncated', { count: PREVIEW_MAX_CHARS.toLocaleString() })}
            </div>
          ) : null}
          <pre className={styles.text}>{text}</pre>
        </div>
      )}
    </SidePanel>
  )
}
