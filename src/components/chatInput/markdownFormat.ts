/**
 * 输入框里的简易 Markdown 格式：只处理字符串与选区，
 * 不依赖 textarea，方便复用和单独验证。
 */

export type Selection = {
  start: number
  end: number
}

export type FormatResult = {
  text: string
  selection: Selection
}

export type BlockStyle = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'quote' | 'ul' | 'ol'

export type LinkMatch = {
  linkStart: number
  linkEnd: number
  urlStart: number
  urlEnd: number
  url: string
}

const BLOCK_PREFIX = /^(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/
const LINK_PATTERN = /\[([^\]\n]*)\]\(([^)\n]*)\)/g

const lineStartAt = (text: string, position: number) => text.lastIndexOf('\n', position - 1) + 1

const lineEndAt = (text: string, position: number) => {
  const index = text.indexOf('\n', position)
  return index === -1 ? text.length : index
}

const stripPrefix = (line: string) => line.replace(BLOCK_PREFIX, '')

const hasPrefix = (line: string, style: BlockStyle) => {
  switch (style) {
    case 'paragraph':
      return !BLOCK_PREFIX.test(line)
    case 'heading1':
      return /^#\s/.test(line)
    case 'heading2':
      return /^##\s/.test(line)
    case 'heading3':
      return /^###\s/.test(line)
    case 'quote':
      return /^>\s?/.test(line)
    case 'ul':
      return /^[-*+]\s+/.test(line)
    case 'ol':
      return /^\d+[.)]\s+/.test(line)
  }
}

const prefixFor = (style: BlockStyle, index: number) => {
  switch (style) {
    case 'paragraph':
      return ''
    case 'heading1':
      return '# '
    case 'heading2':
      return '## '
    case 'heading3':
      return '### '
    case 'quote':
      return '> '
    case 'ul':
      return '- '
    case 'ol':
      return `${index + 1}. `
  }
}

/** 光标所在行的块级样式，用于下拉框显示当前段落格式 */
export const detectBlockStyle = (text: string, position: number): BlockStyle => {
  const line = text.slice(lineStartAt(text, position), lineEndAt(text, position))
  if (hasPrefix(line, 'heading3')) {
    return 'heading3'
  }
  if (hasPrefix(line, 'heading2')) {
    return 'heading2'
  }
  if (hasPrefix(line, 'heading1')) {
    return 'heading1'
  }
  if (hasPrefix(line, 'quote')) {
    return 'quote'
  }
  if (hasPrefix(line, 'ul')) {
    return 'ul'
  }
  if (hasPrefix(line, 'ol')) {
    return 'ol'
  }
  return 'paragraph'
}

const wrappedOnce = (text: string, { start, end }: Selection, marker: string) => {
  const selected = text.slice(start, end)
  if (
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    return 'selection' as const
  }
  if (
    start >= marker.length &&
    end + marker.length <= text.length &&
    text.slice(start - marker.length, start) === marker &&
    text.slice(end, end + marker.length) === marker
  ) {
    return 'around' as const
  }
  return null
}

/** 加粗、斜体：有选区时包裹，已包裹时取消；无选区时插入一对标记并把光标放到中间 */
export const toggleInline = (text: string, selection: Selection, marker: string): FormatResult => {
  const { start, end } = selection
  const selected = text.slice(start, end)
  const wrapped = wrappedOnce(text, selection, marker)

  if (wrapped === 'selection') {
    const inner = selected.slice(marker.length, -marker.length)
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selection: { start, end: start + inner.length },
    }
  }

  if (wrapped === 'around') {
    return {
      text: text.slice(0, start - marker.length) + selected + text.slice(end + marker.length),
      selection: { start: start - marker.length, end: end - marker.length },
    }
  }

  if (!selected) {
    const position = start + marker.length
    return {
      text: text.slice(0, start) + marker + marker + text.slice(end),
      selection: { start: position, end: position },
    }
  }

  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    selection: {
      start: start + marker.length,
      end: start + marker.length + selected.length,
    },
  }
}

/** 光标在已有 Markdown 链接内时返回该链接，用于把「插入链接」变成「编辑链接」 */
export const findLinkAt = (text: string, { start, end }: Selection): LinkMatch | null => {
  LINK_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LINK_PATTERN.exec(text)) !== null) {
    const linkStart = match.index
    const linkEnd = linkStart + match[0].length
    if (start >= linkStart && start < linkEnd && end <= linkEnd) {
      const urlStart = linkStart + 1 + match[1].length + 2
      return {
        linkStart,
        linkEnd,
        urlStart,
        urlEnd: urlStart + match[2].length,
        url: match[2],
      }
    }
    if (linkStart > end) {
      break
    }
  }
  return null
}

/** 插入或更新链接：有选区时把选区作为链接文字，没有选区时用链接地址兜底 */
export const applyLink = (
  text: string,
  selection: Selection,
  url: string,
  existing: LinkMatch | null
): FormatResult => {
  if (existing) {
    const position = existing.urlStart + url.length
    return {
      text: text.slice(0, existing.urlStart) + url + text.slice(existing.urlEnd),
      selection: { start: position, end: position },
    }
  }

  const { start, end } = selection
  const label = text.slice(start, end)
  if (label) {
    return {
      text: text.slice(0, start) + `[${label}](${url})` + text.slice(end),
      selection: { start: start + 1, end: start + 1 + label.length },
    }
  }

  const inserted = `[${url}](${url})`
  const position = start + inserted.length
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    selection: { start: position, end: position },
  }
}

type LineMapping = {
  oldStart: number
  newStart: number
  oldLine: string
  newLine: string
  oldPrefixLength: number
  newPrefixLength: number
}

/** 把旧文本里的位置映射到套用块级前缀后的新位置 */
const mapPosition = (
  position: number,
  blockStart: number,
  blockEnd: number,
  lines: LineMapping[],
  oldLength: number,
  newLength: number
) => {
  if (position < blockStart) {
    return position
  }
  if (position >= blockEnd) {
    return position + newLength - oldLength
  }

  let oldStart = 0
  for (const line of lines) {
    const oldLineEnd = oldStart + line.oldLine.length + 1
    if (position < blockStart + oldLineEnd) {
      const inLine = position - blockStart - oldStart
      const newInLine =
        inLine <= line.oldPrefixLength
          ? line.newPrefixLength
          : line.newPrefixLength + inLine - line.oldPrefixLength
      return blockStart + line.newStart + newInLine
    }
    oldStart = oldLineEnd
  }

  return position + newLength - oldLength
}

/**
 * 标题、引用、列表等块级格式：作用于选区覆盖的整行。
 * 再次选择同一格式会取消；切换格式会先移除旧前缀，避免标题和列表叠加。
 */
export const applyBlockStyle = (
  text: string,
  selection: Selection,
  style: BlockStyle
): FormatResult => {
  // 选区刚好停在下一行行首时，不把下一行算进本次格式
  const endPosition =
    selection.end > selection.start && text[selection.end - 1] === '\n'
      ? selection.end - 1
      : selection.end
  const blockStart = lineStartAt(text, selection.start)
  const blockEnd = lineEndAt(text, endPosition)
  const block = text.slice(blockStart, blockEnd)
  const lines = block.split('\n')
  const nonEmpty = lines.filter((line) => line.trim() !== '')
  const toggleOff =
    style !== 'paragraph' && nonEmpty.length > 0 && nonEmpty.every((line) => hasPrefix(line, style))

  const newLines = lines.map((line, index) => {
    const content = stripPrefix(line)
    if (style === 'paragraph' || toggleOff) {
      return content
    }
    return prefixFor(style, index) + content
  })
  const newBlock = newLines.join('\n')

  if (newBlock === block) {
    return { text, selection }
  }

  const mappings: LineMapping[] = lines.map((line, index) => {
    const newLine = newLines[index]
    return {
      oldStart: 0,
      newStart: 0,
      oldLine: line,
      newLine,
      oldPrefixLength: line.length - stripPrefix(line).length,
      newPrefixLength: newLine.length - stripPrefix(newLine).length,
    }
  })
  let oldStart = 0
  let newStart = 0
  for (const mapping of mappings) {
    mapping.oldStart = oldStart
    mapping.newStart = newStart
    oldStart += mapping.oldLine.length + 1
    newStart += mapping.newLine.length + 1
  }

  return {
    text: text.slice(0, blockStart) + newBlock + text.slice(blockEnd),
    selection: {
      start: mapPosition(
        selection.start,
        blockStart,
        blockEnd,
        mappings,
        block.length,
        newBlock.length
      ),
      end: mapPosition(
        selection.end,
        blockStart,
        blockEnd,
        mappings,
        block.length,
        newBlock.length
      ),
    },
  }
}
