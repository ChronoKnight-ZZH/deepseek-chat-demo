import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { withDefaultProtocol } from '../markdown/Link.js'
import { useDismiss } from '../base/anchored.js'
import {
  IconCheckOutline16,
  IconEditOutline16,
  IconExternalLinkOutline16,
  IconLinkOutline16,
} from '../base/icons.js'
import type { ComposerLink } from './composerMarkdown.js'
import styles from './ChatInput.module.css'

type Mode = 'menu' | 'text' | 'url'

const GAP = 8

/** 渲染后的链接被点击时出现的操作条：打开 / 编辑文本 / 编辑链接 */
export const ComposerLinkMenu = ({
  link,
  anchor,
  onOpen,
  onChangeText,
  onChangeUrl,
  onClose,
}: {
  link: ComposerLink
  anchor: DOMRect
  onOpen: () => void
  onChangeText: (text: string) => void
  onChangeUrl: (url: string) => void
  onClose: () => void
}) => {
  const t = useTranslate()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('menu')
  const [draft, setDraft] = useState('')
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useDismiss(true, [rootRef], onClose, { captureEscape: true })

  // 优先放在链接上方，空间不足时翻到下方，并收口到视口内
  useLayoutEffect(() => {
    const element = rootRef.current
    if (!element) {
      return
    }
    const { offsetWidth: width, offsetHeight: height } = element
    const above = anchor.top - GAP - height
    const top =
      above >= GAP ? above : Math.min(anchor.bottom + GAP, window.innerHeight - height - GAP)
    const left = Math.max(GAP, Math.min(anchor.left, window.innerWidth - width - GAP))
    setPosition({ top, left })
  }, [anchor, mode])

  useLayoutEffect(() => {
    if (mode === 'menu') {
      return
    }
    inputRef.current?.focus({ preventScroll: true })
    inputRef.current?.select()
  }, [mode])

  const confirm = () => {
    const value = draft.trim()
    if (!value) {
      return
    }
    if (mode === 'text') {
      onChangeText(value)
    } else {
      onChangeUrl(withDefaultProtocol(value))
    }
  }

  return createPortal(
    <div
      ref={rootRef}
      className={clsx(styles.composerLinkMenu, mode !== 'menu' && styles.composerLinkEditor)}
      role={mode === 'menu' ? 'menu' : 'dialog'}
      aria-label={mode === 'text' ? t('markdownEditText') : t('markdownEditLink')}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {mode === 'menu' ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={styles.composerLinkAction}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onOpen}
          >
            <IconExternalLinkOutline16 />
            <span>{t('markdownOpenLink')}</span>
          </button>
          <span className={styles.composerLinkDivider} />
          <button
            type="button"
            role="menuitem"
            className={styles.composerLinkAction}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setDraft(link.label)
              setMode('text')
            }}
          >
            <IconEditOutline16 />
            <span>{t('markdownEditText')}</span>
          </button>
          <span className={styles.composerLinkDivider} />
          <button
            type="button"
            role="menuitem"
            className={styles.composerLinkAction}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setDraft(withDefaultProtocol(link.url))
              setMode('url')
            }}
          >
            <IconLinkOutline16 />
            <span>{t('markdownEditLink')}</span>
          </button>
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            className={styles.linkInput}
            type="text"
            inputMode={mode === 'url' ? 'url' : 'text'}
            placeholder={
              mode === 'text' ? t('markdownLinkTextPlaceholder') : t('markdownLinkPlaceholder')
            }
            aria-label={
              mode === 'text' ? t('markdownLinkTextPlaceholder') : t('markdownLinkPlaceholder')
            }
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                confirm()
              }
            }}
          />
          <button
            type="button"
            className={styles.linkConfirm}
            aria-label={t('markdownLinkConfirm')}
            disabled={!draft.trim()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={confirm}
          >
            <IconCheckOutline16 />
          </button>
        </>
      )}
    </div>,
    document.body
  )
}
