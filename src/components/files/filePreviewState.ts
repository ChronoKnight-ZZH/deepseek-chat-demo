import { create } from 'zustand'
import type { FilePreviewTarget } from '../../services/filePreview.js'

/** 页面内的文件文本预览：target 为 null 表示未打开 */
type FilePreviewState = {
  target: FilePreviewTarget | null
}

export const useFilePreview = create<FilePreviewState>(() => ({ target: null }))

export const openFilePreview = (target: FilePreviewTarget) => useFilePreview.setState({ target })

export const closeFilePreview = () => useFilePreview.setState({ target: null })
