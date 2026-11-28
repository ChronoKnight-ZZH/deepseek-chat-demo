import clsx from 'clsx'
import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { cancelAgentMessage } from '../../services/chat/store.js'
import { describeAgentError } from '../../services/agent/state.js'
import type { AgentTask } from '../../services/api/agent.js'
import { formatSize } from '../../services/attachments.js'
import {
  IconCheckOutline16,
  IconCloseOutline16,
  IconDownloadOutline16,
  IconWarningOutline16,
} from '../base/icons.js'
import { Markdown } from '../markdown/Markdown.js'
import styles from './AgentTaskCard.module.css'

/** 进行中状态集合：决定转圈图标与「停止任务」按钮 */
const ACTIVE_STATUSES: AgentTask['status'][] = ['queued', 'running', 'waiting_model']

const isActive = (status: AgentTask['status']): boolean => ACTIVE_STATUSES.includes(status)

/**
 * Agent 任务卡片：挂在带 agent 快照的用户消息下方。
 * 数据全部来自消息里的快照（轮询写回），组件本身不发请求；
 * 只有「停止任务」会触发一次 cancel API。
 */
export const AgentTaskCard = ({
  sessionId,
  messageId,
  task,
  busy,
}: {
  sessionId: string
  messageId: string
  task: AgentTask
  busy: boolean
}) => {
  const t = useTranslate()
  const [cancelling, setCancelling] = useState(false)
  const active = isActive(task.status)

  const statusText =
    {
      queued: t('agentStatusQueued'),
      running: t('agentStatusRunning'),
      waiting_model: t('agentStatusWaitingModel'),
      completed: t('agentStatusCompleted'),
      failed: t('agentStatusFailed'),
      cancelled: t('agentStatusCancelled'),
      timed_out: t('agentStatusTimedOut'),
    }[task.status] ?? task.status

  const cancelTask = async () => {
    setCancelling(true)
    try {
      await cancelAgentMessage(sessionId, messageId)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className={clsx(styles.card, !active && styles.settled)} data-status={task.status}>
      <div className={styles.header}>
        <span className={clsx(styles.statusIcon, active && styles.spinning)} aria-hidden="true">
          {active ? (
            <span className={styles.spinner} />
          ) : task.status === 'completed' ? (
            <IconCheckOutline16 />
          ) : task.status === 'cancelled' ? (
            <IconCloseOutline16 />
          ) : (
            <IconWarningOutline16 />
          )}
        </span>
        <span className={styles.statusText}>{statusText}</span>
        {active && task.currentStep ? (
          <span className={styles.step}>{task.currentStep}</span>
        ) : null}
        {task.progress.completedSteps > 0 ? (
          <span className={styles.progress}>
            {t('agentTaskSteps', { count: task.progress.completedSteps })}
          </span>
        ) : null}
        {active ? (
          <button
            type="button"
            className={styles.cancelButton}
            disabled={busy || cancelling}
            onClick={() => void cancelTask()}
          >
            {t('agentTaskCancel')}
          </button>
        ) : null}
      </div>

      {task.error ? (
        <div className={styles.error}>{describeAgentError(task.error.code)}</div>
      ) : null}

      {task.result?.text ? (
        <div className={styles.result}>
          <Markdown
            content={task.result.text}
            loading={false}
            cacheKey={`${messageId}:agent-result`}
            disableLink={false}
          />
        </div>
      ) : null}

      {task.files.length > 0 ? (
        <div className={styles.files}>
          <div className={styles.filesTitle}>{t('agentTaskFiles')}</div>
          <ul className={styles.fileList}>
            {task.files.map((file) => (
              <li key={file.id} className={styles.fileItem}>
                <span className={styles.fileName} title={file.fileName}>
                  {file.fileName}
                </span>
                <span className={styles.fileSize}>{formatSize(file.fileSize)}</span>
                {file.downloadUrl ? (
                  <a
                    className={styles.fileDownload}
                    href={file.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <IconDownloadOutline16 />
                    <span>{t('agentTaskDownload')}</span>
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
