import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  isMarkdownFile,
  loadPreviewContent,
  PREVIEW_MAX_CHARS,
  type FilePreviewTarget,
  type PreviewContent,
} from '../../services/filePreview.js'
import { copyText } from '../../utils/clipboard.js'
import { saveBlob } from '../../utils/download.js'
import { Button } from '../base/Button.js'
import {
  IconCopyOutline16,
  IconDownloadOutline16,
  IconZoomInOutline16,
  IconZoomOutOutline16,
} from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { showToast } from '../base/toastState.js'
import { Markdown } from '../markdown/Markdown.js'
import { SidePanel } from '../sidePanel/SidePanel.js'
import { closeFilePreview, useSidePanel } from '../sidePanel/sidePanelState.js'
import { requestFileDownload } from './fileDownloadState.js'
import { PDF_MAX_SCALE, PDF_MIN_SCALE, PdfPreview, type PdfPreviewHandle } from './PdfPreview.js'
import { usePdfDocument } from './usePdfDocument.js'
import styles from './FilePreviewPanel.module.css'

type Content = { status: 'loading' } | { status: 'failed' } | ({ status: 'ready' } & PreviewContent)

/**
 * 右侧文件预览面板：Markdown 复用会话消息的排版，其他文本按等宽展示，
 * PDF 用 pdf.js 渲染以自定义顶栏；读取失败或嗅探为二进制时不强行展示，改为确认后下载原件。
 */
export const FilePreviewPanel = () => {
  const t = useTranslate()
  const content = useSidePanel((state) => state.content)
  const target = content?.kind === 'file' ? content.target : null
  // 关闭时保留最后一个文件，让面板滑出时不至于瞬间清空
  const [lastTarget, setLastTarget] = useState<FilePreviewTarget | null>(null)
  const displayTarget = target ?? lastTarget
  const [state, setState] = useState<Content>({ status: 'loading' })

  const pdfRef = useRef<PdfPreviewHandle>(null)
  const cancelPageRef = useRef(false)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfScale, setPdfScale] = useState(1)
  const [pageDraft, setPageDraft] = useState('1')
  const [editingPage, setEditingPage] = useState(false)

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

  // 换文件时页码与缩放回到初始状态
  useEffect(() => {
    if (!target) {
      return
    }
    cancelPageRef.current = false
    setPdfPage(1)
    setPdfScale(1)
    setPageDraft('1')
    setEditingPage(false)
  }, [target])

  const pdfBlob = state.status === 'ready' && state.kind === 'pdf' ? state.blob : null
  const { doc: pdfDoc, failed: pdfFailed } = usePdfDocument(pdfBlob)

  const onPdfPageChange = useCallback((page: number) => setPdfPage(page), [])
  const onPdfScaleChange = useCallback((scale: number) => setPdfScale(scale), [])

  if (!displayTarget) {
    return null
  }

  const ready = state.status === 'ready' ? state : null
  const text = ready?.kind === 'text' ? ready.text : ''
  const canDownload = Boolean(ready) || Boolean(displayTarget.downloadUrl)
  const isPdf = ready?.kind === 'pdf'
  const isMarkdown =
    ready?.kind === 'text' && isMarkdownFile(displayTarget.name, displayTarget.mimeType)
  const numPages = pdfDoc?.numPages ?? null

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

  /** 页码输入框失焦或回车后应用，超出范围时夹到首尾页 */
  const applyPage = () => {
    setEditingPage(false)
    if (cancelPageRef.current) {
      cancelPageRef.current = false
      return
    }
    if (!numPages) {
      return
    }
    const parsed = Number.parseInt(pageDraft, 10)
    if (!Number.isFinite(parsed)) {
      return
    }
    const next = Math.min(Math.max(parsed, 1), numPages)
    setPdfPage(next)
    pdfRef.current?.goToPage(next)
  }

  const pdfToolbar = (
    <div className={styles.pdfToolbar}>
      {editingPage ? (
        <input
          className={styles.pdfPage}
          value={pageDraft}
          aria-label={t('pdfPage')}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setPageDraft(event.target.value.replace(/\D/g, '').slice(0, 6))
          }}
          onBlur={applyPage}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              cancelPageRef.current = true
              event.currentTarget.blur()
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.pdfPage}
          aria-label={t('pdfPage')}
          disabled={!numPages}
          onClick={() => {
            setPageDraft(String(pdfPage))
            setEditingPage(true)
          }}
        >
          {pdfPage}
        </button>
      )}
      <span className={styles.pdfTotal}>/ {numPages ?? '—'}</span>
      <IconButton
        icon={<IconZoomOutOutline16 />}
        tooltip={t('pdfZoomOut')}
        disabled={!numPages || pdfScale <= PDF_MIN_SCALE + 1e-6}
        onClick={() => pdfRef.current?.zoomOut()}
      />
      <IconButton
        icon={<IconZoomInOutline16 />}
        tooltip={t('pdfZoomIn')}
        disabled={!numPages || pdfScale >= PDF_MAX_SCALE - 1e-6}
        onClick={() => pdfRef.current?.zoomIn()}
      />
    </div>
  )

  return (
    <SidePanel
      open={target !== null}
      title={displayTarget.name}
      ariaLabel={t('filePreview')}
      onClose={closeFilePreview}
      headerExtra={
        isPdf ? (
          pdfToolbar
        ) : (
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
        )
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
        pdfFailed ? (
          <div className={styles.hint}>
            <span>{t('filePreviewFailed')}</span>
            <Button variant="outlined" size="s" disabled={!canDownload} onClick={download}>
              {t('download')}
            </Button>
          </div>
        ) : pdfDoc ? (
          <PdfPreview
            ref={pdfRef}
            doc={pdfDoc}
            onPageChange={onPdfPageChange}
            onScaleChange={onPdfScaleChange}
          />
        ) : (
          <div className={styles.hint}>{t('filePreviewLoading')}</div>
        )
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
          {isMarkdown ? (
            // Markdown 文档复用会话消息的排版，而不是展示源码
            <div className={styles.markdown}>
              <Markdown
                content={text}
                loading={false}
                cacheKey={displayTarget.id}
                disableLink={false}
              />
            </div>
          ) : (
            <pre className={styles.text}>{text}</pre>
          )}
        </div>
      )}
    </SidePanel>
  )
}
