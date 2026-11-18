import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { getHtmlTitle } from '../../utils/html.js'
import { IconCloseOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { closeHtmlPreview, useHtmlPreview } from './htmlPreviewState.js'
import styles from './HtmlPreviewPanel.module.css'

/** 会话区与预览区的最小宽度 */
const MIN_PANE_WIDTH = 384

const clampWidth = (width: number) =>
  Math.min(
    Math.max(width, MIN_PANE_WIDTH),
    Math.max(MIN_PANE_WIDTH, window.innerWidth - MIN_PANE_WIDTH)
  )

/** 右侧 HTML 预览面板：标题取自页面 <title>，左侧把手可拖动调整宽度 */
export const HtmlPreviewPanel = () => {
  const t = useTranslate()
  const code = useHtmlPreview((state) => state.code)
  const isMobile = useIsMobile()
  const [width, setWidth] = useState(() => clampWidth(window.innerWidth / 2))
  const [resizing, setResizing] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const title = useMemo(() => {
    if (code === null) {
      return ''
    }
    return getHtmlTitle(code) || t('htmlPreview')
  }, [code, t])

  // 窗口变窄时把面板收回到允许范围内
  useEffect(() => {
    if (code === null) {
      return
    }
    const onResize = () => setWidth((current) => clampWidth(current))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [code])

  if (code === null) {
    return null
  }

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startX: event.clientX, startWidth: width }
    setResizing(true)
  }

  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    // 把手向左侧拖动时预览区变宽
    setWidth(clampWidth(drag.startWidth + drag.startX - event.clientX))
  }

  const endResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return
    }
    dragRef.current = null
    setResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  // 键盘方向键也能调整宽度，每次 16px
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? 16 : -16
    setWidth((current) => clampWidth(current + delta))
  }

  const maxWidth = Math.max(MIN_PANE_WIDTH, window.innerWidth - MIN_PANE_WIDTH)

  return (
    <aside
      className={styles.panel}
      style={isMobile ? undefined : { width }}
      aria-label={t('htmlPreview')}
    >
      {isMobile ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('htmlPreviewResize')}
          aria-valuemin={MIN_PANE_WIDTH}
          aria-valuemax={maxWidth}
          aria-valuenow={Math.round(width)}
          tabIndex={0}
          className={resizing ? `${styles.handle} ${styles.active}` : styles.handle}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onLostPointerCapture={() => {
            dragRef.current = null
            setResizing(false)
          }}
          onKeyDown={onKeyDown}
        >
          <span className={styles.grip} />
        </div>
      )}
      <div className={styles.header}>
        <div role="heading" aria-level={2} className={styles.title} title={title}>
          {title}
        </div>
        <IconButton
          icon={<IconCloseOutline16 />}
          aria-label={t('close')}
          tooltip={t('close')}
          onClick={closeHtmlPreview}
        />
      </div>
      <iframe
        className={styles.frame}
        title={title}
        srcDoc={code}
        sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-pointer-lock"
        referrerPolicy="no-referrer"
      />
    </aside>
  )
}
