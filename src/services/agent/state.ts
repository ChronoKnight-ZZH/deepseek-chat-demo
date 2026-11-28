import { create } from 'zustand'
import { translate, type TranslationKey } from '../../i18n/index.js'
import { fetchAgentAvailability, type AgentAvailability } from '../api/agent.js'

/**
 * Agent 模式的前端状态：
 *   - availability 来自 /health 的灰度信息（不缓存过久：后端随时可能开关）
 *   - mode 是本机偏好，存 localStorage；灰度关闭时开关隐藏，mode 残留无副作用
 */

export type AgentMode = 'chat' | 'agent'

const MODE_KEY = 'chat-demo:agent-mode'

/** 灰度探测的缓存时长：同一会话内多次挂载不打重复请求 */
const AVAILABILITY_TTL_MS = 60_000

const readMode = (): AgentMode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'agent' ? 'agent' : 'chat'
  } catch {
    return 'chat'
  }
}

type AgentState = {
  mode: AgentMode
  /** null = 未知或探测失败：不显示 Agent 入口 */
  availability: AgentAvailability | null
}

export const useAgentStore = create<AgentState>(() => ({
  mode: readMode(),
  availability: null,
}))

export const setAgentMode = (mode: AgentMode): void => {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // 存储不可用时只在内存中生效
  }
  useAgentStore.setState({ mode })
}

let availabilityTask: Promise<void> | null = null
let availabilityAt = 0

/** 拉取 Agent 灰度状态；并发合并、TTL 内跳过，失败按“未开放”处理 */
export const refreshAgentAvailability = (force = false): Promise<void> => {
  if (availabilityTask) {
    return availabilityTask
  }
  if (!force && Date.now() - availabilityAt < AVAILABILITY_TTL_MS) {
    return Promise.resolve()
  }
  availabilityTask = (async () => {
    try {
      const availability = await fetchAgentAvailability()
      useAgentStore.setState({ availability })
    } catch {
      useAgentStore.setState({ availability: null })
    } finally {
      availabilityAt = Date.now()
      availabilityTask = null
    }
  })()
  return availabilityTask
}

/** 后端稳定错误码 → i18n 文案（对齐 auth* 系列的做法：只识别已知码，其余兜底） */
const AGENT_ERROR_KEYS: Record<string, TranslationKey> = {
  AGENT_DISABLED: 'agentErrorDisabled',
  AGENT_NOT_ALLOWED: 'agentErrorNotAllowed',
  AGENT_TASK_NOT_FOUND: 'agentErrorNotFound',
  AGENT_INVALID_STATE: 'agentErrorState',
  AGENT_EXECUTOR_UNAVAILABLE: 'agentErrorExecutor',
  AGENT_TOOL_NOT_FOUND: 'agentErrorToolNotFound',
  AGENT_TOOL_INVALID_INPUT: 'agentErrorToolInput',
  AGENT_TOOL_TIMEOUT: 'agentErrorToolTimeout',
  FILE_ACCESS_DENIED: 'agentErrorFile',
  INVALID_INPUT: 'agentErrorInput',
  PAYLOAD_TOO_LARGE: 'agentErrorPayload',
}

export const describeAgentError = (code?: string | null): string => {
  if (code && AGENT_ERROR_KEYS[code]) {
    return translate(AGENT_ERROR_KEYS[code])
  }
  return code ? `${translate('agentErrorUnknown')}: ${code}` : translate('agentErrorUnknown')
}
