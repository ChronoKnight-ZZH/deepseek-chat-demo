import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import {
  IconChevronDownOutline14,
  IconEditOutline16,
  IconPaperclipOutline16,
} from '../base/icons.js'
import { editMessage, retryUpload } from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { useSettings } from '../../services/settings.js'
import type { UserMessage as UserMessageType } from '../../services/chat/types.js'
import { ACCEPT, MAX_COUNT, MAX_SIZE_MB, useUploads } from '../../services/attachments.js'
import {
  addDraftFiles,
  clearDraft,
  EMPTY_DRAFT,
  prepareDraftMessage,
  removeDraftAttachment,
  retryDraftAttachment,
  useDrafts,
  type PreparedFile,
} from '../../services/chat/drafts.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Tooltip } from '../base/Tooltip.js'
import { showToast } from '../base/toastState.js'
import { DraftAttachments } from '../chatInput/DraftAttachments.js'
import { FormatToolbar } from '../chatInput/FormatToolbar.js'
import { MarkdownComposer, type ComposerHandle } from '../chatInput/MarkdownComposer.js'
import type { FormatResult } from '../chatInput/markdownFormat.js'
import { useFormatToolbar } from '../chatInput/useFormatToolbar.js'
import { UserMarkdown } from './UserMarkdown.js'
import { AgentTaskCard } from './AgentTaskCard.js'
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

/**
 * 消息编辑框：与主输入框一致的 Markdown 渲染、格式工具栏、文件导入与图片粘贴。
 * 新附件按编辑中的消息单独保存，随重新发送一起提交。
 */
const MessageEditor = ({
  sessionId,
  messageId,
  initialValue,
  hasFiles,
  onCancel,
  onSubmit,
  disabled,
  sendKey,
}: {
  sessionId: string
  messageId: string
  initialValue: string
  /** 原消息已有的附件，可配合空文本直接重新发送 */
  hasFiles: boolean
  onCancel: () => void
  onSubmit: (text: string, files: PreparedFile[]) => boolean
  disabled: boolean
  sendKey: 'enter' | 'shift-enter' | 'off'
}) => {
  const t = useTranslate()
  const [value, setValue] = useState(initialValue)
  const composerRef = useRef<ComposerHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { selection, selectionRect, onSelectionChange } = useFormatToolbar(composerRef)
  const draftKey = `edit:${sessionId}:${messageId}`
  const attachments = useDrafts(
    (state) => state.drafts.get(draftKey)?.attachments ?? EMPTY_DRAFT.attachments
  )
  const canSend = !disabled && (value.trim() !== '' || hasFiles || attachments.length > 0)

  const acceptFiles = (files: File[]) => {
    const error = addDraftFiles(draftKey, files)
    if (error) {
      showToast(error)
    }
  }

  const retryFile = (id: string) => {
    retryDraftAttachment(draftKey, id)
  }

  // 取消编辑或提交后释放未发送的附件与上传任务。
  useEffect(() => () => clearDraft(draftKey), [draftKey])

  const getSelection = useCallback(
    () => composerRef.current?.getSelection() ?? { start: 0, end: 0 },
    []
  )
  const applyFormat = useCallback((result: FormatResult) => {
    composerRef.current?.applyEdit(result)
  }, [])

  const submit = () => {
    if (disabled) {
      return
    }
    const text = value.trim()
    const prepared = prepareDraftMessage({ text, attachments }, useUploads.getState().tasks)
    if (prepared) {
      onSubmit(prepared.text, prepared.files)
      return
    }
    // 未改动文字时仍可重新发送原消息及其附件。
    if (attachments.length === 0 && hasFiles) {
      onSubmit('', [])
    }
  }

  return (
    <div className={styles.editor}>
      <DraftAttachments
        items={attachments}
        onRetry={retryFile}
        onRemove={(id) => removeDraftAttachment(draftKey, id)}
      />
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
        onChange={setValue}
        onSelectionChange={onSelectionChange}
        onSubmit={submit}
        sendKey={sendKey}
        onPasteFiles={acceptFiles}
        placeholder=""
        disabled={disabled}
        autoFocus
        ariaLabel={t('editMessage')}
        onEscape={onCancel}
        className={styles.editorComposer}
      />
      <div className={styles.editorActions}>
        <IconButton
          icon={<IconPaperclipOutline16 />}
          tooltip={t('uploadFileTooltip', { count: MAX_COUNT, size: MAX_SIZE_MB })}
          aria-label={t('uploadFile')}
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept={ACCEPT}
          onChange={(event) => {
            acceptFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        <div className={styles.editorButtons}>
          <Button size="s" variant="outlined" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button size="s" disabled={!canSend} onClick={submit}>
            {t('send')}
          </Button>
        </div>
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
  const [expanded, setExpanded] = useState(false)
  const [collapsible, setCollapsible] = useState(false)
  const bubbleContentRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const sendKey = useSettings((state) => state.sendKey)

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

  const sendEdit = (text: string, files: PreparedFile[]) => {
    if (!editMessage(sessionId, message.id, text, files)) {
      return false
    }
    stopReadAloud()
    setEditing(false)
    return true
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
              sessionId={sessionId}
              file={file}
              onRetry={retryUploadId ? () => retryUpload(sessionId, retryUploadId) : null}
            />
          ))}
        </div>
      ) : null}
      {editing ? (
        <MessageEditor
          sessionId={sessionId}
          messageId={message.id}
          initialValue={message.content}
          hasFiles={message.files.length > 0}
          onSubmit={sendEdit}
          onCancel={() => setEditing(false)}
          disabled={busy}
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
                      className={clsx(styles.expandIcon, expanded && styles.expandIconExpanded)}
                    >
                      <IconChevronDownOutline14 />
                    </span>
                  </button>
                </Tooltip>
              ) : null}
            </div>
          ) : null}
          {message.agent ? (
            <AgentTaskCard
              sessionId={sessionId}
              messageId={message.id}
              task={message.agent}
              busy={busy}
            />
          ) : null}
          <div className={styles.bottom}>
            <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
              {message.content ? <CopyButton text={message.content} /> : null}
              <IconButton
                icon={<IconEditOutline16 />}
                tooltip={t('editMessage')}
                tooltipPlacement="bottom"
                disabled={busy}
                onClick={() => setEditing(true)}
              />
            </div>
            <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          </div>
        </>
      )}
    </div>
  )
})
