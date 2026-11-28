import clsx from 'clsx'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { renameSession } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MessageList } from '../messages/MessageList.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './SessionView.module.css'
import { useRef, useState } from 'react'

/** 会话页：标题栏（移动端为顶栏）+ 消息列表，输入框吸底 */
export const SessionView = ({
  session,
  streaming,
  siderCollapsed,
}: {
  session: Session
  streaming: boolean
  siderCollapsed: boolean
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const defaultTitle = t('untitledChat')
  const title = session.title || defaultTitle
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const finishEdit = (nextTitle: string) => {
    setEditing(false)
    const trimmed = nextTitle.trim()
    if (trimmed && trimmed !== title) {
      renameSession(session.id, trimmed)
    }
  }

  return (
    <div className={styles.view}>
      {isMobile ? (
        <MobileHeader title={title} />
      ) : (
        <div className={styles.header}>
          {editing ? (
            <input
              ref={inputRef}
              className={clsx(
                styles.title,
                styles.titleEditing,
                siderCollapsed && styles.withCollapsedSider
              )}
              defaultValue={title}
              autoFocus
              onFocus={(event) => {
                // 进入编辑时把光标放到末尾：既不整体选中，也避免浏览器把光标定位到开头
                const { value } = event.target
                event.target.setSelectionRange(value.length, value.length)
              }}
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => finishEdit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  finishEdit(event.currentTarget.value)
                } else if (event.key === 'Escape') {
                  setEditing(false)
                }
              }}
            />
          ) : (
            <div
              className={clsx(styles.title, siderCollapsed && styles.withCollapsedSider)}
              onClick={() => setEditing(true)}
            >
              {title}
            </div>
          )}
        </div>
      )}
      <MessageList
        session={session}
        streaming={streaming}
        footer={
          <div className={styles.inputContainer}>
            <ChatInput sessionId={session.id} />
            <div className={styles.caveat}>{t('contentCaveat')}</div>
          </div>
        }
      />
    </div>
  )
}
