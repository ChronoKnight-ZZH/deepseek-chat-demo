import { create } from 'zustand'
import { isMobileLayout } from '../../app/viewport.js'
import { setSiderCollapsed, useSettings } from '../../services/settings.js'
import { closeMobileSider } from '../sider/mobileSiderState.js'

/** 右侧「HTML 预览」面板，同一时间只预览一个代码块 */
type HtmlPreviewState = {
  code: string | null
}

export const useHtmlPreview = create<HtmlPreviewState>(() => ({ code: null }))

/** 打开预览时是否自动收起了左侧边栏；关闭预览时据此恢复 */
let siderAutoCollapsed = false

/** 预览与左侧边栏互斥：打开预览时收起左侧边栏 */
export const openHtmlPreview = (code: string) => {
  if (isMobileLayout()) {
    siderAutoCollapsed = false
    closeMobileSider()
  } else {
    // 预览已打开时（切换到另一个代码块）保持最初的恢复记录
    if (useHtmlPreview.getState().code === null) {
      const collapsed = useSettings.getState().siderCollapsed
      siderAutoCollapsed = !collapsed
      if (!collapsed) {
        setSiderCollapsed(true)
      }
    }
  }
  useHtmlPreview.setState({ code })
}

/** 关闭预览：若左侧边栏是被打开预览自动收起的，则恢复展开 */
export const closeHtmlPreview = () => {
  const wasOpen = useHtmlPreview.getState().code !== null
  useHtmlPreview.setState({ code: null })
  if (!wasOpen) {
    return
  }
  const restore = siderAutoCollapsed
  siderAutoCollapsed = false
  // 用户已手动重新展开时无需恢复（此时 siderCollapsed 已是 false）
  if (restore && useSettings.getState().siderCollapsed) {
    setSiderCollapsed(false)
  }
}
