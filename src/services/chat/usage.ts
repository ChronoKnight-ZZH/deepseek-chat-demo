import type { ChatModel, MessageUsage } from '../api/types.js'

/**
 * 每百万 Token 的人民币单价。API 只返回 token 用量、不返回金额，
 * 费用只能按本地单价估算；模型调价或新增模型时在这里维护。
 * 缓存写入按未命中输入计价。
 */
const PRICE_PER_MILLION: Record<ChatModel, { input: number; cacheRead: number; output: number }> = {
  'deepseek-flash': { input: 2, cacheRead: 0.2, output: 3 },
  'deepseek-v4-pro': { input: 2, cacheRead: 0.2, output: 3 },
}

export type UsageSummary = {
  /** 本轮全部输入，含未命中缓存与命中缓存的部分 */
  input: number
  cached: number
  output: number
  /** 未记录模型时为 null，只展示用量不展示费用 */
  cost: number | null
}

export const summarizeUsage = (usage: MessageUsage, model: ChatModel | null): UsageSummary => {
  const cached = usage.cache_read_input_tokens
  const uncached = usage.input_tokens + usage.cache_creation_input_tokens
  const output = usage.output_tokens
  const price = model ? PRICE_PER_MILLION[model] : undefined
  return {
    input: uncached + cached,
    cached,
    output,
    cost: price
      ? (uncached * price.input + cached * price.cacheRead + output * price.output) / 1e6
      : null,
  }
}

/** 与界面上的用量展示保持一致：不足一千显示原值，否则以 K 为单位保留一位小数 */
export const formatTokens = (tokens: number) =>
  tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}K`

/** 金额按三位小数展示，过小的时候不显示为 0 */
export const formatCost = (cost: number) => {
  if (cost === 0) {
    return '0'
  }
  return cost < 0.001 ? '<0.001' : String(Number(cost.toFixed(3)))
}
