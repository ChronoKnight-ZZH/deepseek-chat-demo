import { create } from 'zustand'
import { buildFileName, saveBlob } from '../../utils/download.js'

/** 日志来源：渲染图表，或导出图片 / 代码 */
export type MermaidLogAction = 'render' | 'export'

/** 日志阶段：render 为预览绘制，svg / png / code 为对应的导出目标 */
export type MermaidLogTarget = 'render' | 'svg' | 'png' | 'code'

export type MermaidLogEntry = {
  id: number
  at: number
  action: MermaidLogAction
  target: MermaidLogTarget
  level: 'info' | 'error'
  message: string
  /** 解析错误指向的源码行号（mermaid 报错形如 "Parse error on line 6"） */
  line?: number
  /** 相同内容连续出现的次数，流式绘制时避免刷屏 */
  repeat: number
  /** 出错时保留图表源码，方便直接复现 */
  code?: string
}

/** 只保留最近的若干条，避免流式渲染时无限增长 */
const MAX_ENTRIES = 100
/** 单条日志里保存的源码上限，避免日志文件过大 */
const MAX_CODE_LENGTH = 4000

let nextId = 0

type MermaidLogState = {
  entries: MermaidLogEntry[]
  /** 日志查看弹窗是否打开 */
  open: boolean
}

export const useMermaidLog = create<MermaidLogState>(() => ({ entries: [], open: false }))

/** 从 mermaid 的解析错误里取出出错行号，没有则返回 undefined */
export const parseErrorLine = (message: string): number | undefined => {
  const match = /on line (\d+)/i.exec(message)
  return match ? Number(match[1]) : undefined
}

/** 追加一条日志，最新的排在最前面；与上一条内容相同时只累计次数 */
export const pushMermaidLog = (entry: Omit<MermaidLogEntry, 'id' | 'at' | 'repeat' | 'line'>) => {
  const code = entry.code ? entry.code.slice(0, MAX_CODE_LENGTH) : undefined
  // 在更新函数外生成，避免 StrictMode 下重复调用导致 id 跳号
  const record: MermaidLogEntry = {
    ...entry,
    code,
    line: parseErrorLine(entry.message),
    id: nextId++,
    at: Date.now(),
    repeat: 1,
  }
  useMermaidLog.setState((state) => {
    const [first] = state.entries
    if (
      first &&
      first.action === record.action &&
      first.target === record.target &&
      first.level === record.level &&
      first.message === record.message &&
      !code
    ) {
      return {
        entries: [
          { ...first, at: record.at, repeat: first.repeat + 1 },
          ...state.entries.slice(1),
        ],
      }
    }
    return { entries: [record, ...state.entries].slice(0, MAX_ENTRIES) }
  })
}

export const clearMermaidLog = () => useMermaidLog.setState({ entries: [] })

export const openMermaidLog = () => useMermaidLog.setState({ open: true })

export const closeMermaidLog = () => useMermaidLog.setState({ open: false })

export const hasMermaidError = (entries: MermaidLogEntry[]) =>
  entries.some((entry) => entry.level === 'error')

const pad = (value: number) => String(value).padStart(2, '0')

/** 本地时间，精确到秒 */
export const formatTime = (at: number) => {
  const date = new Date(at)
  const day = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-')
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 把错误对象整理成一行可读文本：mermaid 的语法错误放在 str 里 */
export const describeMermaidError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    const detail = error as { str?: unknown; message?: unknown }
    if (typeof detail.str === 'string' && detail.str.trim()) {
      return detail.str
    }
    if (typeof detail.message === 'string' && detail.message.trim()) {
      return detail.message
    }
  }
  const text = String(error ?? '')
  return text.trim() || 'unknown error'
}

/** 汇总成可读文本：按时间倒序，出错条目附带源码 */
export const formatMermaidLog = (entries: MermaidLogEntry[]): string =>
  entries
    .map((entry) => {
      const repeat = entry.repeat > 1 ? ` ×${entry.repeat}` : ''
      const head = `[${formatTime(entry.at)}] ${entry.action}/${entry.target} ${entry.level.toUpperCase()} ${entry.message}${repeat}`
      return entry.code ? `${head}\n--- code ---\n${entry.code}\n--- end ---` : head
    })
    .join('\n\n')

/** 浏览器与运行环境信息，失败排查时一并给出 */
const environment = () =>
  [
    `ua: ${navigator.userAgent}`,
    `locale: ${document.documentElement.lang || navigator.language}`,
    `url: ${location.href}`,
  ].join('\n')

/** 下载日志文件，内容为当前列表与运行环境 */
export const downloadMermaidLog = () => {
  const entries = useMermaidLog.getState().entries
  const body = [
    '# mermaid log',
    environment(),
    `entries: ${entries.length}`,
    '',
    formatMermaidLog(entries),
  ]
    .join('\n')
    .trimEnd()
  saveBlob(
    new Blob([`${body}\n`], { type: 'text/plain;charset=utf-8' }),
    buildFileName('mermaid-log', 'txt')
  )
}