import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconPanelLeftOutline16,
  IconSearchOutline16,
  IconSettingsOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import { newChat, removeSession, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { Tooltip } from '../base/Tooltip.js'
import { showToast } from '../base/toastState.js'
import { usePresence } from '../base/usePresence.js'
import { openMessageSearch } from '../messageSearch/messageSearchState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
import styles from './Sider.module.css'

/** Push 模式下侧边栏与主内容的联动动画时长，与 demo 的 0.3s 保持一致 */
const PUSH_DURATION = 300

/** 展开的侧边栏：名称与收起按钮、开启新对话、按时间分组的会话列表、底部设置；移动端放在抽屉里，收起按钮关闭抽屉 */
export const Sider = ({
  mobile = false,
  push = false,
  exiting = false,
}: {
  mobile?: boolean
  push?: boolean
  exiting?: boolean
}) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const [now, setNow] = useState(Date.now)
  const groups = useMemo(() => groupSessions(sessions, now, t), [sessions, now, t])
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile, push && styles.push, exiting && styles.exiting)}>
      <div className={styles.top}>
        <div className={styles.appName}>{t('appName')}</div>
        <div className={styles.topActions}>
          <Tooltip content={`${t('searchConversation')} Ctrl K`} placement="bottom">
            <IconButton
              size="m"
              icon={<IconSearchOutline16 />}
              aria-label={t('searchConversation')}
              onClick={openMessageSearch}
            />
          </Tooltip>
          <IconButton
            size="m"
            icon={<IconPanelLeftOutline16 />}
            tooltip={t('collapseSiderbarButton')}
            tooltipPlacement="bottom"
            onClick={() => (mobile || push ? closeMobileSider() : setSiderCollapsed(true))}
          />
        </div>
      </div>
      <button
        type="button"
        className={styles.newChat}
        onClick={() => {
          newChat()
          closeMobileSider()
        }}
      >
        <span className={styles.newChatIcon}>
          <NewChatIcon />
        </span>
        {t('newChat')}
      </button>
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {groups.map((group) => (
            <div key={group.key} className={styles.section}>
              <div className={styles.sectionHeader}>{group.label}</div>
              {group.sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeId}
                  onDelete={() => setDeleting(session)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
          <span className={styles.settingsIcon}>
            <IconSettingsOutline16 />
          </span>
          <span className={styles.settingsLabel}>{t('settings')}</span>
        </button>
      </div>
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
    </div>
  )
}

/** 桌面端侧边栏：收起后保留一段时间播放退场动画 */
export const DesktopSider = ({ collapsed }: { collapsed: boolean }) => {
  const { mounted, exiting } = usePresence(!collapsed)
  if (!mounted) {
    return null
  }
  return <Sider exiting={exiting} />
}

/** 移动端抽屉：浮在页面上方，点空白区域关闭。 */
export const MobileSider = () => {
  const open = useMobileSider((state) => state.open)
  const { mounted, exiting } = usePresence(open)
  if (!mounted) {
    return null
  }
  return (
    <>
      <div
        className={clsx(styles.drawerMask, exiting && styles.drawerMaskExiting)}
        onClick={closeMobileSider}
      />
      <div className={clsx(styles.drawer, exiting && styles.drawerExiting)}>
        <Sider mobile />
      </div>
    </>
  )
}

/** 宽度大于 610px 时侧边栏推开主内容：侧边栏滑入的同时主内容同步右移，不遮挡页面。 */
export const PushSider = () => {
  const open = useMobileSider((state) => state.open)
  const { mounted, exiting } = usePresence(open, PUSH_DURATION)
  if (!mounted) {
    return null
  }
  return (
    <div className={clsx(styles.pushSider, exiting && styles.pushSiderExiting)}>
      <Sider push />
    </div>
  )
}
