import clsx from 'clsx'
import { memo, useEffect, useMemo, useReducer, useState, type CSSProperties } from 'react'
import Prism from 'prismjs'
import { useTheme } from '../../app/theme.js'
import { useTranslate } from '../../i18n/index.js'
import {
  getHighlightLang,
  isHighlightLoaded,
  loadHighlight,
} from '../../services/markdown/highlight.js'
import {
  exportMermaid,
  renderPreviewSvg,
  toSvgDataUrl,
} from '../../services/markdown/mermaidExport.js'
import {
  IconCheckOutline16,
  IconCopyOutline16,
  IconDownloadOutline16,
  IconEyeOutline16,
  IconFullscreenOutline16,
  IconListOutline16,
  IconZoomInOutline16,
  IconZoomOutOutline16,
} from '../base/icons.js'
import { openImageViewer } from '../base/imageViewerState.js'
import { Menu } from '../base/Menu.js'
import { showToast } from '../base/toastState.js'
import { copyText } from '../../utils/clipboard.js'
import { downloadCode } from '../../utils/html.js'
import { openHtmlPreview } from '../sidePanel/sidePanelState.js'
import {
  hasMermaidError,
  openMermaidLog,
  useMermaidLog,
} from '../../services/markdown/mermaidLog.js'
import { MermaidDiagram } from './MermaidDiagram.js'
import { useFloatingCodeBanner } from './useFloatingCodeBanner.js'
import styles from './CodeBlock.module.css'

/** 图表缩放的上下限与每次增减的步长 */
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 0.25

/** 图表模式下的下载项：PNG / SVG 需要重新绘制，代码直接写原始源码 */
const MermaidDownloadMenu = ({ code, dark }: { code: string; dark: boolean }) => {
  const t = useTranslate()
  const run = (target: 'svg' | 'png' | 'code') => {
    void exportMermaid(target, code, dark).then((ok) => {
      if (!ok) {
        showToast({ key: 'mermaidExportFail' })
      }
    })
  }
  return (
    <Menu
      options={[
        {
          key: 'png',
          label: t('mermaidDownloadPng'),
          icon: <IconDownloadOutline16 />,
          onSelect: () => run('png'),
        },
        {
          key: 'svg',
          label: t('mermaidDownloadSvg'),
          icon: <IconDownloadOutline16 />,
          onSelect: () => run('svg'),
        },
        {
          key: 'code',
          label: t('mermaidDownloadCode'),
          icon: <IconDownloadOutline16 />,
          onSelect: () => run('code'),
        },
      ]}
    >
      {({ toggle }) => (
        <button type="button" className={styles.button} onClick={toggle}>
          <IconDownloadOutline16 />
          <span>{t('download')}</span>
        </button>
      )}
    </Menu>
  )
}

/** 代码块标题栏：左侧语言名或图表开关，右侧按当前模式给出操作 */
const CodeInfoRow = ({
  code,
  infostring,
  dark,
  showDiagram,
  zoom,
  onToggleDiagram,
  onPreview,
  onZoom,
  onFullscreen,
  floating,
  hidden,
  floatingStyle,
}: {
  code: string
  infostring: string
  dark: boolean
  showDiagram: boolean
  zoom: number
  onToggleDiagram?: () => void
  onPreview?: () => void
  onZoom?: (direction: 1 | -1) => void
  onFullscreen?: () => void
  floating: boolean
  hidden: boolean
  floatingStyle?: CSSProperties
}) => {
  const t = useTranslate()
  const [copied, setCopied] = useState(false)
  const isMermaid = onToggleDiagram !== undefined
  // 有渲染或导出失败时，日志入口用红色标记提示
  const hasError = useMermaidLog((state) => hasMermaidError(state.entries))
  const copy = async () => {
    if (!(await copyText(code))) {
      showToast({ key: 'copyFailed' })
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const copyButton = (
    <button type="button" className={styles.button} onClick={copy}>
      {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
      <span>{t(copied ? 'copied' : 'copy')}</span>
    </button>
  )

  // 图表日志入口：有失败记录时标红，两种模式下都可打开
  const logButton = (
    <button
      type="button"
      className={clsx(styles.button, styles.logButton, hasError && styles.logButtonAlert)}
      aria-label={t('mermaidOpenLog')}
      title={t('mermaidOpenLog')}
      onClick={openMermaidLog}
    >
      <IconListOutline16 />
    </button>
  )

  return (
    <div
      className={clsx(
        styles.container,
        floating && styles.floating,
        hidden && styles.floatingHidden
      )}
      style={floatingStyle}
    >
      {isMermaid ? (
        <div className={styles.switch} role="group" aria-label={t('mermaidSwitchLabel')}>
          <button
            type="button"
            className={clsx(styles.switchButton, showDiagram && styles.switchActive)}
            aria-pressed={showDiagram}
            onClick={() => !showDiagram && onToggleDiagram()}
          >
            {t('mermaidDiagram')}
          </button>
          <button
            type="button"
            className={clsx(styles.switchButton, !showDiagram && styles.switchActive)}
            aria-pressed={!showDiagram}
            onClick={() => showDiagram && onToggleDiagram()}
          >
            {t('mermaidCode')}
          </button>
        </div>
      ) : (
        <span className={styles.name}>{infostring}</span>
      )}
      <div className={styles.actions}>
        {isMermaid && showDiagram ? (
          <>
            <button
              type="button"
              className={styles.button}
              aria-label={t('mermaidZoomOut')}
              title={t('mermaidZoomOut')}
              disabled={zoom <= ZOOM_MIN}
              onClick={() => onZoom?.(-1)}
            >
              <IconZoomOutOutline16 />
            </button>
            <button
              type="button"
              className={styles.button}
              aria-label={t('mermaidZoomIn')}
              title={t('mermaidZoomIn')}
              disabled={zoom >= ZOOM_MAX}
              onClick={() => onZoom?.(1)}
            >
              <IconZoomInOutline16 />
            </button>
            <div className={styles.divider} />
            <MermaidDownloadMenu code={code} dark={dark} />
            <button type="button" className={styles.button} onClick={onFullscreen}>
              <IconFullscreenOutline16 />
              <span>{t('fullscreen')}</span>
            </button>
            {logButton}
          </>
        ) : (
          <>
            {copyButton}
            <button
              type="button"
              className={styles.button}
              onClick={() => downloadCode(code, infostring)}
            >
              <IconDownloadOutline16 />
              <span>{t('download')}</span>
            </button>
            {onPreview ? (
              <>
                <div className={styles.divider}></div>
                <button type="button" className={styles.button} onClick={onPreview}>
                  <IconEyeOutline16 />
                  <span>{t('preview')}</span>
                </button>
              </>
            ) : null}
            {isMermaid ? (
              <>
                <div className={styles.divider} />
                {logButton}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

/** 代码块：语言包按需加载，不支持或尚未加载的语言按纯文本显示 */
export const CodeBlock = memo(function CodeBlock({
  code,
  infostring,
  loading = false,
}: {
  code: string
  infostring: string
  loading?: boolean
}) {
  const t = useTranslate()
  const dark = useTheme() === 'dark'
  const isMermaid = infostring.toLowerCase() === 'mermaid'
  const isHtml = ['html', 'htm'].includes(infostring.trim().toLowerCase())
  const [showDiagram, setShowDiagram] = useState(true)
  const [zoom, setZoom] = useState(1)
  // 语言包注册在全局 Prism 上，每次渲染直接判断；加载完成后触发一次重渲染
  const rerender = useReducer((n: number) => n + 1, 0)[1]
  const lang = getHighlightLang(infostring)
  const loaded = lang !== null && isHighlightLoaded(lang)
  useEffect(() => {
    if (lang === null || loaded) {
      return
    }
    let unmounted = false
    loadHighlight(lang).then(() => {
      if (!unmounted) {
        rerender()
      }
    })
    return () => {
      unmounted = true
    }
  }, [lang, loaded, rerender])
  const renderedHtml = useMemo(() => {
    const name = lang !== null && loaded ? lang : 'plaintext'
    return Prism.highlight(code, Prism.languages[name], name)
  }, [code, lang, loaded])
  const {
    blockRef,
    bannerRef,
    topAnchorRef,
    bottomAnchorRef,
    floating,
    hidden,
    placeholderHeight,
    floatingStyle,
  } = useFloatingCodeBanner()

  const changeZoom = (direction: 1 | -1) =>
    setZoom((current) =>
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((current + direction * ZOOM_STEP).toFixed(2))))
    )

  return (
    <div className="md-code-block" ref={blockRef}>
      <span ref={topAnchorRef} className={styles.anchorTop} aria-hidden="true" />
      <div className="md-code-block-banner" ref={bannerRef}>
        {floating ? (
          <div
            className={styles.placeholder}
            style={{ height: placeholderHeight }}
            aria-hidden="true"
          />
        ) : null}
        <CodeInfoRow
          code={code}
          infostring={infostring}
          dark={dark}
          showDiagram={showDiagram}
          zoom={zoom}
          onToggleDiagram={isMermaid ? () => setShowDiagram((show) => !show) : undefined}
          onPreview={isHtml ? () => openHtmlPreview(code) : undefined}
          onZoom={changeZoom}
          onFullscreen={() => {
            // 放大到页面上方的图层里预览，支持滚轮缩放、拖动与关闭
            void renderPreviewSvg(code, dark).then((source) => {
              if (!source) {
                showToast({ key: 'mermaidExportFail' })
                return
              }
              openImageViewer(toSvgDataUrl(source), t('mermaidPreviewLabel'))
            })
          }}
          floating={floating}
          hidden={hidden}
          floatingStyle={floatingStyle}
        />
      </div>
      {isMermaid && showDiagram ? (
        <MermaidDiagram code={code} loading={loading} scale={zoom} />
      ) : (
        <pre dangerouslySetInnerHTML={{ __html: renderedHtml }}></pre>
      )}
      <span ref={bottomAnchorRef} className={styles.anchorBottom} aria-hidden="true" />
    </div>
  )
})
