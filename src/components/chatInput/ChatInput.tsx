import clsx from 'clsx'
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import {
  IconPaperclipOutline16,
  IconDataOutline16,
  IconSendOutline16,
  IconStopFill16,
} from '../base/icons.js'
import { setSearch, useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import {
  sendAgentMessage,
  sendMessage,
  stopReply,
  useChatStore,
} from '../../services/chat/store.js'
import {
  refreshAgentAvailability,
  setAgentMode,
  useAgentStore,
} from '../../services/agent/state.js'
import {
  addDraftFiles,
  EMPTY_DRAFT,
  getDraft,
  prepareDraftMessage,
  removeDraftAttachment,
  retryDraftAttachment,
  setDraftText,
  useDrafts,
} from '../../services/chat/drafts.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { Tooltip } from '../base/Tooltip.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { showToast } from '../base/toastState.js'
import { ACCEPT, MAX_COUNT, MAX_SIZE_MB, useUploads } from '../../services/attachments.js'
import { DraftAttachments } from './DraftAttachments.js'
import { FormatToolbar } from './FormatToolbar.js'
import { MarkdownComposer, type ComposerHandle } from './MarkdownComposer.js'
import type { FormatResult } from './markdownFormat.js'
import { useFormatToolbar } from './useFormatToolbar.js'
import { useVoiceInput } from './useVoiceInput.js'
import { VoiceButton } from './VoiceButton.js'
import { Spectrum } from './Spectrum.js'
import { useTranslate } from '../../i18n/index.js'
import { ModelSelect } from './ModelSelect.js'
import { SearchToggleIcon, useToggleAnimation } from './ToggleIcons.js'
import { ThinkingSwitch } from './ThinkingSwitch.js'
import styles from './ChatInput.module.css'

/** 输入框：自适应高度的文本框 + 文件 + 深度思考与智能搜索开关 + 语音输入 + 发送 / 停止 */
export const ChatInput = memo(function ChatInput({ sessionId }: { sessionId: string | null }) {
  // 切换目标时释放录音、转写和 DOM 状态；文字与附件由草稿服务保留。
  return <Input key={sessionId === null ? 'new' : `session:${sessionId}`} sessionId={sessionId} />
})

const Input = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const draft = useDrafts((state) => state.drafts.get(sessionId) ?? EMPTY_DRAFT)
  const { text, attachments } = draft
  const setText = (value: string) => setDraftText(sessionId, value)
  const draftReady = useUploads((state) => prepareDraftMessage(draft, state.tasks) !== null)
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const search = useSettings((state) => state.search)
  const model = useSettings((state) => state.model)
  const sendKey = useSettings((state) => state.sendKey)
  // Agent 模式：入口只在后端灰度开启时显示；偏好存本机 localStorage
  const agentMode = useAgentStore((state) => state.mode)
  const agentOn = agentMode === 'agent'
  const agentAvailable = useAgentStore((state) => state.availability?.enabled === true)
  useEffect(() => {
    void refreshAgentAvailability()
  }, [])
  // 动画由真实开关状态驱动：开启正向、关闭反向，避免点击与状态不同步。
  const searchRun = useToggleAnimation(search)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<ComposerHandle>(null)
  const togglesRef = useRef<HTMLDivElement>(null)
  const { selection, selectionRect, onSelectionChange } = useFormatToolbar(composerRef)

  useLayoutEffect(() => {
    const toggles = togglesRef.current
    if (!toggles) {
      return
    }

    const updateLabels = () => {
      toggles.classList.remove(styles.collapsedToggles)
      toggles.classList.toggle(styles.collapsedToggles, toggles.scrollWidth > toggles.clientWidth)
    }

    updateLabels()
    const observer = new ResizeObserver(updateLabels)
    observer.observe(toggles)
    return () => observer.disconnect()
    // 模型名长度变化不改变容器宽度，需要随模型重新判断是否收起文字
  }, [t, model])

  // 粘贴、导入和拖入文件后立即开始上传
  const acceptFiles = (files: File[]) => {
    if (files.length === 0 || useChatStore.getState().importingHistory) {
      return
    }
    const error = addDraftFiles(sessionId, files)
    if (error) {
      showToast(error)
    }
  }
  const retryFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        retryDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  const removeFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        removeDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  const dragging = useFileDrop(acceptFiles)

  /** 转写结果插入到光标处，并把光标移到插入内容之后 */
  const voice = useVoiceInput((transcript) => {
    composerRef.current?.insertText(transcript)
  })

  // 欢迎页导入后会话 ID 不变，不能依赖卸载取消语音；订阅开始事件也覆盖快速完成的导入。
  const cancelVoice = voice.cancel
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        if (state.importingHistory && !previous.importingHistory) {
          cancelVoice()
        }
      }),
    [cancelVoice]
  )

  // 移动端录音时用频谱替代输入框内容
  const recording = voice.status === 'recording'

  // 排队、上传中或上传失败的附件都留在输入框，全部上传成功后才能发送
  // Agent 模式不占用 SSE 流，正在流式生成回答时也可以提交任务
  const canSend =
    !importingHistory && (agentOn || !streaming) && voice.status === 'idle' && draftReady

  const focusAfterSend = () => {
    stopReadAloud()
    if (isMobile) {
      composerRef.current?.blur()
    } else {
      composerRef.current?.focus()
    }
  }

  const send = () => {
    if (useChatStore.getState().importingHistory || voice.status !== 'idle') {
      return
    }
    const draft = getDraft(sessionId)
    if (!draft.text.trim() && draft.attachments.length === 0) {
      return
    }
    if (!prepareDraftMessage(draft, useUploads.getState().tasks)) {
      return
    }
    if (agentOn) {
      // 异步创建任务：成功才清草稿；失败保留原样可直接重试
      void sendAgentMessage(sessionId).then((ok) => {
        if (ok) {
          focusAfterSend()
        } else {
          showToast({ key: 'agentSubmitFailed' })
        }
      })
      return
    }
    // 文本与上传完成态由提交动作读取最新快照，不使用上一次渲染的草稿。
    if (!sendMessage(sessionId)) {
      return
    }
    focusAfterSend()
  }

  const getComposerSelection = useCallback(
    () => composerRef.current?.getSelection() ?? { start: 0, end: 0 },
    []
  )

  const applyComposerFormat = useCallback((result: FormatResult) => {
    composerRef.current?.applyEdit(result)
  }, [])

  return (
    <div
      className={clsx(styles.wrapper, sessionId === null ? styles.home : styles.session)}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          composerRef.current?.focus()
        }
      }}
    >
      <DraftAttachments items={attachments} onRetry={retryFile} onRemove={removeFile} />
      {/* 格式工具栏：仅在选中输入框内文本时浮在选区附近 */}
      {selection.end > selection.start && selectionRect ? (
        <FormatToolbar
          value={text}
          selection={selection}
          getSelection={getComposerSelection}
          onApply={applyComposerFormat}
          anchor={selectionRect}
          disabled={importingHistory || voice.status !== 'idle'}
        />
      ) : null}
      {/* 输入框 */}
      <div className={styles.composerWrapper}>
        <MarkdownComposer
          ref={composerRef}
          value={text}
          onChange={setText}
          onSelectionChange={onSelectionChange}
          onSubmit={send}
          sendKey={sendKey}
          onPasteFiles={acceptFiles}
          placeholder={t(agentOn ? 'chatInputPlaceholderAgent' : 'chatInputPlaceholderChat')}
          disabled={importingHistory}
          // 移动端不自动聚焦，避免一打开就弹出键盘
          autoFocus={!isMobile}
          className={clsx(recording && isMobile && styles.composerHidden)}
        />
        {recording && isMobile ? <Spectrum getAnalyser={voice.getAnalyser} /> : null}
      </div>
      <div className={styles.functionRow}>
        {/* 模型选择 + 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
        <div ref={togglesRef} className={styles.toggles}>
          {/* Agent 模式下模型/思考/搜索开关无效，只保留任务入口 */}
          {agentOn ? null : (
            <>
              <ModelSelect />
              <ThinkingSwitch />
              <Tooltip content={t('deactivatedSearchTooltip')}>
                <button
                  type="button"
                  className={clsx(styles.toggle, search && styles.selected)}
                  aria-label={t('search')}
                  aria-pressed={search}
                  onClick={() => setSearch(!search)}
                >
                  <SearchToggleIcon run={searchRun} />
                  <span className={styles.toggleLabel}>{t('search')}</span>
                </button>
              </Tooltip>
            </>
          )}
          {agentAvailable ? (
            <Tooltip content={t('agentModeTooltip')}>
              <button
                type="button"
                className={clsx(styles.toggle, agentOn && styles.selected)}
                aria-label={t('agentMode')}
                aria-pressed={agentOn}
                onClick={() => setAgentMode(agentOn ? 'chat' : 'agent')}
              >
                <IconDataOutline16 />
                <span className={styles.toggleLabel}>{t('agentMode')}</span>
              </button>
            </Tooltip>
          ) : null}
        </div>
        <div className={styles.right}>
          <VoiceButton
            status={voice.status}
            disabled={!voice.available}
            seconds={voice.seconds}
            onClick={() => {
              if (voice.status !== 'idle' || !useChatStore.getState().importingHistory) {
                void voice.toggle()
              }
            }}
          />
          <IconButton
            size="m"
            tone="primary"
            icon={<IconPaperclipOutline16 />}
            tooltip={t('uploadFileTooltip', { count: MAX_COUNT, size: MAX_SIZE_MB })}
            aria-label={t('uploadFile')}
            disabled={importingHistory}
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
          {streaming && sessionId ? (
            <button
              type="button"
              className={styles.sendButton}
              aria-label={t('chatInputStopButtonTooltip')}
              onClick={() => {
                stopReadAloud()
                stopReply(sessionId)
              }}
            >
              <IconStopFill16 />
            </button>
          ) : (
            <button
              type="button"
              className={clsx(styles.sendButton, !canSend && styles.disabled)}
              aria-label={t('send')}
              aria-disabled={!canSend}
              onClick={send}
            >
              <IconSendOutline16 />
            </button>
          )}
        </div>
      </div>
      {dragging ? <DragMask /> : null}
    </div>
  )
}
