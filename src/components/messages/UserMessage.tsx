import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { IconChevronDownOutline14, IconEditOutline16 } from '../base/icons.js'
import { editMessage, retryUpload } from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { useSettings } from '../../services/settings.js'
import type { UserMessage as UserMessageType } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Tooltip } from '../base/Tooltip.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { FormatToolbar } from '../chatInput/FormatToolbar.js'
import { MarkdownComposer, type ComposerHandle } from '../chatInput/MarkdownComposer.js'
import type { FormatResult } from '../chatInput/markdownFormat.js'
import { useFormatToolbar } from '../chatInput/useFormatToolbar.js'
import { UserMarkdown } from './UserMarkdown.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import { MessageFile } from './MessageFile.js'
import { CopyButton } from './CopyButton.js'
import styles from './UserMessage.module.css'

/** 超过 8 行时折叠；与 .bubbleMarkdown 的行高保持一致 */
const COLLAPSED_LINES = 8
const COLLAPSED_HEIGHT = COLLAPSED_LINES * 24

/** 编辑框不支持粘贴上传，交给浏览器默认处理 */
const ignorePasteFiles = () => {}

/** 消息编辑框：与主输入框一致的 Markdown 渲染与格式工具栏 */
const MessageEditor = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  disabled,
  canSend,
  sendKey,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  disabled: boolean
  canSend: boolean
  sendKey: 'enter' | 'shift-enter' | 'off'
}) => {
  const t = useTranslate()
  const composerRef = useRef<ComposerHandle>(null)
  const { selection, selectionRect, onSelectionChange } = useFormatToolbar(composerRef)

  const getSelection = useCallback(
    () => composerRef.current?.getSelection() ?? { start: 0, end: 0 },
    []
  )
  const applyFormat = useCallback((result: FormatResult) => {
    composerRef.current?.applyEdit(result)
  }, [])

  return (
    <div className={styles.editor}>
      {selection.end > selection.start && selectionRect ? (
        <FormatToolbar
          value={value}
          selection={selection}
          getSelection={getSelection}
          onApply={applyFormat}
          anchor={selectionRect}
          disabled={disabled}
        />
      ) : null}
      <MarkdownComposer
        ref={composerRef}
        value={value}
        onChange={onChange}
        onSelectionChange={onSelectionChange}
        onSubmit={onSubmit}
        sendKey={sendKey}
        onPasteFiles={ignorePasteFiles}
        placeholder=""
        disabled={disabled}
        autoFocus
        ariaLabel={t('editMessage')}
        onEscape={onCancel}
        className={styles.editorComposer}
      />
      <div className={styles.editorActions}>
        <Button size="s" variant="outlined" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button size="s" disabled={!canSend} onClick={onSubmit}>
          {t('send')}
        </Button>
      </div>
    </div>
  )
}

export const UserMessage = memo(function UserMessage({
  sessionId,
  message,
  retryUploadId,
  isFirst,
  isLast,
  busy,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: UserMessageType
  /** 回答因补传附件失败可重试时为该回答 id */
  retryUploadId: string | null
  isFirst: boolean
  isLast: boolean
  busy: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [expanded, setExpanded] = useState(false)
  const [collapsible, setCollapsible] = useState(false)
  const bubbleContentRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const sendKey = useSettings((state) => state.sendKey)
  const canSend = !busy && (draft.trim() !== '' || message.files.length > 0)

  // 内容被编辑或从编辑态返回时重新判断是否需要折叠
  useLayoutEffect(() => {
    if (editing) {
      return
    }
    const content = bubbleContentRef.current
    if (!content) {
      setCollapsible(false)
      return
    }
    const measure = () => setCollapsible(content.offsetHeight > COLLAPSED_HEIGHT)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [editing, message.content])

  // 消息内容变化后回到折叠状态
  useLayoutEffect(() => {
    setExpanded(false)
  }, [message.content])

  const sendEdit = () => {
    if (canSend && ensureApiKey() && editMessage(sessionId, message.id, draft.trim())) {
      stopReadAloud()
      setEditing(false)
    }
  }

  return (
    <div className={clsx(styles.container, isFirst && styles.isFirst)} data-message-id={message.id}>
      {message.files.length > 0 ? (
        <div
          className={clsx(
            styles.files,
            message.files.some((file) => !file.isImage) && styles.filesWithDocuments
          )}
        >
          {message.files.map((file) => (
            <MessageFile
              key={file.id}
              file={file}
              onRetry={retryUploadId ? () => retryUpload(sessionId, retryUploadId) : null}
            />
          ))}
        </div>
      ) : null}
      {editing ? (
        <MessageEditor
          value={draft}
          onChange={setDraft}
          onSubmit={sendEdit}
          onCancel={() => setEditing(false)}
          disabled={busy}
          canSend={canSend}
          // 移动端保留回车换行，避免误触发送
          sendKey={isMobile ? 'off' : sendKey}
        />
      ) : (
        <>
          {message.content ? (
            <div className={styles.bubble}>
              <div
                className={clsx(
                  styles.bubbleContent,
                  collapsible && !expanded && styles.bubbleContentCollapsed
                )}
              >
                <div ref={bubbleContentRef} className={styles.bubbleInner}>
                  <UserMarkdown className={styles.bubbleMarkdown} content={message.content} />
                </div>
              </div>
              {collapsible ? (
                <Tooltip content={expanded ? t('collapseMessage') : t('expandMessage')}>
                  <button
                    type="button"
                    className={styles.expandButton}
                    aria-label={expanded ? t('collapseMessage') : t('expandMessage')}
                    aria-expanded={expanded}
                    onClick={() => setExpanded((value) => !value)}
                  >
                    <span
                      className={clsx(
                        styles.expandIcon,
                        expanded && styles.expandIconExpanded
                      )}
                    >
                      <IconChevronDownOutline14 />
                    </span>
                  </button>
                </Tooltip>
              ) : null}
            </div>
          ) : null}
          <div className={styles.bottom}>
            <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
              {message.content ? <CopyButton text={message.content} /> : null}
              <IconButton
                icon={<IconEditOutline16 />}
                tooltip={t('editMessage')}
                tooltipPlacement="bottom"
                disabled={busy}
                onClick={() => {
                  setDraft(message.content)
                  setEditing(true)
                }}
              />
            </div>
            <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          </div>
        </>
      )}
    </div>
  )
})
