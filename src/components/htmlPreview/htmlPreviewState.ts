import { create } from 'zustand'
import { isMobileLayout } from '../../app/viewport.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { closeMobileSider } from '../sider/mobileSiderState.js'

/** 右侧「HTML 预览」面板，同一时间只预览一个代码块 */
type HtmlPreviewState = {
  code: string | null
}

export const useHtmlPreview = create<HtmlPreviewState>(() => ({ code: null }))

/** 预览与左侧边栏互斥：打开预览时收起左侧边栏 */
export const openHtmlPreview = (code: string) => {
  if (isMobileLayout()) {
    closeMobileSider()
  } else {
    setSiderCollapsed(true)
  }
  useHtmlPreview.setState({ code })
}

export const closeHtmlPreview = () => useHtmlPreview.setState({ code: null })
