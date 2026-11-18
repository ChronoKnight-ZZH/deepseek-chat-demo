import { useTranslate } from '../../i18n/index.js'
import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useTheme } from '../../app/theme.js'
import { renderMermaid } from '../../services/markdown/mermaid.js'
import { openMermaidLog } from '../../services/markdown/mermaidLog.js'

/** 指针位移超过该值才算拖动，避免点击时轻微抖动被当成平移 */
const DRAG_THRESHOLD = 4

/** 一次拖动的起点：指针位置与容器当时的滚动偏移 */
type DragState = {
  pointerId: number
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
  moved: boolean
}

/** 流式绘制最新内容、保留上次有效图；回答结束后才显示渲染错误。 */
export const MermaidDiagram = memo(function MermaidDiagram({
  code,
  loading,
  scale = 1,
}: {
  code: string
  loading: boolean
  /** 相对「适应容器高度」的缩放倍率，1 为铺满 360px 高度 */
  scale?: number
}) {
  const t = useTranslate()
  const dark = useTheme() === 'dark'
  const [result, setResult] = useState({ svg: '', failedCode: null as string | null })
  const latestCodeRef = useRef(code)
  latestCodeRef.current = code
  const dragRef = useRef<DragState | null>(null)
  const [dragging, setDragging] = useState(false)
  // 流式阶段从 ref 取最新文本，避免每个片段都取消绘制；结束后立即绘制完整内容。
  const finalCode = loading ? null : code

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let previousCode: string | undefined
    let displayedCode: string | undefined

    const draw = async (input: string) => {
      if (input === displayedCode || cancelled) {
        return
      }
      // 流式阶段会反复重试不完整语法，静默绘制；最终结果才写日志
      const svg = await renderMermaid(input, dark, () => cancelled, { silent: loading })
      if (svg && !cancelled) {
        displayedCode = input
        setResult({ svg, failedCode: null })
      }
    }

    const renderLatest = async () => {
      const input = latestCodeRef.current
      if (input !== previousCode) {
        previousCode = input
        try {
          await draw(input)
        } catch {
          if (!cancelled) {
            if (loading) {
              // 流式片段的末行可能包含未完成的节点，仅绘制前面的完整行。
              const text = input.trimEnd()
              const lineEnd = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'))
              const prefix = text.slice(0, Math.max(0, lineEnd))
              // 已显示的内容覆盖当前前缀时保持图形。
              if (prefix && !displayedCode?.startsWith(prefix)) {
                try {
                  await draw(prefix)
                } catch {
                  // 前缀也可能尚未构成完整语法，保留已有图。
                }
              }
            } else {
              setResult({ svg: '', failedCode: input })
            }
          }
        }
      }
      // 当前帧结束后绘制最新片段，连续输入合并为一次绘制。
      if (!cancelled && loading) {
        timer = setTimeout(renderLatest, 100)
      }
    }

    void renderLatest()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [dark, loading, finalCode])

  // 在容器内按住拖动：把指针位移反向写入滚动偏移，等同于按住滚动条拖拽
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    // 触摸手势交给浏览器原生惯性滚动，这里只接管鼠标与手写笔
    if (event.button !== 0 || event.pointerType === 'touch') {
      return
    }
    const box = event.currentTarget
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: box.scrollLeft,
      scrollTop: box.scrollTop,
      moved: false,
    }
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved) {
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) {
        return
      }
      // 越过阈值才接管指针：此前的轻微抖动仍是一次普通点击
      drag.moved = true
      event.currentTarget.setPointerCapture(event.pointerId)
      setDragging(true)
    }
    event.preventDefault()
    const box = event.currentTarget
    box.scrollLeft = drag.scrollLeft - dx
    box.scrollTop = drag.scrollTop - dy
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    dragRef.current = null
    const box = event.currentTarget
    if (box.hasPointerCapture(event.pointerId)) {
      box.releasePointerCapture(event.pointerId)
    }
    if (drag.moved) {
      setDragging(false)
    }
  }

  if (!code.trim() || !result.svg) {
    const failed = !loading && result.failedCode === code
    return (
      <div className="md-mermaid-status" role="status">
        {!loading && !code.trim() ? (
          t('mermaidEmpty')
        ) : failed ? (
          // 渲染失败时直接给出日志入口，方便查看具体语法错误
          <button type="button" className="md-mermaid-status-action" onClick={openMermaidLog}>
            {t('mermaidRenderFail')} · {t('mermaidOpenLog')}
          </button>
        ) : (
          t('mermaidLoading')
        )}
      </div>
    )
  }

  return (
    <div
      className={dragging ? 'md-mermaid-diagram md-mermaid-diagram-dragging' : 'md-mermaid-diagram'}
      style={{ '--md-mermaid-zoom': String(scale) } as CSSProperties}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  )
})