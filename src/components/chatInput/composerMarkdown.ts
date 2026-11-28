import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'

/** 输入框里的一条 Markdown 链接及其在原文中的位置 */
export type ComposerLink = {
  from: number
  to: number
  label: string
  url: string
  labelFrom: number
  labelTo: number
  urlFrom: number
  urlTo: number
}

const HIDDEN = Decoration.replace({})
const LINK_PATTERN = /^\[([^\]\n]*)\]\(([^)\n]*)\)$/

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: 'cm-md-h1',
  ATXHeading2: 'cm-md-h2',
  ATXHeading3: 'cm-md-h3',
  ATXHeading4: 'cm-md-h4',
  ATXHeading5: 'cm-md-h5',
  ATXHeading6: 'cm-md-h6',
  SetextHeading1: 'cm-md-h1',
  SetextHeading2: 'cm-md-h2',
}

const readLink = (state: EditorState, node: SyntaxNode): ComposerLink | null => {
  const source = state.doc.sliceString(node.from, node.to)
  const match = LINK_PATTERN.exec(source)
  if (!match) {
    return null
  }
  const labelFrom = node.from + 1
  const labelTo = labelFrom + match[1].length
  const urlFrom = labelTo + 2
  return {
    from: node.from,
    to: node.to,
    label: match[1],
    url: match[2],
    labelFrom,
    labelTo,
    urlFrom,
    urlTo: urlFrom + match[2].length,
  }
}

/** 光标所在位置的链接；点中标签或链接图标后用它拿到可编辑范围 */
export const findLinkNode = (state: EditorState, position: number): ComposerLink | null => {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1); node; ) {
    if (node.name === 'Link') {
      return readLink(state, node)
    }
    node = node.parent
  }
  return null
}

/**
 * 把 Markdown 源码渲染成富文本：语法标记用 replace 装饰隐藏，内容用 mark / line 装饰上样式。
 * 链接保留标签文字，标签前用 CSS 画一个地球图标，点击时交给外部打开操作弹窗。
 */
const buildDecorations = (view: EditorView): DecorationSet => {
  const { state } = view
  const decorations: Range<Decoration>[] = []
  const styledLines = new Set<number>()

  const addLine = (position: number, className: string) => {
    const line = state.doc.lineAt(position)
    if (styledLines.has(line.from)) {
      return
    }
    styledLines.add(line.from)
    decorations.push(Decoration.line({ class: className }).range(line.from))
  }

  const hide = (from: number, to: number) => {
    if (to > from) {
      decorations.push(HIDDEN.range(from, to))
    }
  }

  const mark = (
    from: number,
    to: number,
    className: string,
    attributes?: Record<string, string>
  ) => {
    if (to > from) {
      decorations.push(Decoration.mark({ class: className, attributes }).range(from, to))
    }
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        switch (node.name) {
          case 'HeaderMark': {
            const heading = node.node.parent?.name ?? ''
            addLine(node.from, HEADING_CLASS[heading] ?? 'cm-md-h4')
            hide(node.from, node.to)
            break
          }
          case 'QuoteMark':
            addLine(node.from, 'cm-md-quote')
            hide(node.from, node.to)
            break
          case 'ListMark': {
            const list = node.node.parent?.parent?.name
            if (list === 'OrderedList') {
              mark(node.from, node.to, 'cm-md-list-mark')
            } else {
              addLine(node.from, 'cm-md-bullet')
              hide(node.from, node.to)
            }
            break
          }
          case 'HorizontalRule':
            addLine(node.from, 'cm-md-rule')
            hide(node.from, node.to)
            break
          case 'StrongEmphasis':
            mark(node.from, node.to, 'cm-md-strong')
            break
          case 'Emphasis':
            mark(node.from, node.to, 'cm-md-em')
            break
          case 'Strikethrough':
            mark(node.from, node.to, 'cm-md-strike')
            break
          case 'InlineCode':
            mark(node.from, node.to, 'cm-md-code')
            break
          case 'EmphasisMark':
          case 'StrikethroughMark':
          case 'CodeMark':
          case 'CodeInfo':
            // 只隐藏语法标记，代码块内容按普通文本显示，不绘制代码框
            hide(node.from, node.to)
            break
          case 'Link': {
            const link = readLink(state, node.node)
            if (link) {
              mark(link.labelFrom, link.labelTo, 'cm-md-link', { title: link.url })
              hide(node.from, link.labelFrom)
              hide(link.labelTo, node.to)
            }
            break
          }
        }
      },
    })
  }

  return Decoration.set(decorations, true)
}

/** Markdown 渲染装饰 + 链接点击检测；样式的尺寸部分由 EditorView.theme 提供 */
export const markdownRendering = (handlers: {
  onLinkClick: (link: ComposerLink, anchor: DOMRect) => void
}) => [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view)
        }
      }
    },
    { decorations: (value) => value.decorations }
  ),
  EditorView.domEventHandlers({
    mousedown(event, view) {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return false
      }
      const element = target.closest('.cm-md-link')
      if (!(element instanceof HTMLElement)) {
        return false
      }
      const link = findLinkNode(view.state, view.posAtDOM(element, 0))
      if (!link) {
        return false
      }
      // 点击链接不移动光标，直接交给操作弹窗
      event.preventDefault()
      handlers.onLinkClick(link, element.getBoundingClientRect())
      return true
    },
  }),
]
