import { create } from 'zustand'

/** 点击搜索结果后的跳转目标；token 用于区分连续两次相同的跳转。 */
export type MessageJumpTarget = {
  sessionId: string
  messageId: string
  token: number
}

type MessageSearchState = {
  open: boolean
  target: MessageJumpTarget | null
}

export const useMessageSearch = create<MessageSearchState>(() => ({
  open: false,
  target: null,
}))

let jumpToken = 0

export const openMessageSearch = () => useMessageSearch.setState({ open: true })

export const closeMessageSearch = () => useMessageSearch.setState({ open: false })

/** 切换会话并记录待滚动到的消息，由消息列表在会话加载完成后执行。 */
export const jumpToMessage = (sessionId: string, messageId: string) => {
  jumpToken += 1
  useMessageSearch.setState({
    open: false,
    target: { sessionId, messageId, token: jumpToken },
  })
}

/** 只清除仍然有效的那次跳转，避免覆盖后来的目标。 */
export const clearMessageJump = (target: MessageJumpTarget) =>
  useMessageSearch.setState((state) =>
    state.target?.token === target.token ? { target: null } : state
  )
