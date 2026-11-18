import { formatDate } from './format.js'

/** 6 位十六进制随机哈希，避免同一秒内下载的文件互相覆盖 */
const randomHash = (): string => {
  if (typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(3)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return Math.random().toString(16).slice(2, 8).padEnd(6, '0')
}

/** 下载文件名：固定前缀-下载日期-6位哈希.扩展名，如 code-2026-11-18-3f9a02.py */
export const buildFileName = (prefix: string, ext: string): string => {
  const date = formatDate(new Date()) ?? 'unknown-date'
  return `${prefix}-${date}-${randomHash()}.${ext}`
}

/** 触发浏览器把 Blob 保存为文件，并延迟释放对象地址 */
export const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}