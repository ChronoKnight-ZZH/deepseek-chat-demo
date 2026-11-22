import { renderMermaid } from './mermaid.js'
import { pushMermaidLog } from './mermaidLog.js'
import { buildFileName, saveBlob } from '../../utils/download.js'

/** 导出用的固定前缀 */
const FILE_PREFIX = 'mermaid'

/** PNG 导出倍率：2 倍在高分屏上也清晰 */
const PNG_SCALE = 2

/** 无法确定尺寸时的兜底画布大小 */
const FALLBACK_SIZE = { width: 800, height: 600 }

/** 图片导出时的最大边长，避免超大图表撑爆 canvas 内存 */
const MAX_EDGE = 8192

const SVG_NS = 'http://www.w3.org/2000/svg'

const round = (value: number) => Math.round(value * 100) / 100

/** 从 svg 根节点读出绘图区尺寸：优先 viewBox，其次纯像素的 width/height */
const readSize = (svg: Element): { width: number; height: number } => {
  const viewBox = svg.getAttribute('viewBox')
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
      const [, , width, height] = parts
      if (width > 0 && height > 0) {
        return { width, height }
      }
    }
  }
  const px = (name: 'width' | 'height') => {
    const raw = svg.getAttribute(name)?.trim() ?? ''
    const value = /^[\d.]+$/.test(raw) ? Number(raw) : Number.NaN
    return Number.isFinite(value) && value > 0 ? value : null
  }
  const width = px('width')
  const height = px('height')
  return width !== null && height !== null ? { width, height } : FALLBACK_SIZE
}

/**
 * 把 foreignObject 里的 HTML 标签重建为 SVG <text>。
 * mermaid 11 即使 htmlLabels:false 仍会为每个节点生成 foreignObject，
 * 而 foreignObject 既无法通过严格 XML 解析（SVG 导出失败），
 * 又会让 canvas 被污染（PNG 的 toBlob 抛 Tainted canvases）。
 * 需要在挂到文档、能取到主题 computed style 之后再替换。
 */
const rebuildLabels = (svgEl: SVGSVGElement) => {
  svgEl.querySelectorAll('foreignObject').forEach((fo) => {
    // foreignObject 自身通常没有 x/y，位置由父级 <g transform> 决定，本地坐标从 0 起
    const x = Number.parseFloat(fo.getAttribute('x') ?? '') || 0
    const y = Number.parseFloat(fo.getAttribute('y') ?? '') || 0
    const width = Number.parseFloat(fo.getAttribute('width') ?? '') || 0
    const height = Number.parseFloat(fo.getAttribute('height') ?? '') || 0

    // <br/> 换行；其余标签去掉，只保留文本
    const holder = document.createElement('div')
    holder.innerHTML = fo.innerHTML.replace(/<br\s*\/?>/gi, '\n')
    const lines = (holder.textContent ?? '')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)

    const label = fo.querySelector<HTMLElement>('span, div') ?? fo
    const style = getComputedStyle(label)
    const fontSize = Number.parseFloat(style.fontSize) || 16
    const color = style.color || 'rgb(51, 51, 51)'
    const family = style.fontFamily || 'sans-serif'
    // 外层 div 决定水平对齐；mermaid 默认居中
    const outer = fo.querySelector<HTMLElement>('div')
    const align = outer ? getComputedStyle(outer).textAlign : 'center'
    const anchor =
      align === 'start' || align === 'left'
        ? 'start'
        : align === 'end' || align === 'right'
          ? 'end'
          : 'middle'
    const textX = anchor === 'start' ? x : anchor === 'end' ? x + width : x + width / 2
    const lineHeight = Math.round(fontSize * 1.3)

    const text = document.createElementNS(SVG_NS, 'text')
    text.setAttribute('text-anchor', anchor)
    text.setAttribute('fill', color)
    text.setAttribute('font-size', String(fontSize))
    text.setAttribute('font-family', family)
    if (lines.length > 0) {
      // 多行整体垂直居中，首行基线在盒子中部上方
      const firstBaseline = y + (height - lines.length * lineHeight) / 2 + fontSize
      lines.forEach((line, index) => {
        const tspan = document.createElementNS(SVG_NS, 'tspan')
        tspan.setAttribute('x', String(round(textX)))
        tspan.setAttribute('y', String(round(firstBaseline + index * lineHeight)))
        tspan.textContent = line
        text.appendChild(tspan)
      })
    }
    fo.replaceWith(text)
  })
}

/**
 * 生成可独立打开、也能安全画进 canvas 的 SVG 源码。
 * 需要先把图表挂到文档里，才能读到 mermaid 内联 <style> 的主题样式（颜色 / 字号）。
 */
const buildStandaloneSvg = (markup: string, background: string | null): string | null => {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:absolute;left:-99999px;top:0;pointer-events:none'
  host.innerHTML = markup
  document.body.appendChild(host)

  try {
    const svgEl = host.querySelector('svg')
    if (!svgEl) {
      return null
    }
    rebuildLabels(svgEl)

    const { width, height } = readSize(svgEl)
    svgEl.setAttribute('xmlns', SVG_NS)
    svgEl.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
    svgEl.setAttribute('width', String(width))
    svgEl.setAttribute('height', String(height))
    svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`)
    // mermaid 写入的内联尺寸会压缩导出图，交给上面的属性统一控制
    svgEl.style?.removeProperty('max-width')
    svgEl.style?.removeProperty('height')
    svgEl.style?.removeProperty('width')

    if (background) {
      const rect = document.createElementNS(SVG_NS, 'rect')
      rect.setAttribute('width', '100%')
      rect.setAttribute('height', '100%')
      rect.setAttribute('fill', background)
      svgEl.insertBefore(rect, svgEl.firstChild)
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svgEl)}`
  } finally {
    host.remove()
  }
}

/** 读取主题背景色，PNG 与预览用它填充画布 */
const readBackground = (): string => {
  const body = getComputedStyle(document.body).backgroundColor
  return body && body !== 'rgba(0, 0, 0, 0)' ? body : '#ffffff'
}

/**
 * 生成用于导出 / 预览的 SVG 源码。
 * 关闭 HTML 标签重新绘制，再把标签重建为纯 SVG text，
 * 这样既能让 <img> 预览显示文字，也不会污染 canvas。
 */
export const renderPreviewSvg = async (
  code: string,
  dark: boolean,
  background: string | null = readBackground()
): Promise<string | null> => {
  const markup = await renderMermaid(code, dark, () => false, { htmlLabels: false })
  return markup ? buildStandaloneSvg(markup, background) : null
}

/** 下载为 SVG 源码文件：保持透明底色，方便再加工 */
export const downloadMermaidSvg = async (code: string, dark: boolean): Promise<boolean> => {
  const source = await renderPreviewSvg(code, dark, null)
  if (!source) {
    return false
  }
  saveBlob(
    new Blob([source], { type: 'image/svg+xml;charset=utf-8' }),
    buildFileName(FILE_PREFIX, 'svg')
  )
  return true
}

/** 下载为 PNG 图片：把 SVG 画到 canvas 再导出，背景取当前主题色 */
export const downloadMermaidPng = async (code: string, dark: boolean): Promise<boolean> => {
  const background = readBackground()
  const source = await renderPreviewSvg(code, dark, background)
  if (!source) {
    return false
  }
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = parsed.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    return false
  }
  const { width, height } = readSize(root)
  // 高分屏放大后可能超出浏览器 canvas 上限，按比例收口
  const scale = Math.min(PNG_SCALE, MAX_EDGE / Math.max(width, height, 1))
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))

  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('svg load failed'))
      image.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      return false
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/png')
    )
    if (!blob) {
      return false
    }
    saveBlob(blob, buildFileName(FILE_PREFIX, 'png'))
    return true
  } catch (error) {
    pushMermaidLog({
      action: 'export',
      target: 'png',
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
      code,
    })
    return false
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 下载图表源码，扩展名沿用 mermaid 的 .mermaid */
export const downloadMermaidCode = (code: string) => {
  saveBlob(
    new Blob([`${code.trimEnd()}\n`], { type: 'text/plain;charset=utf-8' }),
    buildFileName(FILE_PREFIX, 'mermaid')
  )
}

/** 导出的统一入口：成功 / 失败都写日志，失败时附带源码 */
export const exportMermaid = async (
  target: 'svg' | 'png' | 'code',
  code: string,
  dark: boolean
): Promise<boolean> => {
  try {
    let ok: boolean
    if (target === 'code') {
      downloadMermaidCode(code)
      ok = true
    } else if (target === 'svg') {
      ok = await downloadMermaidSvg(code, dark)
    } else {
      ok = await downloadMermaidPng(code, dark)
    }
    pushMermaidLog({
      action: 'export',
      target,
      level: ok ? 'info' : 'error',
      message: ok ? 'ok' : 'export failed',
      code: ok ? undefined : code,
    })
    return ok
  } catch (error) {
    pushMermaidLog({
      action: 'export',
      target,
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
      code,
    })
    return false
  }
}

/** 全屏预览用的图片地址：内联 data URL，无需管理对象地址生命周期 */
export const toSvgDataUrl = (source: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
