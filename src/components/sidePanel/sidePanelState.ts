import { create } from 'zustand'
import { isMobileLayout } from '../../app/viewport.js'
import type { FilePreviewTarget } from '../../services/filePreview.js'
import { setSiderCollapsed, useSettings } from '../../services/settings.js'
import { closeMobileSider } from '../sider/mobileSiderState.js'

/** 右侧边栏同一时间只展示一种内容：HTML 预览或文件预览 */
export type SidePanelContent =
  | { kind: 'html'; code: string }
  | { kind: 'file'; target: FilePreviewTarget }

type SidePanelState = {
  content: SidePanelContent | null
}

export const useSidePanel = create<SidePanelState>(() => ({ content: null }))

/** 打开预览时是否自动收起了左侧边栏；关闭预览时据此恢复 */
let siderAutoCollapsed = false

/** 打开右侧面板：与左侧边栏互斥，移动端先收起抽屉 */
export const openSidePanel = (content: SidePanelContent) => {
  if (isMobileLayout()) {
    siderAutoCollapsed = false
    closeMobileSider()
  } else if (useSidePanel.getState().content === null) {
    // 面板已打开时（切换预览内容）保持最初的恢复记录
    const collapsed = useSettings.getState().siderCollapsed
    siderAutoCollapsed = !collapsed
    if (!collapsed) {
      setSiderCollapsed(true)
    }
  }
  useSidePanel.setState({ content })
}

/** 关闭右侧面板：若左侧边栏是被打开预览自动收起的，则恢复展开 */
export const closeSidePanel = () => {
  const wasOpen = useSidePanel.getState().content !== null
  useSidePanel.setState({ content: null })
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

export const openHtmlPreview = (code: string) => openSidePanel({ kind: 'html', code })

export const openFilePreview = (target: FilePreviewTarget) =>
  openSidePanel({ kind: 'file', target })

/** 仅关闭 HTML 预览，避免误关正在展示的文件 */
export const closeHtmlPreview = () => {
  if (useSidePanel.getState().content?.kind === 'html') {
    closeSidePanel()
  }
}

/** 仅关闭文件预览 */
export const closeFilePreview = () => {
  if (useSidePanel.getState().content?.kind === 'file') {
    closeSidePanel()
  }
}
