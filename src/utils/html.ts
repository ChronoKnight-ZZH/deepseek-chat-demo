/** 读取 HTML 源码中的 <title>，用于预览面板标题和下载文件名 */
export const getHtmlTitle = (code: string) => {
  try {
    return new DOMParser().parseFromString(code, 'text/html').title.trim()
  } catch {
    return ''
  }
}

/** 过滤文件名中的非法字符，标题为空时回退到 preview */
const toFileName = (title: string) => {
  const name = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
  return `${name || 'preview'}.html`
}

/** 将 HTML 源码下载为文件 */
export const downloadHtml = (code: string, title: string) => {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/html;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = toFileName(title)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
