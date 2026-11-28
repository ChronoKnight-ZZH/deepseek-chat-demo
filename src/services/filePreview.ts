import { fetchPreviewOriginal } from './api/fileStorage.js'
import { getExtension } from './attachments.js'
import { loadFile } from './chat/db.js'

/** 预览渲染上限：超出部分截断，避免大文件一次性铺满 DOM */
export const PREVIEW_MAX_CHARS = 200_000

/** 打开预览需要的定位信息：本地原件优先，缺失时用 storageId 向 BFF 换 p 票据 */
export type FilePreviewTarget = {
  /** IndexedDB 原件 id */
  id: string
  name: string
  size: number
  /** 原始 MIME，用于区分文本与 PDF */
  mimeType: string
  storageId: string | null
  sessionId: string
  /** 下载地址（本地 blob 地址或 r 票据）：读不到原件时兜底 */
  downloadUrl: string | null
}

/** 读到的原件：kind 为 binary 时不是文本/PDF，只能下载 */
export type PreviewContent = {
  blob: Blob
  kind: 'text' | 'pdf' | 'binary'
  text: string
  truncated: boolean
}

/** 明确的非文本 MIME：这些类型有内容也不是可读文本 */
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/xhtml+xml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/yaml',
  'application/x-yaml',
  'application/x-sh',
  'application/sql',
  'application/graphql',
  'application/x-httpd-php',
  'application/toml',
])

/** 没有可信 MIME 时按扩展名排除二进制：其余扩展名（含各类代码）都尝试按文本读 */
const BINARY_EXTS = new Set([
  'PDF',
  'DOC',
  'DOCX',
  'PPT',
  'PPTX',
  'XLS',
  'XLSX',
  'ZIP',
  'RAR',
  '7Z',
  'GZ',
  'TAR',
  'EXE',
  'DLL',
  'BIN',
  'MP3',
  'MP4',
  'M4A',
  'WAV',
  'MOV',
  'AVI',
  'MKV',
  'WOFF',
  'WOFF2',
  'TTF',
  'OTF',
])

/** PDF 由 pdf.js 渲染，不再当作文本解码 */
export const isPdfPreviewable = (name: string, mimeType: string): boolean =>
  mimeType.toLowerCase() === 'application/pdf' || getExtension(name) === 'PDF'

/** Markdown 文档值得按会话里的排版渲染，而不是等宽源码 */
const MARKDOWN_EXTS = new Set(['MD', 'MARKDOWN'])
const MARKDOWN_MIME_TYPES = new Set(['text/markdown', 'text/x-markdown'])

export const isMarkdownFile = (name: string, mimeType: string): boolean =>
  MARKDOWN_MIME_TYPES.has(mimeType.toLowerCase()) || MARKDOWN_EXTS.has(getExtension(name))

/**
 * 是否值得按文本预览：MIME 可信时直接判定，缺失或为 octet-stream 时按扩展名兜底。
 * 判错的二进制文件仍会在读取后被嗅探出来，转为「只能下载」。
 */
export const isTextPreviewable = (name: string, mimeType: string): boolean => {
  const mime = mimeType.toLowerCase()
  if (mime.startsWith('text/')) {
    return true
  }
  if (TEXT_MIME_TYPES.has(mime)) {
    return true
  }
  if (mime && mime !== 'application/octet-stream') {
    return false
  }
  return !BINARY_EXTS.has(getExtension(name))
}

/** 能否在右侧边栏预览：文本与 PDF；其余类型先确认再下载 */
export const isPreviewableFile = (name: string, mimeType: string): boolean =>
  isPdfPreviewable(name, mimeType) || isTextPreviewable(name, mimeType)

/** 替换字符占比：用于判断编码是否猜错 */
const replacementRatio = (text: string) => {
  if (text.length === 0) {
    return 0
  }
  let count = 0
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 0xfffd) {
      count++
    }
  }
  return count / text.length
}

/** 先按 UTF-8 解码；替换字符过多时改用 GBK（Windows 中文文本常见）再试一次 */
const decodeText = (buffer: ArrayBuffer) => {
  const utf8 = new TextDecoder().decode(buffer)
  const ratio = replacementRatio(utf8.slice(0, 4096))
  if (ratio > 0.02) {
    try {
      const gbk = new TextDecoder('gbk').decode(buffer)
      if (replacementRatio(gbk.slice(0, 4096)) < ratio) {
        return gbk
      }
    } catch {
      // 浏览器不支持 gbk 标签时沿用 UTF-8 结果
    }
  }
  return utf8
}

/** 文本嗅探：含 NUL 或控制字符 / 替换字符过多，视为二进制 */
const looksBinary = (text: string) => {
  const sample = text.slice(0, 4096)
  if (sample.length === 0) {
    return false
  }
  if (sample.includes('\u0000')) {
    return true
  }
  let count = 0
  for (let index = 0; index < sample.length; index++) {
    const code = sample.charCodeAt(index)
    if (code === 0xfffd || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      count++
    }
  }
  return count / sample.length > 0.15
}

/** 票据可能已过期：失败后强制重签一次，与图片加载失败的处理一致 */
const fetchPreviewWithRetry = async (fileId: string, sessionId: string) => {
  try {
    return await fetchPreviewOriginal(fileId, sessionId)
  } catch {
    return await fetchPreviewOriginal(fileId, sessionId, { force: true })
  }
}

/**
 * 读取原件内容：本地 IndexedDB 优先，本地缺失时用 p 票据向服务端取内联字节。
 * PDF 原样返回字节交给 pdf.js；文本按编码嗅探，二进制转为「只能下载」。
 * 原件不存在或读取失败时抛错，由预览面板显示失败并提供下载兜底。
 */
export const loadPreviewContent = async (target: FilePreviewTarget): Promise<PreviewContent> => {
  const storageId = target.storageId
  const blob =
    (await loadFile(target.id)) ??
    (storageId ? await fetchPreviewWithRetry(storageId, target.sessionId) : undefined)
  if (!blob) {
    throw new Error('original missing')
  }
  if (isPdfPreviewable(target.name, target.mimeType)) {
    return { blob, kind: 'pdf', text: '', truncated: false }
  }
  const decoded = decodeText(await blob.arrayBuffer())
  if (looksBinary(decoded)) {
    return { blob, kind: 'binary', text: '', truncated: false }
  }
  return {
    blob,
    kind: 'text',
    text: decoded.slice(0, PREVIEW_MAX_CHARS),
    truncated: decoded.length > PREVIEW_MAX_CHARS,
  }
}
