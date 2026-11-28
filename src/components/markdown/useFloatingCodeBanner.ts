import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useIsMobile } from '../../app/viewport.js'

/** 已思考标题是否正在置顶；置顶时内部代码框让位，避免替换标题。 */
const ThinkingFloatingContext = createContext(false)

export const ThinkingFloatingProvider = ThinkingFloatingContext.Provider

/** 钉在滚动视口顶部时的位置与尺寸 */
type FloatingBox = {
  top: number
  left: number
  width: number
  height: number
}

/** 向上查找真正负责滚动的祖先；没有则按 window 滚动处理 */
const findScrollRoot = (element: HTMLElement) => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node
    }
  }
  return null
}

const sameBox = (current: FloatingBox, next: FloatingBox) =>
  current.top === next.top &&
  current.left === next.left &&
  current.width === next.width &&
  current.height === next.height

/**
 * 标题栏的「流动」效果：
 * 顶部锚点滚出视口后把标题栏 fixed 钉在顶部，底部锚点也滚出后淡出；
 * 回滚时按相反顺序恢复。
 * enabled 为 false 时停用；位于已思考容器内时让位给更高优先级的已思考标题。
 */
export const useFloatingCodeBanner = (enabled = true) => {
  const blockRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const topAnchorRef = useRef<HTMLSpanElement>(null)
  const bottomAnchorRef = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState<FloatingBox | null>(null)
  const [hidden, setHidden] = useState(false)
  const isMobile = useIsMobile()
  const parentFloating = useContext(ThinkingFloatingContext)
  const active = enabled && !parentFloating

  // 移动端与桌面端的滚动容器不同，切换布局后需要重新绑定观察器
  useEffect(() => {
    if (!active) {
      setBox(null)
      setHidden(false)
      return
    }
    const block = blockRef.current
    const banner = bannerRef.current
    const topAnchor = topAnchorRef.current
    const bottomAnchor = bottomAnchorRef.current
    if (!block || !banner || !topAnchor || !bottomAnchor) {
      return
    }

    const root = findScrollRoot(block)
    const evaluate = () => {
      const rootTop = root ? root.getBoundingClientRect().top : 0
      const floating = topAnchor.getBoundingClientRect().bottom <= rootTop
      const bottomPassed = bottomAnchor.getBoundingClientRect().top <= rootTop

      if (!floating) {
        setBox(null)
        setHidden(false)
        return
      }

      const rect = banner.getBoundingClientRect()
      const next = {
        top: Math.round(rootTop),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
      setBox((current) => (current && sameBox(current, next) ? current : next))
      setHidden(bottomPassed)
    }

    // 锚点进出滚动视口时重新判断；具体在顶部还是底部由 rect 决定
    const observer = new IntersectionObserver(evaluate, { root, threshold: 0 })
    observer.observe(topAnchor)
    observer.observe(bottomAnchor)

    // 滚动时同步几何信息，避免快速拖动滚动条时锚点直接跨过视口、跳过 observer 回调
    let frame = 0
    const onScroll = () => {
      if (frame !== 0) {
        return
      }
      frame = requestAnimationFrame(() => {
        frame = 0
        evaluate()
      })
    }
    const scrollTarget: HTMLElement | Window = root ?? window
    scrollTarget.addEventListener('scroll', onScroll, { passive: true })

    // 宽度、视口或滚动容器位置变化时同步 fixed 盒子的几何信息
    const resizeObserver = new ResizeObserver(evaluate)
    resizeObserver.observe(banner)
    if (root) {
      resizeObserver.observe(root)
    }
    window.addEventListener('resize', evaluate)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      scrollTarget.removeEventListener('scroll', onScroll)
      resizeObserver.disconnect()
      window.removeEventListener('resize', evaluate)
    }
  }, [active, isMobile])

  const floating = active && box !== null
  const floatingStyle: CSSProperties | undefined =
    floating && box ? { top: box.top, left: box.left, width: box.width } : undefined

  return {
    blockRef,
    bannerRef,
    topAnchorRef,
    bottomAnchorRef,
    floating,
    hidden,
    placeholderHeight: box?.height ?? 0,
    floatingStyle,
  }
}
