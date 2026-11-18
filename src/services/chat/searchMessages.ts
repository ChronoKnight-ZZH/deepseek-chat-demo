import { getVisibleMessages, normalizeSession } from './branches.js'
import { loadAllSessions } from './db.js'
import type { Message, TextPart } from './types.js'

/** 摘要中命中的位置，用于高亮 */
export type MessageSearchRange = { start: number; end: number }

export type MessageSearchHit = {
  sessionId: string
  messageId: string
  sessionTitle: string
  role: Message['role']
  createdAt: number
  /** 命中位置前后的一小段正文，首尾可能带省略号 */
  snippet: string
  ranges: MessageSearchRange[]
}

/** 一次最多返回的结果数，避免结果过多拖慢渲染 */
const RESULT_LIMIT = 50
/** 摘要保留匹配位置之前的字符数 */
const SNIPPET_LEAD = 40
/** 摘要保留匹配位置之后的字符数 */
const SNIPPET_TAIL = 110
/** 单条摘要最多高亮的次数 */
const MAX_MARKS = 6

/** 只搜索当前展示分支上的消息，保证点击结果一定能滚动到对应位置。 */
const getSearchableText = (message: Message): string => {
  const raw =
    message.role === 'user'
      ? message.content
      : message.blocks
          .filter((block): block is TextPart => block.type === 'text' && !block.isTemplate)
          .map((block) => block.text)
          .join('\n\n')
  return raw.replace(/\s+/g, ' ').trim()
}

/** 截取匹配附近的一段正文，并计算所有高亮区间；没有命中时返回 null。 */
const createSnippet = (
  text: string,
  keyword: string
): { snippet: string; ranges: MessageSearchRange[] } | null => {
  const index = text.toLocaleLowerCase().indexOf(keyword)
  if (index < 0) {
    return null
  }
  let start = Math.max(0, index - SNIPPET_LEAD)
  let end = Math.min(text.length, index + keyword.length + SNIPPET_TAIL)
  // 不截断代理对，避免出现半个 emoji
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start])) {
    start -= 1
  }
  if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) {
    end += 1
  }
  const snippet = `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
  const lower = snippet.toLocaleLowerCase()
  const ranges: MessageSearchRange[] = []
  let from = 0
  while (ranges.length < MAX_MARKS) {
    const at = lower.indexOf(keyword, from)
    if (at < 0) {
      break
    }
    ranges.push({ start: at, end: at + keyword.length })
    from = at + keyword.length
  }
  return { snippet, ranges }
}

/** 在当前所有会话的可见消息中搜索关键词，按消息时间倒序返回。 */
export const searchMessages = async (query: string): Promise<MessageSearchHit[]> => {
  const keyword = query.trim().toLocaleLowerCase()
  if (!keyword) {
    return []
  }
  const hits: MessageSearchHit[] = []
  for (const stored of await loadAllSessions()) {
    const session = normalizeSession(stored)
    for (const message of getVisibleMessages(session)) {
      const text = getSearchableText(message)
      if (!text) {
        continue
      }
      const snippet = createSnippet(text, keyword)
      if (!snippet) {
        continue
      }
      hits.push({
        sessionId: session.id,
        messageId: message.id,
        sessionTitle: session.title,
        role: message.role,
        createdAt: message.createdAt,
        snippet: snippet.snippet,
        ranges: snippet.ranges,
      })
    }
  }
  return hits.sort((a, b) => b.createdAt - a.createdAt).slice(0, RESULT_LIMIT)
}
