import { API_CREDENTIALS } from '../env.js'
import { BFF_BASE, request } from './client.js'

/** 服务端原件元数据 */
export type StoredFile = {
  id: string
  fileId: string
  sha256: string
  size: number
  mime: string
  name: string
  isImage: boolean
}

export type FileUrlSet = {
  /** t：缩略图位置（当前回退为原图）；p：原图内联；r：下载 */
  urls: { t: string; p: string; r: string }
  expiresAt: number
  mime: string
  name: string
  isImage: boolean
}

const encodeHeader = (value: string) => encodeURIComponent(value)

/**
 * 上传原件到 BFF。请求体直接是文件字节，避免 multipart 解析与内存复制；
 * 文件名/MIME 放在请求头，服务端最终以文件头嗅探结果为准。
 */
export const uploadOriginal = async (
  blob: Blob,
  name: string,
  mime: string,
  signal?: AbortSignal
): Promise<StoredFile> => {
  const response = await request('/files/originals', {
    method: 'POST',
    headers: {
      'Content-Type': mime || 'application/octet-stream',
      'X-File-Name': encodeHeader(name),
      'X-File-Mime': encodeHeader(mime),
    },
    body: blob,
    signal,
  })
  return (await response.json()) as StoredFile
}

/** 按会话重新签发短期票据；票据不入库，只在内存里缓存到过期前 */
export const getOriginalUrls = async (fileId: string, sessionId: string): Promise<FileUrlSet> => {
  const query = new URLSearchParams({ sessionId })
  const response = await request(
    `/files/originals/${encodeURIComponent(fileId)}/url?${query.toString()}`
  )
  return (await response.json()) as FileUrlSet
}

/** 由票据拼出浏览器可直接使用的同源地址（<img> 无法携带 Bearer 头） */
export const contentUrl = (state: string, fileId: string, type: 't' | 'p' | 'r'): string => {
  const query = new URLSearchParams({ file_id: fileId, state, ty: type })
  return `${BFF_BASE}/files/content?${query.toString()}`
}

export const deleteOriginal = async (fileId: string): Promise<void> => {
  await request(`/files/originals/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

/** 提前 1 分钟视为过期，避免图片加载途中票据失效 */
const EXPIRY_MARGIN_MS = 60 * 1000

const urlCache = new Map<string, FileUrlSet>()
const inflight = new Map<string, Promise<FileUrlSet>>()

const cacheKey = (fileId: string, sessionId: string) => `${sessionId}:${fileId}`

/**
 * 按会话取原件票据，同一 (会话, 文件) 在有效期内复用，避免每张图片都打一次 BFF。
 * 不同设备打开同一会话时，本地没有 IndexedDB 原件，只能靠这里换来的短期地址显示。
 */
export const getSignedUrls = (
  fileId: string,
  sessionId: string,
  { force = false }: { force?: boolean } = {}
): Promise<FileUrlSet> => {
  const key = cacheKey(fileId, sessionId)
  const cached = urlCache.get(key)
  if (!force && cached && cached.expiresAt - Date.now() > EXPIRY_MARGIN_MS) {
    return Promise.resolve(cached)
  }
  if (!force) {
    const pending = inflight.get(key)
    if (pending) {
      return pending
    }
  }
  const promise = getOriginalUrls(fileId, sessionId)
    .then((set) => {
      urlCache.set(key, set)
      return set
    })
    .finally(() => {
      if (inflight.get(key) === promise) {
        inflight.delete(key)
      }
    })
  inflight.set(key, promise)
  return promise
}

/** 会话被删除或票据失效时清掉对应缓存 */
export const forgetSignedUrls = (fileId: string, sessionId: string) => {
  urlCache.delete(cacheKey(fileId, sessionId))
}

/**
 * 本地没有原件、但服务端已归档时，取回原始字节。
 * 用于导入的历史图片：首次发送前需要把原件送上游 Files API。
 */
export const downloadOriginal = async (fileId: string, sessionId: string): Promise<Blob> => {
  const set = await getSignedUrls(fileId, sessionId)
  const response = await fetch(contentUrl(set.urls.r, fileId, 'r'), {
    credentials: API_CREDENTIALS,
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`download original failed: ${response.status}`)
  }
  return response.blob()
}
