import { useEffect, useState } from 'react'

/** 与 CSS 中侧边栏、预览面板的开合动画保持一致 */
const EXIT_DURATION = 500

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 关闭动效期间保持元素挂载：open 变为 false 后立即标记为 exiting，
 * 等动画播完（用户偏好减少动态效果时立即）再卸载。
 */
export const usePresence = (open: boolean, duration = EXIT_DURATION) => {
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) {
      return
    }
    const timer = window.setTimeout(
      () => setMounted(false),
      prefersReducedMotion() ? 0 : duration
    )
    return () => window.clearTimeout(timer)
  }, [open, mounted, duration])

  return { mounted: mounted || open, exiting: mounted && !open }
}
