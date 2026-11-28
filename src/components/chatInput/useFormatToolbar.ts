import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { ComposerHandle } from './MarkdownComposer.js'
import type { Selection } from './markdownFormat.js'

/** 选区稳定多久后显示格式工具栏，避免拖选过程中反复闪现 */
const TOOLBAR_SHOW_DELAY = 160

/**
 * 跟踪编辑器选区，选区非空时计算其在视口中的包围盒，供 FormatToolbar 浮动定位。
 * 拖选时延迟出现，已经显示后立即跟随选区变化。
 */
export const useFormatToolbar = (composerRef: RefObject<ComposerHandle>) => {
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 })
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null)
  const visibleRef = useRef(false)

  useLayoutEffect(() => {
    if (selection.end <= selection.start) {
      visibleRef.current = false
      setSelectionRect(null)
      return
    }
    const update = () => {
      const rect = composerRef.current?.getSelectionRect() ?? null
      visibleRef.current = rect !== null
      setSelectionRect(rect)
    }
    // 拖选时选区持续变化，停顿片刻再出现；已经显示时立即跟随，不做延迟
    let timer: number | undefined
    if (visibleRef.current) {
      update()
    } else {
      timer = window.setTimeout(update, TOOLBAR_SHOW_DELAY)
    }
    window.addEventListener('resize', update)
    // 捕获阶段监听，编辑器内部滚动也能同步位置
    window.addEventListener('scroll', update, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [selection, composerRef])

  return { selection, selectionRect, onSelectionChange: setSelection }
}
