import { translate, type TranslationMessage } from '../../i18n/index.js'
import { getAuthToken, handleUnauthorized } from '../auth.js'
import { API_CREDENTIALS } from '../env.js'
import { readMessageEvent } from './parseEvent.js'
import { readServerSentEvents } from './sse.js'
import type { CreateMessageRequest, FileObject, FilePurpose, MessageStreamEvent } from './types.js'

/** BFF 前缀：开发同源 /v1（devServer 代理），生产 https://api.shunkai-dg.cn/v1 */
export const BFF_BASE = __BFF_BASE__.replace(/\/+$/, '')

export type ApiErrorKind =
  /** 非 2xx 响应 */
  | 'http'
  /** 流中返回的错误帧（如等待生成超时），随后连接关闭 */
  | 'stream'
  /** 请求没有到达服务端（断网、跨域被拦截等） */
  | 'network'
  /** 流在 message_stop 之前结束 */
  | 'interrupted'
  /** 响应不符合协议（如非 SSE 响应） */
  | 'protocol'

export class ApiError extends Error {
  readonly localMessage?: TranslationMessage
  /** BFF 稳定错误码，如 CURSOR_EXPIRED / UPSTREAM_TIMEOUT */
  readonly code?: string
  /** 429 时服务端要求的等待秒数 */
  readonly retryAfter?: number

  constructor(
    readonly kind: ApiErrorKind,
    message: string | TranslationMessage,
    readonly status?: number,
    options: { code?: string; retryAfter?: number } = {}
  ) {
    super(typeof message === 'string' ? message : translate(message.key, message.params))
    this.name = 'ApiError'
    this.localMessage = typeof message === 'string' ? undefined : message
    this.code = options.code
    this.retryAfter = options.retryAfter
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readRetryAfter = (response: Response): number | undefined => {
  const header = response.headers.get('Retry-After')
  if (!header) {
    return undefined
  }
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds)
  }
  const date = Date.parse(header)
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000))
  }
  return undefined
}

const readErrorResponse = async (
  response: Response,
  kind: 'http' | 'protocol' = 'http',
  fallback = response.statusText
): Promise<ApiError> => {
  const text = await response.text().catch(() => '')
  let message = text || fallback
  let code: string | undefined
  try {
    const body: unknown = JSON.parse(text)
    if (isRecord(body)) {
      if (isRecord(body.error) && typeof body.error.message === 'string') {
        message = body.error.message
      } else if (typeof body.message === 'string' && body.message) {
        message = body.message
      }
      if (typeof body.code === 'string') {
        code = body.code
      }
    }
  } catch {
    // 非 JSON 响应体直接展示原文
  }
  return new ApiError(kind, message, response.status, {
    code,
    retryAfter: readRetryAfter(response),
  })
}

/** 请求 BFF：自动带 Bearer，401 统一切回登录页 */
export const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }
  const token = getAuthToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  let response: Response
  try {
    response = await fetch(`${BFF_BASE}${path}`, {
      ...init,
      headers,
      // 分域部署（chat.* → api.*）需要 include 才能带上票据 Cookie
      credentials: API_CREDENTIALS,
      cache: 'no-store',
    })
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }
    throw new ApiError('network', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized()
    }
    throw await readErrorResponse(response)
  }
  return response
}

/** 上传附件：multipart 透传到 BFF，由服务端持有上游 Key */
export const uploadFile = async (
  file: File,
  purpose: FilePurpose | null,
  signal?: AbortSignal
): Promise<FileObject> => {
  const form = new FormData()
  if (purpose) {
    form.append('purpose', purpose)
  }
  form.append('file', file)
  const response = await request('/files', { method: 'POST', body: form, signal })
  return (await response.json()) as FileObject
}

/** DELETE /v1/files/{file_id} */
export const deleteFile = async (fileId: string): Promise<void> => {
  await request(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

/** 用户主动停止生成；失败不阻塞本地停止 */
export const stopChat = async (requestId: string): Promise<void> => {
  try {
    await request('/chat/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
    })
  } catch {
    // 停止是尽力而为：服务端还有孤儿超时兜底
  }
}

export type StreamChatOptions = {
  requestId: string
  body: CreateMessageRequest
  signal: AbortSignal
}

type RelayMeta = { requestId?: string; cursor?: number; resumed?: boolean; cached?: boolean }
type RelayEnd = {
  requestId?: string
  status?: string
  code?: string | null
  finishReason?: string | null
}

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

const readJson = <T>(data: string): T | null => {
  try {
    return JSON.parse(data) as T
  } catch {
    return null
  }
}

/**
 * 通过 BFF 请求聊天流。
 *
 * - 服务端会先发 `relay_meta`，再逐帧透传 Anthropic 事件，最后发 `relay_end`
 * - 内容帧带单调递增 `id`；断线后用 `Last-Event-ID` 的等价参数 `cursor` 续推
 * - 首帧之前失败用普通 HTTP 状态码；首帧之后失败用 `relay_end` 的 code 收场
 */
export async function* streamChat({
  requestId,
  body,
  signal,
}: StreamChatOptions): AsyncGenerator<MessageStreamEvent> {
  let lastSeq = 0
  let started = false

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response =
        started && lastSeq > 0
          ? await request(
              `/chat/stream?requestId=${encodeURIComponent(requestId)}&cursor=${lastSeq}`,
              {
                method: 'GET',
                headers: { Accept: 'text/event-stream' },
                signal,
              }
            )
          : await request('/chat/stream', {
              method: 'POST',
              headers: {
                Accept: 'text/event-stream',
                'Content-Type': 'application/json',
                'X-Request-Id': requestId,
              },
              body: JSON.stringify({ ...body, stream: true }),
              signal,
            })

      const contentType = response.headers.get('Content-Type') ?? ''
      if (!response.body || !contentType.includes('text/event-stream')) {
        throw new ApiError('protocol', '', response.status)
      }

      for await (const event of readServerSentEvents(response.body, signal)) {
        started = true

        if (event.event === 'relay_meta') {
          readJson<RelayMeta>(event.data)
          continue
        }

        if (event.event === 'relay_end') {
          const end = readJson<RelayEnd>(event.data)
          if (end?.status === 'error') {
            if (end.code === 'ABORTED') {
              return
            }
            throw new ApiError('stream', end.code || 'UPSTREAM_ERROR', undefined, {
              code: end.code || undefined,
            })
          }
          return
        }

        if (event.event === 'error') {
          throw new ApiError('stream', event.data)
        }

        // 只对内容帧做去重；relay_meta / relay_end 不参与游标
        const seq = Number(event.lastEventId)
        if (Number.isSafeInteger(seq) && seq > 0) {
          if (seq <= lastSeq) {
            continue
          }
          lastSeq = seq
        }

        const payload = readJson<unknown>(event.data)
        if (!isRecord(payload)) {
          continue
        }
        const messageEvent = readMessageEvent(payload)
        if (!messageEvent) {
          continue
        }
        yield messageEvent
        if (messageEvent.type === 'message_stop') {
          return
        }
      }

      if (signal.aborted) {
        return
      }
      // 没有 message_stop 也没有 relay_end：按断流处理，尝试续推
      throw new ApiError('interrupted', '')
    } catch (error) {
      if (signal.aborted) {
        throw error
      }
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 403 || error.status === 410) {
          throw error
        }
        if (error.kind === 'stream') {
          throw error
        }
      }
      if (attempt >= 2) {
        throw error
      }
      const retryable =
        !(error instanceof ApiError) || error.kind === 'network' || error.kind === 'interrupted'
      if (!retryable) {
        throw error
      }
      await delay(300 * (attempt + 1), signal)
    }
  }
}
