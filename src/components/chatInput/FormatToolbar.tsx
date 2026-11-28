import clsx from 'clsx'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { IconCheckOutline16, IconChevronDownOutline14, IconLinkOutline16 } from '../base/icons.js'
import { withDefaultProtocol } from '../markdown/Link.js'
import { Tooltip } from '../base/Tooltip.js'
import { useAnchoredPosition, useDismiss } from '../base/anchored.js'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import {
  applyBlockStyle,
  applyLink,
  detectBlockStyle,
  findLinkAt,
  toggleInline,
  type BlockStyle,
  type FormatResult,
  type LinkMatch,
  type Selection,
} from './markdownFormat.js'
import styles from './ChatInput.module.css'

const BLOCK_STYLES: BlockStyle[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'quote',
  'ol',
  'ul',
]

const BLOCK_LABELS: Record<BlockStyle, TranslationKey> = {
  paragraph: 'markdownParagraph',
  heading1: 'markdownHeading1',
  heading2: 'markdownHeading2',
  heading3: 'markdownHeading3',
  quote: 'markdownQuote',
  ol: 'markdownOrderedList',
  ul: 'markdownBulletList',
}

/** 点击格式按钮时不让编辑区失焦，选区也就不会丢 */
const keepSelection: MouseEventHandler<HTMLButtonElement> = (event) => {
  event.preventDefault()
}

const ToolbarButton = ({
  label,
  onClick,
  buttonRef,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  buttonRef?: Ref<HTMLButtonElement>
  disabled?: boolean
  children: ReactNode
}) => (
  <Tooltip content={label}>
    <button
      ref={buttonRef}
      type="button"
      className={styles.toolbarButton}
      aria-label={label}
      disabled={disabled}
      onMouseDown={keepSelection}
      onClick={onClick}
    >
      {children}
    </button>
  </Tooltip>
)

type LinkTarget = {
  selection: Selection
  existing: LinkMatch | null
}

const GAP = 8

/**
 * 输入框上方的简易 Markdown 工具栏：链接、加粗、斜体、段落格式。
 * 只在输入框有选中文本时浮在选区附近，实际写入编辑器由 onApply 完成，因此每次格式操作都可撤销。
 */
export const FormatToolbar = ({
  value,
  selection,
  getSelection,
  onApply,
  anchor,
  disabled = false,
}: {
  value: string
  selection: Selection
  getSelection: () => Selection
  onApply: (result: FormatResult) => void
  /** 选中文本在视口中的包围盒，用于把工具栏浮在选区附近 */
  anchor: DOMRect
  disabled?: boolean
}) => {
  const t = useTranslate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const linkTargetRef = useRef<LinkTarget | null>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (disabled) {
      setBlockOpen(false)
      setLinkOpen(false)
    }
  }, [disabled])

  useEffect(() => {
    if (!linkOpen) {
      return
    }
    const input = linkInputRef.current
    if (!input) {
      return
    }
    input.focus({ preventScroll: true })
    input.select()
  }, [linkOpen])

  const {
    anchorRef: linkAnchorRef,
    floatingRef: linkFloatingRef,
    position: linkPosition,
  } = useAnchoredPosition<HTMLButtonElement, HTMLDivElement>(linkOpen, {
    side: 'top',
    align: 'start',
    offset: 6,
  })

  const {
    anchorRef: blockAnchorRef,
    floatingRef: blockFloatingRef,
    position: blockPosition,
  } = useAnchoredPosition<HTMLButtonElement, HTMLDivElement>(blockOpen, {
    side: 'top',
    align: 'start',
    offset: 6,
  })

  useDismiss(linkOpen, [linkAnchorRef, linkFloatingRef], () => setLinkOpen(false), {
    captureEscape: true,
  })
  useDismiss(blockOpen, [blockAnchorRef, blockFloatingRef], () => setBlockOpen(false), {
    captureEscape: true,
  })

  const apply = useCallback(
    (result: FormatResult) => {
      onApply(result)
    },
    [onApply]
  )

  const openLink = () => {
    const current = getSelection()
    const existing = findLinkAt(value, current)
    const selected = value.slice(current.start, current.end)
    linkTargetRef.current = { selection: current, existing }
    if (existing) {
      setLinkValue(withDefaultProtocol(existing.url))
    } else if (/^https?:\/\//i.test(selected)) {
      setLinkValue(selected)
    } else {
      setLinkValue('')
    }
    setLinkOpen(true)
  }

  const confirmLink = () => {
    const url = linkValue.trim()
    const target = linkTargetRef.current
    if (!url || !target) {
      return
    }
    setLinkOpen(false)
    apply(applyLink(value, target.selection, withDefaultProtocol(url), target.existing))
  }

  const currentStyle = detectBlockStyle(value, selection.start)

  // 优先浮在选区上方，空间不足时翻到下方，并收口到视口内
  useLayoutEffect(() => {
    const element = rootRef.current
    if (!element) {
      return
    }
    const { offsetWidth: width, offsetHeight: height } = element
    const above = anchor.top - GAP - height
    const top =
      above >= GAP ? above : Math.min(anchor.bottom + GAP, window.innerHeight - height - GAP)
    const left = Math.max(
      GAP,
      Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - GAP)
    )
    setPosition({ top, left })
  }, [anchor, currentStyle])

  return (
    <div
      ref={rootRef}
      className={clsx(styles.toolbar, styles.toolbarFloating)}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <ToolbarButton
        label={t('markdownLink')}
        buttonRef={linkAnchorRef}
        disabled={disabled}
        onClick={() => {
          if (linkOpen) {
            setLinkOpen(false)
          } else {
            openLink()
          }
        }}
      >
        <IconLinkOutline16 />
      </ToolbarButton>
      <ToolbarButton
        label={t('markdownBold')}
        disabled={disabled}
        onClick={() => apply(toggleInline(value, getSelection(), '**'))}
      >
        <span className={styles.boldIcon}>B</span>
      </ToolbarButton>
      <ToolbarButton
        label={t('markdownItalic')}
        disabled={disabled}
        onClick={() => apply(toggleInline(value, getSelection(), '_'))}
      >
        <span className={styles.italicIcon}>I</span>
      </ToolbarButton>
      <button
        ref={blockAnchorRef}
        type="button"
        className={clsx(styles.blockTrigger, blockOpen && styles.blockTriggerOpen)}
        aria-label={t('markdownBlockStyle')}
        aria-haspopup="listbox"
        aria-expanded={blockOpen}
        disabled={disabled}
        onMouseDown={keepSelection}
        onClick={() => setBlockOpen((open) => !open)}
      >
        <span>{t(BLOCK_LABELS[currentStyle])}</span>
        <span className={styles.blockArrow}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {blockOpen
        ? createPortal(
            <div
              ref={blockFloatingRef}
              className={styles.blockMenu}
              style={blockPosition ?? undefined}
              role="listbox"
              aria-label={t('markdownBlockStyle')}
            >
              {BLOCK_STYLES.map((style) => (
                <div
                  key={style}
                  role="option"
                  aria-selected={style === currentStyle}
                  className={clsx(
                    styles.blockOption,
                    style === currentStyle && styles.blockOptionSelected
                  )}
                  onClick={() => {
                    setBlockOpen(false)
                    apply(applyBlockStyle(value, getSelection(), style))
                  }}
                >
                  <span>{t(BLOCK_LABELS[style])}</span>
                  {style === currentStyle ? <IconCheckOutline16 /> : null}
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
      {linkOpen
        ? createPortal(
            <div
              ref={linkFloatingRef}
              className={styles.linkPopover}
              style={linkPosition ?? undefined}
              role="dialog"
              aria-label={t('markdownLink')}
            >
              <input
                ref={linkInputRef}
                className={styles.linkInput}
                type="text"
                inputMode="url"
                placeholder={t('markdownLinkPlaceholder')}
                aria-label={t('markdownLinkPlaceholder')}
                value={linkValue}
                onChange={(event) => setLinkValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    confirmLink()
                  }
                }}
              />
              <button
                type="button"
                className={styles.linkConfirm}
                aria-label={t('markdownLinkConfirm')}
                disabled={!linkValue.trim()}
                onClick={confirmLink}
              >
                <IconCheckOutline16 />
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
