import clsx from 'clsx'
import { useEffect } from 'react'
import { useTranslate } from '../i18n/index.js'
import { useSettings } from '../services/settings.js'
import { useAuth } from '../services/auth.js'
import { LoginPage } from '../components/login/LoginPage.js'
import { useIsMobile, useMobileViewport, usePreventPageScroll, usePushSider } from './viewport.js'
import {
  bindChatPersistence,
  initChat,
  retrySaveSessions,
  selectSession,
  useChatStore,
} from '../services/chat/store.js'
import { bindSessionUrl } from '../services/chat/route.js'
import { SearchPanel } from '../components/search/SearchPanel.js'
import { closeSearchPanel } from '../components/search/searchPanelState.js'
import { HtmlPreviewPanel } from '../components/htmlPreview/HtmlPreviewPanel.js'
import { closeHtmlPreview } from '../components/htmlPreview/htmlPreviewState.js'
import { SessionView } from '../components/session/SessionView.js'
import { MobileHeader } from '../components/session/MobileHeader.js'
import { Welcome } from '../components/session/Welcome.js'
import { SettingsDialog } from '../components/settings/SettingsDialog.js'
import { ImageViewer } from '../components/base/ImageViewer.js'
import { MermaidLogDialog } from '../components/markdown/MermaidLogDialog.js'
import { Toast } from '../components/base/Toast.js'
import { showToast } from '../components/base/toastState.js'
import { onUploadNotice } from '../services/attachments.js'
import { Button } from '../components/base/Button.js'
import { stopReadAloud } from '../services/speech/readAloud.js'
import { CollapsedSider } from '../components/sider/CollapsedSider.js'
import { closeMobileSider, useMobileSider } from '../components/sider/mobileSiderState.js'
import { DesktopSider, MobileSider, PushSider } from '../components/sider/Sider.js'
import { MessageSearch } from '../components/messageSearch/MessageSearch.js'
import { openMessageSearch } from '../components/messageSearch/messageSearchState.js'
import styles from './App.module.css'

export const App = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const pushSider = usePushSider()
  const locale = useSettings((state) => state.locale)
  const authStatus = useAuth((state) => state.status)
  const loggedIn = authStatus === 'authenticated'
  // 移动端侧边栏以独立抽屉管理开合状态
  const siderSettingCollapsed = useSettings((state) => state.siderCollapsed)
  const siderCollapsed = siderSettingCollapsed && !isMobile
  const mobileSiderOpen = useMobileSider((state) => state.open)
  const ready = useChatStore((state) => state.ready)
  const initError = useChatStore((state) => state.initError)
  const saveError = useChatStore((state) => Object.values(state.sessionSaveErrors).some(Boolean))
  const importingHistory = useChatStore((state) => state.importingHistory)
  const session = useChatStore((state) =>
    state.activeId !== null && Object.hasOwn(state.sessionCache, state.activeId)
      ? state.sessionCache[state.activeId]
      : undefined
  )
  const sessionLoadError = useChatStore((state) =>
    state.activeId === null ? false : state.sessionLoadErrors[state.activeId] === true
  )
  const frameRef = useMobileViewport(isMobile)
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : Object.hasOwn(state.streaming, state.activeId)
  )
  const activeId = useChatStore((state) => state.activeId)
  const activeTitle = useChatStore((state) =>
    state.activeId === null
      ? undefined
      : state.sessions.find((item) => item.id === state.activeId)?.title
  )

  usePreventPageScroll(isMobile)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // 标签页标题跟随当前会话名称，自动生成与重命名都会同步更新；未登录时显示登录页标题
  useEffect(() => {
    document.title = loggedIn
      ? activeId === null
        ? t('appName')
        : activeTitle || t('untitledChat')
      : `${t('loginTitle')} · ${t('appName')}`
  }, [activeId, activeTitle, loggedIn, t])

  // 文件数、存储空间达到上限时，附件上只显示「上传失败」，原因用 toast 说明
  useEffect(() => onUploadNotice(showToast), [])
  useEffect(bindChatPersistence, [])
  // 会话 id 与会话地址（/chat/<id>）双向同步
  useEffect(bindSessionUrl, [])

  // Ctrl/Cmd + K 打开对话全文搜索
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openMessageSearch()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // 搜索结果面板只属于当前会话
  useEffect(closeSearchPanel, [activeId])
  // HTML 预览也跟随所属会话
  useEffect(closeHtmlPreview, [activeId])
  // 左侧边栏展开时收起右侧预览，两者互斥
  useEffect(() => {
    if (isMobile ? mobileSiderOpen : !siderSettingCollapsed) {
      closeHtmlPreview()
    }
  }, [isMobile, mobileSiderOpen, siderSettingCollapsed])
  // 切换会话时停止朗读
  useEffect(stopReadAloud, [activeId])
  // 移动端选中会话、切换布局后收起抽屉
  useEffect(closeMobileSider, [activeId, isMobile])

  useEffect(() => {
    if (!loggedIn) {
      return
    }
    void initChat(true)
  }, [loggedIn])

  if (!loggedIn) {
    return (
      <>
        <LoginPage />
        <Toast />
      </>
    )
  }

  return (
    <>
      <div ref={frameRef} className={styles.frame}>
        {isMobile ? (
          pushSider ? (
            <PushSider />
          ) : (
            <MobileSider />
          )
        ) : (
          <DesktopSider collapsed={siderCollapsed} />
        )}
        <main
          className={clsx(
            styles.main,
            isMobile && pushSider && styles.pushLayout,
            isMobile && pushSider && mobileSiderOpen && styles.pushed
          )}
        >
          {saveError ? (
            <div className={styles.saveError} role="alert">
              <span>{t('sessionSaveFailed')}</span>
              <Button
                variant="outlined"
                size="s"
                disabled={importingHistory}
                onClick={retrySaveSessions}
              >
                {t('retry')}
              </Button>
            </div>
          ) : null}
          <div className={styles.content}>
            {siderCollapsed ? <CollapsedSider /> : null}
            {!ready || (activeId !== null && !session) ? (
              <div className={styles.loadingView}>
                {isMobile ? <MobileHeader /> : null}
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <span>
                    {(!ready ? initError : sessionLoadError)
                      ? t(!ready ? 'sessionListLoadFailed' : 'sessionLoadFailed')
                      : t('sessionLoading')}
                  </span>
                  {(!ready ? initError : sessionLoadError) ? (
                    <Button
                      variant="outlined"
                      size="m"
                      onClick={() => {
                        if (!ready) {
                          void initChat()
                        } else if (activeId !== null) {
                          selectSession(activeId)
                        }
                      }}
                    >
                      {t('retry')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : session ? (
              <SessionView
                session={session}
                streaming={streaming}
                siderCollapsed={siderCollapsed}
              />
            ) : (
              <Welcome />
            )}
          </div>
        </main>
        <SearchPanel />
        <HtmlPreviewPanel />
      </div>
      <SettingsDialog />
      <MessageSearch />
      <MermaidLogDialog />
      <ImageViewer />
      <Toast />
    </>
  )
}
