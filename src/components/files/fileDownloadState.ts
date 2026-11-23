import { create } from 'zustand'
import { saveBlob } from '../../utils/download.js'

/** 不能预览、准备下载的文件；blob 优先，没有本地字节时退回下载地址 */
export type FileDownloadRequest = {
  name: string
  blob: Blob | null
  url: string | null
}

type FileDownloadState = {
  request: FileDownloadRequest | null
}

export const useFileDownload = create<FileDownloadState>(() => ({ request: null }))

/** 打开下载确认弹窗；null 表示没有待确认的下载 */
export const requestFileDownload = (request: FileDownloadRequest) =>
  useFileDownload.setState({ request })

export const closeFileDownload = () => useFileDownload.setState({ request: null })

/** 确认后真正触发下载：本地字节直接保存，否则让浏览器打开 r 票据地址 */
export const downloadRequestedFile = (request: FileDownloadRequest) => {
  if (request.blob) {
    saveBlob(request.blob, request.name)
    return
  }
  if (!request.url) {
    return
  }
  const link = document.createElement('a')
  link.href = request.url
  link.download = request.name
  link.rel = 'noreferrer'
  link.click()
}
