import { buildFileName, saveBlob } from './download.js'

/** 下载文件名固定前缀 */
const FILE_PREFIX = 'code'

/** 读取 HTML 源码中的 <title>，用于预览面板标题 */
export const getHtmlTitle = (code: string) => {
  try {
    return new DOMParser().parseFromString(code, 'text/html').title.trim()
  } catch {
    return ''
  }
}

/** infostring → 下载文件扩展名 */
const extensionMap: Record<string, string> = {
  html: 'html',
  htm: 'html',
  xml: 'xml',
  vue: 'vue',
  svg: 'svg',
  css: 'css',
  scss: 'scss',
  less: 'less',
  python: 'py',
  py: 'py',
  python3: 'py',
  javascript: 'js',
  js: 'js',
  node: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  json: 'json',
  jsonc: 'jsonc',
  json5: 'json5',
  txt: 'txt',
  text: 'txt',
  plain: 'txt',
  plaintext: 'txt',
  bat: 'bat',
  batch: 'bat',
  cmd: 'bat',
  dos: 'bat',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  zsh: 'sh',
  md: 'md',
  markdown: 'md',
  yaml: 'yaml',
  yml: 'yaml',
  php: 'php',
  java: 'java',
  c: 'c',
  h: 'h',
  cpp: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
  hpp: 'hpp',
  csharp: 'cs',
  'c#': 'cs',
  cs: 'cs',
  go: 'go',
  golang: 'go',
  rust: 'rs',
  rs: 'rs',
  ruby: 'rb',
  rb: 'rb',
  swift: 'swift',
  kotlin: 'kt',
  kt: 'kt',
  dart: 'dart',
  lua: 'lua',
  r: 'r',
  perl: 'pl',
  sql: 'sql',
  ini: 'ini',
  toml: 'toml',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  powershell: 'ps1',
  ps1: 'ps1',
  latex: 'tex',
  tex: 'tex',
  graphql: 'graphql',
  protobuf: 'proto',
  mermaid: 'mmd',
  diff: 'diff',
  csv: 'csv',
}

/** 根据代码块标题栏的 infostring 解析扩展名，未知语言回退到 txt */
export const toExtension = (infostring: string): string => {
  const key = infostring.trim().toLowerCase()
  if (Object.hasOwn(extensionMap, key)) {
    return extensionMap[key]
  }
  // 形如 "ts title" 这类带参数的 infostring，只取首个单词
  const first = key.split(/\s+/)[0]
  if (Object.hasOwn(extensionMap, first)) {
    return extensionMap[first]
  }
  // 其余情况仅保留字母数字且足够短时沿用，否则回退 txt
  const safe = first.replace(/[^a-z0-9+#]/g, '')
  return safe && safe.length <= 8 ? safe : 'txt'
}

/** 按扩展名选择 MIME 类型，其余一律纯文本 */
const toMimeType = (ext: string): string => {
  if (ext === 'html') {
    return 'text/html;charset=utf-8'
  }
  if (ext === 'svg') {
    return 'image/svg+xml;charset=utf-8'
  }
  if (ext === 'json' || ext === 'jsonc' || ext === 'json5') {
    return 'application/json;charset=utf-8'
  }
  if (ext === 'csv') {
    return 'text/csv;charset=utf-8'
  }
  return 'text/plain;charset=utf-8'
}

/** 将代码块内容下载为文件，类型取自标题栏的语言名（infostring） */
export const downloadCode = (code: string, infostring: string) => {
  const ext = toExtension(infostring)
  saveBlob(new Blob([code], { type: toMimeType(ext) }), buildFileName(FILE_PREFIX, ext))
}
