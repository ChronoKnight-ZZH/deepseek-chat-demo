import { create } from 'zustand'

/** 页面内的图片预览：src 为原图地址，null 表示未打开 */
type ImageViewerState = {
  src: string | null
  alt: string
}

export const useImageViewer = create<ImageViewerState>(() => ({ src: null, alt: '' }))

export const openImageViewer = (src: string, alt: string) => useImageViewer.setState({ src, alt })

export const closeImageViewer = () => useImageViewer.setState({ src: null, alt: '' })
