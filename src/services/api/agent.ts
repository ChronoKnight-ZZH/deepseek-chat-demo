import { handleUnauthorized } from '../auth.js'
import { API_CREDENTIALS } from '../env.js'
import { ApiError, BFF_BASE } from './client.js'

/**
 * Agent Harness 接口层（对应 auth-demo /api/agent）。
 *
 * 与聊天 SSE 链路完全独立：提交任务后按 status_url 轮询取结果，
 * 前缀从 BFF_BASE 推导——`https://api.x.cn/v1` → `https://api.x.cn/api/agent`，
 * 同源反代部署时则是 `/api/agent`（chat Nginx 需一并转发 `/api` 与 `/health`）。
 */

/** BFF 根地址（去掉 /v1 后缀），Agent 与 /health 都挂在这里 */
export const API_ROOT = BFF_BASE.replace(/\/v1$/, '').replace(/\/$/, '')

/** Agent API 前缀 */
export const AGENT_BASE = `${API_ROOT}/api/agent`

export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_model'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'

/** 到达其中任一状态后不再轮询 */
export const TERMINAL_STATUSES: readonly AgentTaskStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'timed_out',
]

export const isTerminalStatus = (status: AgentTaskStatus | string): boolean =>
  (TERMINAL_STATUSES as readonly string[]).includes(status)

export type AgentFileEntry = {
  id: string
  fileId: string | null
  fileRole: 'input' | 'output' | 'intermediate'
  fileName: string
  fileType: string
  fileSize: number
  downloadUrl: string | null
  createdAt: number
}

export type AgentTask = {
  taskId: string
  status: AgentTaskStatus
  currentStep: string | null
  conversationId: string | null
  createdAt: number
  updatedAt: number
  deadlineAt: number | null
  startedAt: number | null
  finishedAt: number | null
  result: { text: string } | null
  error: { code: string; message: string } | null
  progress: { completedSteps: number; totalSteps: number | null }
  files: AgentFileEntry[]
  statusUrl: string
}

/** /health 中与 Agent 灰度相关的字段 */
export type AgentAvailability = {
  enabled: boolean
  queueMode: string
  executionEnabled: boolean
  /** 谁在消费任务：inline / bullmq / none（none = 提交了也只会在队列里等到超时） */
  consumer: string
}

type RawFile = Record<string, unknown>
type RawTask = Record<string, unknown>

const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const numOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const toFileEntry = (raw: unknown): AgentFileEntry => {
  const f = (raw ?? {}) as RawFile
  return {
    id: str(f.id),
    fileId: strOrNull(f.file_id),
    fileRole: (f.file_role === 'output' || f.file_role === 'intermediate'
      ? f.file_role
      : 'input') as AgentFileEntry['fileRole'],
    fileName: str(f.file_name),
    fileType: str(f.file_type),
    fileSize: num(f.file_size),
    downloadUrl: strOrNull(f.download_url),
    createdAt: num(f.created_at),
  }
}

/** 后端 snake_case 协议 → 前端 camelCase；缺字段回落默认值，旧缓存缺 agent 块时不炸 */
const toTask = (raw: unknown): AgentTask => {
  const r = (raw ?? {}) as RawTask
  return {
    taskId: str(r.task_id),
    status: str(r.status) as AgentTaskStatus,
    currentStep: strOrNull(r.current_step),
    conversationId: strOrNull(r.conversation_id),
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
    deadlineAt: numOrNull(r.deadline_at),
    startedAt: numOrNull(r.started_at),
    finishedAt: numOrNull(r.finished_at),
    result:
      r.result && typeof r.result === 'object' ? { text: str((r.result as RawFile).text) } : null,
    error:
      r.error && typeof r.error === 'object'
        ? { code: str((r.error as RawFile).code), message: str((r.error as RawFile).message) }
        : null,
    progress: {
      completedSteps:
        r.progress && typeof r.progress === 'object'
          ? num((r.progress as RawFile).completed_steps)
          : 0,
      totalSteps:
        r.progress && typeof r.progress === 'object'
          ? numOrNull((r.progress as RawFile).total_steps)
          : null,
    },
    files: Array.isArray(r.files) ? r.files.map(toFileEntry) : [],
    statusUrl: str(r.status_url),
  }
}

/** Agent 稳定错误码；UI 文案按 code 映射，未知 code 兜底展示 status */
export type AgentErrorCode =
  | 'AGENT_DISABLED'
  | 'AGENT_NOT_ALLOWED'
  | 'AGENT_TASK_NOT_FOUND'
  | 'FILE_ACCESS_DENIED'
  | 'INVALID_INPUT'
  | 'PAYLOAD_TOO_LARGE'

const readError = async (response: Response): Promise<ApiError> => {
  const text = await response.text().catch(() => '')
  let message = text || response.statusText
  let code: string | undefined
  try {
    const body: unknown = JSON.parse(text)
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>
      if (typeof record.message === 'string' && record.message) {
        message = record.message
      }
      if (typeof record.code === 'string') {
        code = record.code
      }
    }
  } catch {
    // 非 JSON 响应体保留原文
  }
  const header = response.headers.get('Retry-After')
  const retryAfter = header ? Math.ceil(Number(header)) : undefined
  return new ApiError('http', message, response.status, {
    code,
    retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
  })
}

/** Agent 请求不复用 client.request：它在 BFF_BASE(/v1) 下拼路径，这里前缀不同 */
const requestAgent = async <T>(
  path: string,
  init: RequestInit,
  parse: (payload: unknown) => T
): Promise<T> => {
  let response: Response
  try {
    response = await fetch(`${AGENT_BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
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
    throw await readError(response)
  }
  return parse(await response.json().catch(() => ({})))
}

export type CreateAgentTaskInput = {
  message: string
  fileIds: string[]
  conversationId?: string | null
  /** 幂等键：同一次提交的重试（含 401 补登录后的重发）共用一个键，服务端返回同一任务 */
  idempotencyKey: string
}

/** POST /api/agent/tasks → 202 queued */
export const createAgentTask = (input: CreateAgentTaskInput): Promise<AgentTask> =>
  requestAgent(
    '/tasks',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        message: input.message,
        file_ids: input.fileIds,
        ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
      }),
    },
    toTask
  )

/** GET /api/agent/tasks/:taskId —— 轮询入口（后端 status_url 即此路径） */
export const fetchAgentTask = (taskId: string, signal?: AbortSignal): Promise<AgentTask> =>
  requestAgent(`/tasks/${encodeURIComponent(taskId)}`, { method: 'GET', signal }, toTask)

/** POST /api/agent/tasks/:taskId/cancel —— 返回 cancelled 与最新任务快照 */
export const cancelAgentTask = async (
  taskId: string
): Promise<{ cancelled: boolean; task: AgentTask }> => {
  const body = await requestAgent<unknown>(
    `/tasks/${encodeURIComponent(taskId)}/cancel`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    (payload) => payload
  )
  const record = (body ?? {}) as Record<string, unknown>
  return { cancelled: record.cancelled === true, task: toTask(record.task) }
}

/** GET /health —— 无需登录；据此决定 Agent 模式入口是否显示 */
export const fetchAgentAvailability = async (signal?: AbortSignal): Promise<AgentAvailability> => {
  let response: Response
  try {
    response = await fetch(`${API_ROOT}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: API_CREDENTIALS,
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    throw new ApiError('network', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    throw await readError(response)
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  const agent = (body.agent ?? {}) as Record<string, unknown>
  // 后端 camelCase 与 snake_case 同时输出，两种都认，避免命名不一致导致恒为 false
  const read = (camel: string, snake: string) => agent[camel] ?? agent[snake]
  const queueMode = str(read('queueMode', 'queue_mode'))
  const hasConsumer = read('hasConsumer', 'has_consumer') === true
  return {
    enabled: agent.enabled === true,
    queueMode,
    executionEnabled: read('executionEnabled', 'execution_enabled') === true,
    // 没有消费方时 consumer=none：提交后只会在队列里等到超时，UI 可据此提前提示
    consumer: hasConsumer
      ? queueMode || 'unknown'
      : str(read('consumer', 'consumer')) || 'none',
  }
}
