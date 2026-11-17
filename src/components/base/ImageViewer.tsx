import clsx from 'clsx'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from './icons.js'
import { closeImageViewer, useImageViewer } from './imageViewerState.js'
import styles from './ImageViewer.module.css'

const MIN_SCALE = 0.2
const MAX_SCALE = 8
/** 点击图片放大到的倍数 */
const CLICK_SCALE = 2
/** 拖动距离超过该值视为移动图片，不再触发放大 / 缩小 */
const DRAG_THRESHOLD = 5

type View = {
  scale: number
  /** 图片相对居中位置的平移量 */
  x: number
  y: number
}

const INITIAL_VIEW: View = { scale: 1, x: 0, y: 0 }

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

type Drag = {
  pointerId: number
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  scale: number
  moved: boolean
}

/**
 * 页面内的图片预览：深色遮罩上居中显示原图。
 * 点击图片在适应窗口与放大之间切换，滚轮以光标为中心自由缩放，放大后可拖动查看；
 * 点遮罩、右上角关闭按钮或按 Esc 关闭。
 */
export const ImageViewer = () => {
  const t = useTranslate()
  const src = useImageViewer((state) => state.src)
  const alt = useImageViewer((state) => state.alt)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [view, setView] = useState<View>(INITIAL_VIEW)
  /** 点击缩放时启用过渡，滚轮与拖动时即时跟随光标 */
  const [smooth, setSmooth] = useState(false)

  // 打开另一张图片时恢复初始比例
  useEffect(() => {
    setView(INITIAL_VIEW)
    setSmooth(false)
    dragRef.current = null
  }, [src])

  useEffect(() => {
    if (!src) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeImageViewer()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [src])

  // 滚轮需要阻止默认行为，原生监听才能以非 passive 方式注册
  useEffect(() => {
    const overlay = overlayRef.current
    if (!src || !overlay) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = overlay.getBoundingClientRect()
      const px = event.clientX - rect.left - rect.width / 2
      const py = event.clientY - rect.top - rect.height / 2
      setSmooth(false)
      setView((current) => {
        // 不同浏览器的 delta 单位不同，统一换算成像素后再缩放
        const delta =
          event.deltaMode === 1
            ? event.deltaY * 16
            : event.deltaMode === 2
              ? event.deltaY * 400
              : event.deltaY
        const scale = clampScale(current.scale * Math.exp(-delta * 0.0015))
        if (scale === current.scale) {
          return current
        }
        const ratio = scale / current.scale
        return {
          scale,
          x: px - (px - current.x) * ratio,
          y: py - (py - current.y) * ratio,
        }
      })
    }
    overlay.addEventListener('wheel', onWheel, { passive: false })
    return () => overlay.removeEventListener('wheel', onWheel)
  }, [src])

  /** 点击：已放大时还原，适应窗口时以点击位置为中心放大 */
  const toggleZoom = (clientX: number, clientY: number) => {
    const overlay = overlayRef.current
    if (!overlay) {
      return
    }
    const rect = overlay.getBoundingClientRect()
    const px = clientX - rect.left - rect.width / 2
    const py = clientY - rect.top - rect.height / 2
    setSmooth(true)
    setView((current) => {
      if (current.scale > 1) {
        return INITIAL_VIEW
      }
      const ratio = CLICK_SCALE / current.scale
      return {
        scale: CLICK_SCALE,
        x: px - (px - current.x) * ratio,
        y: py - (py - current.y) * ratio,
      }
    })
  }

  const startDrag = (event: PointerEvent<HTMLImageElement>) => {
    if (event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: view.x,
      offsetY: view.y,
      scale: view.scale,
      moved: false,
    }
  }

  const moveDrag = (event: PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      drag.moved = true
    }
    // 未放大时没有可移动的空间，只记录是否发生拖动
    if (drag.scale <= 1) {
      return
    }
    setSmooth(false)
    setView((current) => ({ ...current, x: drag.offsetX + dx, y: drag.offsetY + dy }))
  }

  const endDrag = (event: PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || drag.pointerId !== event.pointerId || drag.moved) {
      return
    }
    toggleZoom(event.clientX, event.clientY)
  }

  const cancelDrag = () => {
    dragRef.current = null
  }

  if (!src) {
    return null
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={alt || t('imagePreview')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeImageViewer()
        }
      }}
    >
      <button
        type="button"
        className={styles.close}
        aria-label={t('close')}
        onClick={closeImageViewer}
      >
        <IconCloseOutline16 />
      </button>
      <img
        className={clsx(
          styles.image,
          view.scale > 1 && styles.imageZoomed,
          smooth && styles.imageSmooth
        )}
        src={src}
        alt={alt}
        draggable={false}
        tabIndex={0}
        style={{
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return
          }
          event.preventDefault()
          const rect = overlayRef.current?.getBoundingClientRect()
          if (rect) {
            toggleZoom(rect.left + rect.width / 2, rect.top + rect.height / 2)
          }
        }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
      />
    </div>,
    document.body
  )
}
