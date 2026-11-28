import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useTranslate } from '../../i18n/index.js'
import styles from './PdfPreview.module.css'

/** 缩放范围，顶栏按钮据此禁用 */
export const PDF_MIN_SCALE = 0.25
export const PDF_MAX_SCALE = 4

const ZOOM_FACTOR = 1.2
/** 页面左右留白之和，计算适宽时扣除 */
const PAGE_GUTTER = 32

type PageSize = { width: number; height: number }

const clampScale = (scale: number) => Math.min(Math.max(scale, PDF_MIN_SCALE), PDF_MAX_SCALE)

export type PdfPreviewHandle = {
  /** 跳到指定页（1 起算），用于顶栏页码输入 */
  goToPage: (page: number) => void
  zoomIn: () => void
  zoomOut: () => void
}

type PdfPreviewProps = {
  doc: PDFDocumentProxy
  onPageChange: (page: number) => void
  onScaleChange: (scale: number) => void
}

/**
 * PDF 画布渲染：按需渲染可视区域附近的页面，避免整本文件同时占用内存。
 * 顶栏控件通过 ref 调用跳页与缩放，滚动时把当前页回传给调用方。
 */
export const PdfPreview = forwardRef<PdfPreviewHandle, PdfPreviewProps>(
  ({ doc, onPageChange, onScaleChange }, ref) => {
    const t = useTranslate()
    const scrollRef = useRef<HTMLDivElement>(null)
    const pageEls = useRef<Array<HTMLDivElement | null>>([])
    const pageRef = useRef(1)
    const frameRef = useRef(0)
    const manualZoomRef = useRef(false)
    const onPageChangeRef = useRef(onPageChange)
    const onScaleChangeRef = useRef(onScaleChange)

    const [sizes, setSizes] = useState<PageSize[]>([])
    const [scale, setScale] = useState<number | null>(null)
    const [containerWidth, setContainerWidth] = useState(0)

    useEffect(() => {
      onPageChangeRef.current = onPageChange
    }, [onPageChange])

    useEffect(() => {
      onScaleChangeRef.current = onScaleChange
    }, [onScaleChange])

    // 读取每页的原始尺寸：先撑出占位高度，滚动位置在渲染前后保持一致
    useEffect(() => {
      let cancelled = false
      setSizes([])
      const load = async () => {
        const next: PageSize[] = []
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          const pdfPage = await doc.getPage(pageNumber)
          const viewport = pdfPage.getViewport({ scale: 1 })
          next.push({ width: viewport.width, height: viewport.height })
          pdfPage.cleanup()
          if (cancelled) {
            return
          }
        }
        setSizes(next)
      }
      void load().catch(() => {
        // 文档被销毁时 getPage 会失败，此时无需处理
      })
      return () => {
        cancelled = true
      }
    }, [doc])

    // 切换文档时回到第一页，并等待重新计算适宽
    useEffect(() => {
      manualZoomRef.current = false
      pageRef.current = 1
      setScale(null)
      onPageChangeRef.current(1)
    }, [doc])

    // 观察容器宽度：首次拿到尺寸后按容器宽度铺满一页
    useEffect(() => {
      const el = scrollRef.current
      if (!el) {
        return
      }
      setContainerWidth(el.clientWidth)
      const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth))
      observer.observe(el)
      return () => observer.disconnect()
    }, [])

    // 用户未手动缩放前始终按容器宽度铺满一页，面板拖动改宽时也跟着适配
    useLayoutEffect(() => {
      if (manualZoomRef.current || sizes.length === 0 || containerWidth <= 0) {
        return
      }
      setScale(clampScale((containerWidth - PAGE_GUTTER) / sizes[0].width))
    }, [sizes, containerWidth])

    useEffect(() => {
      if (scale !== null) {
        onScaleChangeRef.current(scale)
      }
    }, [scale])

    // 缩放后让当前页仍停留在视野顶部，避免跳回第一页
    useLayoutEffect(() => {
      if (scale === null || sizes.length === 0) {
        return
      }
      const el = scrollRef.current
      const node = pageEls.current[pageRef.current - 1]
      if (el && node) {
        el.scrollTop = Math.max(0, node.offsetTop - 12)
      }
    }, [scale, sizes])

    const setCurrentPage = useCallback((next: number) => {
      if (pageRef.current === next) {
        return
      }
      pageRef.current = next
      onPageChangeRef.current(next)
    }, [])

    const onScroll = () => {
      if (frameRef.current !== 0) {
        return
      }
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0
        const el = scrollRef.current
        if (!el) {
          return
        }
        // 以容器顶部下方一点为准，找到正在阅读的页面
        const line = el.scrollTop + 24
        let next = 1
        for (let index = 0; index < pageEls.current.length; index += 1) {
          const node = pageEls.current[index]
          if (!node) {
            continue
          }
          if (node.offsetTop <= line) {
            next = index + 1
          } else {
            break
          }
        }
        setCurrentPage(next)
      })
    }

    useEffect(
      () => () => {
        if (frameRef.current !== 0) {
          window.cancelAnimationFrame(frameRef.current)
        }
      },
      []
    )

    const goToPage = useCallback(
      (target: number) => {
        const next = Math.min(Math.max(Math.round(target), 1), doc.numPages)
        const el = scrollRef.current
        const node = pageEls.current[next - 1]
        if (el && node) {
          el.scrollTop = Math.max(0, node.offsetTop - 12)
        }
        setCurrentPage(next)
      },
      [doc.numPages, setCurrentPage]
    )

    useImperativeHandle(
      ref,
      () => ({
        goToPage,
        zoomIn: () => {
          manualZoomRef.current = true
          setScale((current) => (current === null ? current : clampScale(current * ZOOM_FACTOR)))
        },
        zoomOut: () => {
          manualZoomRef.current = true
          setScale((current) => (current === null ? current : clampScale(current / ZOOM_FACTOR)))
        },
      }),
      [goToPage]
    )

    const registerPage = useCallback((index: number, node: HTMLDivElement | null) => {
      pageEls.current[index] = node
    }, [])

    return (
      <div ref={scrollRef} className={styles.scroll} onScroll={onScroll}>
        {sizes.length === 0 || scale === null ? (
          <div className={styles.hint}>{t('filePreviewLoading')}</div>
        ) : (
          <div className={styles.pages}>
            {sizes.map((size, index) => (
              <PdfPage
                key={index}
                doc={doc}
                pageNumber={index + 1}
                scale={scale}
                size={size}
                rootRef={scrollRef}
                register={registerPage}
              />
            ))}
          </div>
        )}
      </div>
    )
  }
)

PdfPreview.displayName = 'PdfPreview'

const PdfPage = ({
  doc,
  pageNumber,
  scale,
  size,
  rootRef,
  register,
}: {
  doc: PDFDocumentProxy
  pageNumber: number
  scale: number
  size: PageSize
  rootRef: RefObject<HTMLDivElement>
  register: (index: number, node: HTMLDivElement | null) => void
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)

  // 只渲染进入视野（含少量预渲染范围）的页面
  useEffect(() => {
    const el = wrapRef.current
    if (!el) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (entry) {
          setVisible(entry.isIntersecting)
        }
      },
      { root: rootRef.current, rootMargin: '300px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    // 离开视野后释放画布内存，回滚时再重新渲染
    if (!visible) {
      canvas.width = 0
      canvas.height = 0
      return
    }

    let cancelled = false
    let task: { cancel: () => void; promise: Promise<void> } | null = null
    void doc
      .getPage(pageNumber)
      .then((pdfPage) => {
        if (cancelled) {
          return
        }
        const viewport = pdfPage.getViewport({ scale })
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        const context = canvas.getContext('2d')
        if (!context) {
          return
        }
        task = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        })
        void task.promise.catch(() => {
          // 取消渲染或文档销毁时忽略
        })
      })
      .catch(() => {
        // 文档销毁后 getPage 会失败
      })

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber, scale, visible])

  return (
    <div
      ref={(node) => {
        wrapRef.current = node
        register(pageNumber - 1, node)
      }}
      className={styles.page}
      style={{ width: size.width * scale, height: size.height * scale }}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}
