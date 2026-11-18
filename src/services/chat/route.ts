import { newChat, selectSession, useChatStore } from './store.js'

/** 会话路由段，需与 index.html 内联脚本里的判断保持一致。 */
const SESSION_SEGMENT = 'chat'

/** 地址解析结果；unknown 表示认不出的路径，需要回收到欢迎页。 */
type SessionRoute = { kind: 'home' } | { kind: 'session'; id: string } | { kind: 'unknown' }

/**
 * 本地直接打开 index.html 时地址栏不可写（history.replaceState 会抛 SecurityError），
 * 也没有可分享的会话地址，此时不接管路由。
 */
const routable = (): boolean => location.protocol !== 'file:'

/**
 * 应用根目录，以 / 结尾。站点可能部署在子目录，会话深链接下相对路径会被拼到会话段之后，
 * 所以 index.html 的内联脚本会按当前地址推算根目录并写入 `<base href>`，这里直接沿用它。
 */
const getAppRoot = (): string => {
  const base = document.querySelector('base')
  // 没有 base 元素说明内联脚本没有执行，此时静态资源本身也无法加载，按站点根目录兜底。
  const pathname = base === null ? '/' : new URL(base.href).pathname
  return pathname.endsWith('/') ? pathname : `${pathname}/`
}

/** 地址段是否以会话路由段开头，形如 `<根目录>chat/<id>` */
const isSessionPath = (segments: string[]) =>
  segments.length === 2 && segments[0] === SESSION_SEGMENT

/** 会话地址：`<根目录>chat/<id>`，用作会话链接的 href */
export const getSessionUrl = (id: string): string =>
  `${getAppRoot()}${SESSION_SEGMENT}/${encodeURIComponent(id)}`

/** 解析当前地址：欢迎页、某个会话，或认不出的路径。 */
const readSessionRoute = (): SessionRoute => {
  if (!routable()) {
    return { kind: 'home' }
  }
  const root = getAppRoot()
  const { pathname } = location
  if (!pathname.startsWith(root)) {
    return { kind: 'unknown' }
  }
  const segments = pathname.slice(root.length).split('/').filter(Boolean)
  if (segments.length === 0) {
    return { kind: 'home' }
  }
  if (!isSessionPath(segments)) {
    return { kind: 'unknown' }
  }
  const id = segments[1]
  try {
    return { kind: 'session', id: decodeURIComponent(id) }
  } catch {
    // 非法的 % 转义
    return { kind: 'unknown' }
  }
}

/** 用 replaceState 切到指定会话，null 表示欢迎页；地址没变时不做历史操作。 */
const replaceSessionUrl = (id: string | null) => {
  if (!routable()) {
    return
  }
  const target = id === null ? getAppRoot() : getSessionUrl(id)
  if (target === location.pathname) {
    return
  }
  try {
    history.replaceState(history.state, '', target)
  } catch {
    // 沙箱 iframe 等受限环境拒绝写入地址栏，界面照常工作
  }
}

/**
 * 让当前会话与地址栏双向同步：切换会话时把 id 写进地址栏；地址栏里的 id 在会话列表就绪后还原。
 * 会话已删除或路径认不出时回收到欢迎页；列表读取失败时保留原地址，等重试成功后按原地址再还原。
 * 返回取消绑定的函数。
 */
export const bindSessionUrl = (): (() => void) => {
  if (!routable()) {
    return () => {}
  }
  /** 已同步到地址栏的会话；null 是欢迎页，undefined 表示尚未同步 */
  let synced: string | null | undefined
  /** 正在按地址栏还原会话，期间不改写地址，避免把深链接冲掉 */
  let restoring = false

  /** 地址栏 → 会话；列表没就绪时留给 ready 变化后再执行 */
  const readUrl = () => {
    const state = useChatStore.getState()
    if (!state.ready) {
      return
    }
    restoring = true
    try {
      const route = readSessionRoute()
      if (route.kind === 'session' && state.sessions.some((session) => session.id === route.id)) {
        // 详情由 selectSession 异步读取，期间界面显示加载状态
        selectSession(route.id)
      } else {
        // 欢迎页、已删除或不属于本机的会话、认不出的路径都回到新对话
        if (state.activeId !== null) {
          newChat()
        }
        if (route.kind !== 'home') {
          replaceSessionUrl(null)
        }
      }
    } finally {
      restoring = false
    }
    synced = useChatStore.getState().activeId
  }

  /** 会话 → 地址栏 */
  const syncUrl = () => {
    const { activeId, ready } = useChatStore.getState()
    // 列表就绪前不改写地址：读取失败时深链接要留给用户重试
    if (ready && synced !== activeId) {
      replaceSessionUrl(activeId)
      synced = activeId
    }
  }

  const unsubscribe = useChatStore.subscribe((state, previous) => {
    if (state.ready !== previous.ready) {
      // 首次加载完成，或读取失败后重试成功
      readUrl()
    } else if (!restoring) {
      syncUrl()
    }
  })
  const onPopState = () => readUrl()
  window.addEventListener('popstate', onPopState)
  // 绑定可能晚于列表加载完成，先按当前地址还原一次
  readUrl()
  return () => {
    unsubscribe()
    window.removeEventListener('popstate', onPopState)
  }
}
