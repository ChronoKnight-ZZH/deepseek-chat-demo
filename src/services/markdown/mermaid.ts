import { describeMermaidError, pushMermaidLog } from './mermaidLog.js'

type Mermaid = typeof import('mermaid').default

let mermaidPromise: Promise<Mermaid> | null = null
let renderQueue = Promise.resolve()
let nextId = 0

const loadMermaid = () => {
  mermaidPromise ??= import('mermaid')
    .then((module) => module.default)
    .catch((error: unknown) => {
      mermaidPromise = null
      pushMermaidLog({
        action: 'render',
        target: 'render',
        level: 'error',
        message: `load failed: ${describeMermaidError(error)}`,
      })
      throw error
    })
  return mermaidPromise
}

/** 模型输出被截断时常见的占位省略号行，mermaid 的任何图表类型都不接受 */
const PLACEHOLDER_LINE = /^(?:\.{3,}|…+)$/

/**
 * 绘制前的源码整理：
 * 1. 转义图片标签，避免被当成 HTML 注入；
 * 2. 丢掉整行的占位省略号（如 `...`），这类行只会让整段图表解析失败。
 * 只影响绘制，不改动用户看到的原始代码。
 */
const prepareCode = (code: string): { code: string; removed: number } => {
  let removed = 0
  const lines = code
    .split(/\r?\n/)
    .filter((line) => {
      if (!PLACEHOLDER_LINE.test(line.trim())) {
        return true
      }
      removed += 1
      return false
    })
    .join('\n')
  return { code: lines.replace(/<((?:img|image)\s+)/gi, '&lt;$1'), removed }
}

export type RenderOptions = {
  /** 导出图片时关闭 HTML 标签：foreignObject 在 SVG 作为图片加载时不会被绘制 */
  htmlLabels?: boolean
  /** 流式绘制频繁重试，静默模式不写日志，避免刷屏 */
  silent?: boolean
}

/** 串行执行初始化和绘制，避免不同图表互相覆盖 Mermaid 的全局配置。 */
export const renderMermaid = (
  code: string,
  dark: boolean,
  isCancelled: () => boolean,
  { htmlLabels = true, silent = false }: RenderOptions = {}
): Promise<string | null> => {
  const result = renderQueue.then(async () => {
    const prepared = prepareCode(code)
    if (isCancelled() || !prepared.code.trim()) {
      return null
    }

    const mermaid = await loadMermaid()
    if (isCancelled()) {
      return null
    }

    mermaid.initialize({
      theme: dark ? 'dark' : 'default',
      securityLevel: 'strict',
      startOnLoad: false,
      suppressErrorRendering: true,
      flowchart: { htmlLabels },
      class: { htmlLabels },
    })

    try {
      const { svg } = await mermaid.render(`standalone-mermaid-${nextId++}`, prepared.code)
      if (!silent && !isCancelled()) {
        const skipped = prepared.removed > 0 ? `, skipped ${prepared.removed} placeholder line(s)` : ''
        pushMermaidLog({
          action: 'render',
          target: 'render',
          level: 'info',
          message: `rendered${dark ? ' (dark)' : ''}${skipped}`,
        })
      }
      return isCancelled() ? null : svg
    } catch (error) {
      if (!silent) {
        pushMermaidLog({
          action: 'render',
          target: 'render',
          level: 'error',
          message: describeMermaidError(error),
          code,
        })
      }
      throw error
    }
  })

  // 某张图失败不阻塞后续图表；调用方仍收到原始任务的错误。
  renderQueue = result.then(
    () => {},
    () => {}
  )
  return result
}