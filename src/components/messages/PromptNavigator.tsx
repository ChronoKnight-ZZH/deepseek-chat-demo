import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile, useIsWide } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import type { MessageVersions } from '../../services/chat/branches.js'
import type { UserMessage } from '../../services/chat/types.js'
import styles from './PromptNavigator.module.css'

/** 单行最多显示的字数，超出用省略号 */
const MAX_LABEL_LENGTH = 13
/** 悬停提示与面板/视口的间距 */
const TIP_GAP = 12
const TIP_MARGIN = 12
/** 鼠标停在标签上多久后显示完整提示词 */
const TIP_DELAY = 1000
const ENTER_DELAY = 60
const LEAVE_DELAY = 180
/** 以视口上方这一比例处作为“当前阅读位置”，用于判断当前提示词 */
const READING_LINE = 0.12

type TooltipState = {
  text: string
  /** 提示框右边缘的锚点，宽度自适应后向左展开 */
  anchorLeft: number
  /** 悬停行的顶部，实际高度量出后再校正到视口内 */
  anchorTop: number
}

/** 提示词正文：没有文字时退回到附件文件名，与用户消息的展示保持一致 */
const getPromptText = (message: UserMessage) => {
  const text = message.content.replace(/\s+/g, ' ').trim()
  if (text) {
    return text
  }
  return message.files.map((file) => file.name).join('、')
}

const truncate = (text: string) => {
  const chars = Array.from(text)
  return chars.length > MAX_LABEL_LENGTH ? `${chars.slice(0, MAX_LABEL_LENGTH).join('')}…` : text
}

const isOverflowing = (text: string) => Array.from(text).length > MAX_LABEL_LENGTH

/**
 * 会话内右侧居中的提示词快速跳转：收起时只保留每行末尾的短横线，
 * 悬停展开为宽度自适应的列表（最宽 300），高度随提示词数量自适应、最多显示 6 行；
 * 当前提示词为蓝色，悬停项加粗，有分支的提示词在前方显示「2/3」标签，
 * 过长内容悬停显示完整提示词。
 */
export const PromptNavigator = ({
  prompts,
  versions,
  scrollRef,
  onJump,
}: {
  prompts: UserMessage[]
  versions: ReadonlyMap<string, MessageVersions>
  /** 消息滚动容器；用于计算当前阅读位置并跳转 */
  scrollRef: RefObject<HTMLDivElement>
  onJump: (messageId: string) => void
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const isWide = useIsWide()
  const panelRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const activeRowRef = useRef<HTMLButtonElement>(null)
  const promptsRef = useRef(prompts)
  promptsRef.current = prompts
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tip, setTip] = useState<TooltipState | null>(null)
  const [tipTop, setTipTop] = useState(0)
  const tipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const tipTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const ids = prompts.map((message) => message.id).join('\u0001')

  useEffect(
    () => () => {
      clearTimeout(timerRef.current)
      clearTimeout(tipTimerRef.current)
    },
    []
  )

  // 提示词只有超过最大高度才滚动；量出实际高度后把提示框校正到视口内。
  useLayoutEffect(() => {
    const el = tipRef.current
    if (!tip || !el) {
      return
    }
    const top = Math.min(
      Math.max(TIP_MARGIN, tip.anchorTop),
      window.innerHeight - el.offsetHeight - TIP_MARGIN
    )
    setTipTop(Math.max(TIP_MARGIN, top))
  }, [tip])

  // 当前阅读位置：滚动时取阅读线之上最后一条提示词，靠近底部时取最后一条。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const nodes = promptsRef.current
      .map((message) => ({
        id: message.id,
        node: el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(message.id)}"]`),
      }))
      .filter((item): item is { id: string; node: HTMLElement } => item.node !== null)
    if (nodes.length === 0) {
      return
    }
    let frame = 0
    const measure = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      const line = rect.top + rect.height * READING_LINE
      let current = nodes[0].id
      for (const item of nodes) {
        if (item.node.getBoundingClientRect().top <= line) {
          current = item.id
        } else {
          break
        }
      }
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 8) {
        current = nodes[nodes.length - 1].id
      }
      setActiveId(current)
    }
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(measure)
      }
    }
    measure()
    el.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(el)
    const content = el.firstElementChild
    if (content) {
      observer?.observe(content)
    }
    return () => {
      el.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
      if (frame) {
        cancelAnimationFrame(frame)
      }
    }
  }, [ids, scrollRef])

  // 展开时只把当前提示词滚到列表中间一次，之后点击其它项不再调整滚动位置。
  useEffect(() => {
    const list = listRef.current
    const row = activeRowRef.current
    if (!open || !list || !row) {
      return
    }
    list.scrollTop = Math.max(0, row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2)
  }, [open])

  // 收起时只在超出可视区域时滚到对应短横线。
  useEffect(() => {
    const list = listRef.current
    const row = activeRowRef.current
    if (open || !list || !row) {
      return
    }
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < list.scrollTop) {
      list.scrollTop = Math.max(0, top - 6)
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight + 6
    }
  }, [open, activeId])

  // 提示词滚动时收起完整内容提示。
  useEffect(() => {
    if (!tip) {
      return
    }
    const close = () => {
      clearTimeout(tipTimerRef.current)
      setTip(null)
    }
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [tip])

  const scheduleOpen = (next: boolean) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      () => {
        setOpen(next)
        if (!next) {
          clearTimeout(tipTimerRef.current)
          setTip(null)
        }
      },
      next ? ENTER_DELAY : LEAVE_DELAY
    )
  }

  // 鼠标在标签上停留 1 秒后，才弹出完整提示词。
  const scheduleTip = (text: string, row: HTMLButtonElement) => {
    clearTimeout(tipTimerRef.current)
    setTip(null)
    if (!open || !isOverflowing(text)) {
      return
    }
    tipTimerRef.current = setTimeout(() => {
      if (!row.isConnected) {
        return
      }
      const rect = row.getBoundingClientRect()
      const panel = panelRef.current?.getBoundingClientRect()
      setTip({
        text,
        anchorLeft: (panel?.left ?? rect.left) - TIP_GAP,
        anchorTop: rect.top - 6,
      })
      setTipTop(Math.max(TIP_MARGIN, rect.top - 6))
    }, TIP_DELAY)
  }

  const hideTip = () => {
    clearTimeout(tipTimerRef.current)
    setTip(null)
  }

  if (!isWide || isMobile || prompts.length < 2) {
    return null
  }

  return (
    <div
      className={styles.dock}
      onMouseEnter={() => scheduleOpen(true)}
      onMouseLeave={() => scheduleOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
          hideTip()
        }
      }}
    >
      <nav
        ref={panelRef}
        className={clsx(styles.panel, open && styles.expanded)}
        aria-label={t('promptNavigatorLabel')}
        data-prompt-navigator
      >
        <div ref={listRef} className={styles.list}>
          {prompts.map((message) => {
            const text = getPromptText(message)
            const label = truncate(text)
            const version = versions.get(message.id)
            const branch =
              version && version.ids.length > 1 ? `${version.index + 1}/${version.ids.length}` : ''
            const active = message.id === activeId
            return (
              <button
                key={message.id}
                ref={active ? activeRowRef : undefined}
                type="button"
                className={clsx(styles.row, active && styles.active)}
                aria-current={active ? 'true' : undefined}
                aria-label={branch ? `${branch} ${text}` : text}
                onClick={() => {
                  setActiveId(message.id)
                  onJump(message.id)
                }}
                onMouseEnter={(event) => scheduleTip(text, event.currentTarget)}
                onMouseLeave={hideTip}
              >
                {branch ? <span className={styles.branch}>{branch}</span> : null}
                <span className={styles.label}>{label}</span>
                <span className={styles.dash} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </nav>
      {tip
        ? createPortal(
            <div
              ref={tipRef}
              className={styles.tooltip}
              role="tooltip"
              style={{ left: tip.anchorLeft, top: tipTop }}
            >
              {tip.text}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
