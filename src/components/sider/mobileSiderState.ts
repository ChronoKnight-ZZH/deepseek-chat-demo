import { create } from 'zustand'

/** 移动端侧边栏开合：顶栏菜单按钮打开，点遮罩、切换会话或开启新对话后关闭；宽于 610px 时以推开式展示 */
export const useMobileSider = create(() => ({ open: false }))

export const openMobileSider = () => useMobileSider.setState({ open: true })

export const closeMobileSider = () => useMobileSider.setState({ open: false })
