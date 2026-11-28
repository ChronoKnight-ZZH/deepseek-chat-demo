import { ApiError } from '../api/client.js'
import { fetchAgentTask, isTerminalStatus, type AgentTask } from '../api/agent.js'

/**
 * Agent 任务轮询管理。
 *
 * 每个任务一个轮询器，按 taskId 去重：提交、刷新恢复、多端打开同一会话
 * 都只会收敛为一个在跑的轮询器。节奏：
 *   - 正常：固定间隔逐步放缓（BASE → 上限 MAX 指数退避，节省请求）
 *   - 失败：继续退避；连续失败上限后回调 onGiveUp，把错误交给 UI
 *   - 服务端 429 带 Retry-After 时按它等待
 *   - 终态（completed/failed/cancelled/timed_out）或停止请求即终止
 * 401 不做重试：登录态由 handleUnauthorized 统一处理，轮询静默停止。
 */

const BASE_INTERVAL_MS = 2_000
const MAX_INTERVAL_MS = 15_000
const MAX_CONSECUTIVE_ERRORS = 6

export type AgentPollingHandlers = {
  /** 每次拉到新快照（含状态未变的常规心跳） */
  onUpdate: (task: AgentTask) => void
  /** 任务不存在/无权访问：绑定已失效，UI 侧无需再处理，仅日志用途 */
  onGone?: (taskId: string) => void
  /** 连续网络失败放弃后回调（任务仍在服务端跑，可再次 resume） */
  onGiveUp?: (taskId: string, error: unknown) => void
}

type Poller = {
  handlers: AgentPollingHandlers
  controller: AbortController
  failures: number
  timer: ReturnType<typeof setTimeout> | null
  stopped: boolean
}

const pollers = new Map<string, Poller>()

const nextDelay = (poller: Poller, retryAfterSeconds?: number): number => {
  if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000
  }
  const backoff = Math.min(MAX_INTERVAL_MS, BASE_INTERVAL_MS * 2 ** Math.min(poller.failures, 3))
  return backoff
}

const stopEntry = (taskId: string, poller: Poller) => {
  poller.stopped = true
  if (poller.timer) {
    clearTimeout(poller.timer)
  }
  poller.controller.abort()
  if (pollers.get(taskId) === poller) {
    pollers.delete(taskId)
  }
}

const tick = async (taskId: string, poller: Poller): Promise<void> => {
  if (poller.stopped) {
    return
  }
  let task: AgentTask | null = null
  let retryAfter: number | undefined
  let fatalGone = false
  let unauthorized = false
  let failure: unknown
  try {
    task = await fetchAgentTask(taskId, poller.controller.signal)
    poller.failures = 0
  } catch (error) {
    if (poller.stopped) {
      return
    }
    failure = error
    if (error instanceof ApiError) {
      fatalGone = error.status === 404 || error.status === 403
      unauthorized = error.status === 401
      retryAfter = error.retryAfter
    }
    poller.failures += 1
  }

  if (poller.stopped) {
    return
  }
  if (task) {
    poller.handlers.onUpdate(task)
    if (isTerminalStatus(task.status)) {
      pollers.delete(taskId)
      poller.stopped = true
      return
    }
  } else if (fatalGone || unauthorized) {
    pollers.delete(taskId)
    poller.stopped = true
    if (fatalGone) {
      poller.handlers.onGone?.(taskId)
    }
    return
  } else if (poller.failures >= MAX_CONSECUTIVE_ERRORS) {
    pollers.delete(taskId)
    poller.stopped = true
    poller.handlers.onGiveUp?.(taskId, failure)
    return
  }
  poller.timer = setTimeout(() => void tick(taskId, poller), nextDelay(poller, retryAfter))
}

/**
 * 开始轮询；同一 taskId 已在轮询时仅替换回调（保留在跑的节奏），返回 false。
 */
export const startAgentPolling = (taskId: string, handlers: AgentPollingHandlers): boolean => {
  const existing = pollers.get(taskId)
  if (existing) {
    existing.handlers = handlers
    return false
  }
  const poller: Poller = {
    handlers,
    controller: new AbortController(),
    failures: 0,
    timer: null,
    stopped: false,
  }
  pollers.set(taskId, poller)
  // 首拍延迟一点：创建接口刚返回，立即轮询大概率还是 queued
  poller.timer = setTimeout(() => void tick(taskId, poller), BASE_INTERVAL_MS)
  return true
}

export const stopAgentPolling = (taskId: string): void => {
  const poller = pollers.get(taskId)
  if (poller) {
    stopEntry(taskId, poller)
  }
}

export const isAgentPolling = (taskId: string): boolean => pollers.has(taskId)

/** 退出登录/切换账号：全部停止，避免给下一个账号推更新 */
export const stopAllAgentPolling = (): void => {
  for (const [taskId, poller] of [...pollers]) {
    stopEntry(taskId, poller)
  }
}
