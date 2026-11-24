import clsx from 'clsx'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
} from 'react'
import {
  defaultKeymap,
  history,
  historyKeymap,
  insertNewline,
  redo,
  undo,
} from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view'
import { GFM } from '@lezer/markdown'
import { sanitizeUrl } from '../markdown/Link.js'
import { ComposerLinkMenu } from './ComposerLinkMenu.js'
import { markdownRendering, type ComposerLink } from './composerMarkdown.js'
import styles from './ChatInput.module.css'
import './markdownComposer.css'

export type ComposerSelection = {
  start: number
  end: number
}

export type ComposerHandle = {
  focus: () => void
  blur: () => void
  getSelection: () => ComposerSelection
  /** 选中文本在视口中的包围盒，没有选中内容时返回 null */
  getSelectionRect: () => DOMRect | null
  setSelection: (selection: ComposerSelection) => void
  insertText: (text: string) => void
  /** 用格式化结果整体替换正文，作为一次可撤销的编辑 */
  applyEdit: (result: { text: string; selection: ComposerSelection }) => void
}

type MarkdownComposerProps = {
  value: string
  onChange: (value: string) => void
  onSelectionChange?: (selection: ComposerSelection) => void
  onSubmit: () => void
  onPasteFiles: (files: File[]) => void
  placeholder: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

/** 等宽字体和正文尺寸与原来的 textarea 对齐，去掉 CodeMirror 自带的外边距 */
const composerTheme = EditorView.theme({
  '&': {
    color: 'var(--dsw-alias-label-primary)',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    overflowY: 'auto',
    maxHeight: '336px',
    fontFamily: 'inherit',
    lineHeight: 'inherit',
  },
  '.cm-content': {
    boxSizing: 'border-box',
    minHeight: 'var(--composer-min-height)',
    padding: 'var(--input-padding-top) 12px 0 16px',
    fontFamily: 'inherit',
    caretColor: 'var(--dsw-alias-brand-text)',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-placeholder': {
    color: 'var(--dsw-alias-label-caption)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--dsw-alias-brand-text)',
  },
})

const MarkdownComposerInner = (
  {
    value,
    onChange,
    onSelectionChange,
    onSubmit,
    onPasteFiles,
    placeholder,
    disabled = false,
    autoFocus = false,
    className,
  }: MarkdownComposerProps,
  ref: ForwardedRef<ComposerHandle>
) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const lastSelectionRef = useRef<ComposerSelection | null>(null)
  const autoFocusRef = useRef(autoFocus)
  const compartmentsRef = useRef({
    editable: new Compartment(),
    placeholder: new Compartment(),
  })
  const [linkMenu, setLinkMenu] = useState<{ link: ComposerLink; anchor: DOMRect } | null>(null)

  // CodeMirror 扩展只在挂载时创建，通过 ref 读取最新的回调与文案
  const propsRef = useRef({
    value,
    onChange,
    onSelectionChange,
    onSubmit,
    onPasteFiles,
    placeholder,
    disabled,
  })
  propsRef.current = {
    value,
    onChange,
    onSelectionChange,
    onSubmit,
    onPasteFiles,
    placeholder,
    disabled,
  }

  const linkMenuRef = useRef<(link: ComposerLink, anchor: DOMRect) => void>(() => {})
  linkMenuRef.current = (link, anchor) => setLinkMenu({ link, anchor })

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    const { editable, placeholder: placeholderSlot } = compartmentsRef.current
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: propsRef.current.value,
        extensions: [
          history(),
          markdown({ base: markdownLanguage, extensions: [GFM] }),
          markdownRendering({
            onLinkClick: (link, anchor) => linkMenuRef.current(link, anchor),
          }),
          composerTheme,
          EditorView.lineWrapping,
          editable.of(EditorView.editable.of(!propsRef.current.disabled)),
          placeholderSlot.of(placeholderExtension(propsRef.current.placeholder)),
          keymap.of([
            {
              key: 'Enter',
              run: () => {
                if (propsRef.current.disabled) {
                  return false
                }
                propsRef.current.onSubmit()
                return true
              },
            },
            { key: 'Shift-Enter', run: insertNewline },
            // 显式覆盖撤销/重做，避免 Windows 上的 Ctrl+Shift+Z 落到浏览器原生重做
            { key: 'Mod-z', run: undo, preventDefault: true },
            { key: 'Mod-Shift-z', run: redo, preventDefault: true },
            { key: 'Ctrl-Shift-z', run: redo, preventDefault: true },
            { key: 'Mod-y', run: redo, preventDefault: true },
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              propsRef.current.onChange(update.state.doc.toString())
            }
            if (!update.docChanged && !update.selectionSet) {
              return
            }
            const { from, to } = update.state.selection.main
            const previous = lastSelectionRef.current
            if (previous?.start === from && previous.end === to) {
              return
            }
            lastSelectionRef.current = { start: from, end: to }
            propsRef.current.onSelectionChange?.({ start: from, end: to })
          }),
          EditorView.domEventHandlers({
            // 浏览器菜单或系统快捷键触发的原生撤销/重做会绕过编辑器历史，统一改走 CodeMirror
            beforeinput(event, view) {
              if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') {
                return false
              }
              event.preventDefault()
              if (event.inputType === 'historyUndo') {
                undo(view)
              } else {
                redo(view)
              }
              return true
            },
            paste(event) {
              const files = Array.from(event.clipboardData?.files ?? [])
              if (files.length === 0) {
                return false
              }
              event.preventDefault()
              propsRef.current.onPasteFiles(files)
              return true
            },
          }),
        ],
      }),
    })
    viewRef.current = view
    if (autoFocusRef.current) {
      view.focus()
    }

    // 撤销/重做在捕获阶段拦截，避免浏览器把快捷键当成原生 contenteditable 历史
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return
      }
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (key === 'y' || event.shiftKey) {
        redo(view)
      } else {
        undo(view)
      }
    }
    host.addEventListener('keydown', onKeyDown, true)

    return () => {
      host.removeEventListener('keydown', onKeyDown, true)
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // 草稿被外部改写（例如切换会话恢复）时同步原文，排除本编辑器刚提交的内容
  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) {
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) },
      annotations: Transaction.addToHistory.of(false),
    })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }
    view.dispatch({
      effects: compartmentsRef.current.editable.reconfigure(EditorView.editable.of(!disabled)),
    })
  }, [disabled])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }
    view.dispatch({
      effects: compartmentsRef.current.placeholder.reconfigure(placeholderExtension(placeholder)),
    })
  }, [placeholder])

  useImperativeHandle(
    ref,
    () => ({
      focus: () => viewRef.current?.focus(),
      blur: () => viewRef.current?.contentDOM.blur(),
      getSelection: () => {
        const selection = viewRef.current?.state.selection.main
        return { start: selection?.from ?? 0, end: selection?.to ?? 0 }
      },
      getSelectionRect: () => {
        const view = viewRef.current
        if (!view) {
          return null
        }
        const { from, to } = view.state.selection.main
        if (from === to) {
          return null
        }
        const first = view.coordsAtPos(from)
        const last = view.coordsAtPos(to - 1)
        if (!first || !last) {
          return null
        }
        const left = Math.min(first.left, last.left)
        const right = Math.max(first.right, last.right)
        const top = Math.min(first.top, last.top)
        const bottom = Math.max(first.bottom, last.bottom)
        return new DOMRect(left, top, right - left, bottom - top)
      },
      setSelection: ({ start, end }) => {
        const view = viewRef.current
        if (!view) {
          return
        }
        const length = view.state.doc.length
        view.dispatch({
          selection: { anchor: Math.min(start, length), head: Math.min(end, length) },
          scrollIntoView: true,
        })
        view.focus()
      },
      insertText: (text) => {
        const view = viewRef.current
        if (!view) {
          return
        }
        const { from, to } = view.state.selection.main
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          scrollIntoView: true,
        })
        view.focus()
      },
      applyEdit: ({ text, selection }) => {
        const view = viewRef.current
        if (!view) {
          return
        }
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: selection.start, head: selection.end },
          scrollIntoView: true,
        })
        view.focus()
      },
    }),
    []
  )

  const closeLinkMenu = () => setLinkMenu(null)

  const openLink = () => {
    if (!linkMenu) {
      return
    }
    const href = sanitizeUrl(linkMenu.link.url)
    setLinkMenu(null)
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  }

  // 编辑链接文本 / 地址：只替换对应片段，保持其余 Markdown 不变
  const replaceLinkRange = (from: number, to: number, text: string) => {
    const view = viewRef.current
    if (!view) {
      return
    }
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true,
    })
    view.focus()
    setLinkMenu(null)
  }

  return (
    <>
      <div ref={hostRef} className={clsx(styles.composer, className)} />
      {linkMenu ? (
        <ComposerLinkMenu
          link={linkMenu.link}
          anchor={linkMenu.anchor}
          onOpen={openLink}
          onChangeText={(text) =>
            replaceLinkRange(linkMenu.link.labelFrom, linkMenu.link.labelTo, text)
          }
          onChangeUrl={(url) => replaceLinkRange(linkMenu.link.urlFrom, linkMenu.link.urlTo, url)}
          onClose={closeLinkMenu}
        />
      ) : null}
    </>
  )
}

export const MarkdownComposer = forwardRef(MarkdownComposerInner)
