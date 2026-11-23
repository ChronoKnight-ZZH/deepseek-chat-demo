import clsx from 'clsx'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { usePresence } from '../base/usePresence.js'
import styles from './SidePanel.module.css'

/** 会话区与预览区的最小宽度 */
const MIN_PANE_WIDTH = 384

const clampWidth = (width: number) =>
  Math.min(
    Math.max(width, MIN_PANE_WIDTH),
    Math.max(MIN_PANE_WIDTH, window.innerWidth - MIN_PANE_WIDTH)
  )

/** 同一会话内切换预览内容时沿用上次拖出的宽度 */
let lastWidth: number | null = null

/**
 * 右侧预览面板外壳：标题栏、关闭按钮与左侧拖拽把手。
 * 内容由调用方决定（HTML iframe、文本或 PDF），关闭时保留子节点用于退场动画。
 */
export const SidePanel = ({
  open,
  title,
  ariaLabel,
  headerExtra,
  onClose,
  children,
  className,
  bodyClassName,
}: {
  open: boolean
  title: string
  ariaLabel: string
  /** 标题与关闭按钮之间的操作按钮 */
  headerExtra?: ReactNode
  onClose: () => void
  children: ReactNode
  className?: string
  bodyClassName?: string
}) => {
  const t = useTranslate()
  const { mounted, exiting } = usePresence(open)
  const isMobile = useIsMobile()
  const [width, setWidth] = useState(() => lastWidth ?? clampWidth(window.innerWidth / 2))
  const [resizing, setResizing] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    lastWidth = width
  }, [width])

  // 窗口变窄时把面板收回到允许范围内
  useEffect(() => {
    if (!mounted) {
      return
    }
    const onResize = () => setWidth((current) => clampWidth(current))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [mounted])

  if (!mounted) {
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
      className={clsx(styles.panel, exiting && styles.exiting, className)}
      style={isMobile ? undefined : { width }}
      aria-label={ariaLabel}
    >
      {isMobile ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('sidePanelResize')}
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
        {headerExtra}
        <IconButton
          icon={<IconCloseOutline16 />}
          aria-label={t('close')}
          tooltip={t('close')}
          onClick={onClose}
        />
      </div>
      <div className={clsx(styles.body, bodyClassName)}>{children}</div>
    </aside>
  )
}
