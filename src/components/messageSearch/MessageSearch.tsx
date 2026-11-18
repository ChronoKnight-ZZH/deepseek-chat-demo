import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { searchMessages, type MessageSearchHit } from '../../services/chat/searchMessages.js'
import { selectSession } from '../../services/chat/store.js'
import { useSettings } from '../../services/settings.js'
import { IconButton } from '../base/IconButton.js'
import { IconChatOutline20, IconCloseOutline16, IconSearchOutline16 } from '../base/icons.js'
import { closeMessageSearch, jumpToMessage, useMessageSearch } from './messageSearchState.js'
import styles from './MessageSearch.module.css'

type SearchStatus = 'idle' | 'loading' | 'error'

/** 输入停顿后再检索，避免每个字符都扫描本地会话 */
const SEARCH_DEBOUNCE = 180
const DAY_MS = 24 * 60 * 60 * 1000

/** 对话全文搜索：输入框固定 660px，结果列表高 485px、单条 68px。 */
export const MessageSearch = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const open = useMessageSearch((state) => state.open)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<MessageSearchHit[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchId = useRef(0)
  const keyword = query.trim()
  const withResults = keyword !== ''

  const monthDay = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }),
    [locale]
  )
  const fullDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }),
    [locale]
  )

  // 关闭时只丢弃检索结果；输入内容保留在内存中，刷新页面前再次打开仍完整保留。
  useEffect(() => {
    if (open) {
      return
    }
    // 丢弃关闭前仍在进行的检索结果
    searchId.current += 1
    setHits([])
    setStatus('idle')
    setActive(0)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    if (!keyword) {
      setHits([])
      setStatus('idle')
      setActive(0)
      return
    }
    const id = ++searchId.current
    setStatus('loading')
    const timer = setTimeout(() => {
      void searchMessages(keyword).then(
        (result) => {
          if (id !== searchId.current) {
            return
          }
          setHits(result)
          setStatus('idle')
          setActive(0)
        },
        () => {
          if (id !== searchId.current) {
            return
          }
          setHits([])
          setStatus('error')
        }
      )
    }, SEARCH_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [keyword, open])

  // 键盘选中项始终留在可视区域。
  useEffect(() => {
    if (hits.length === 0) {
      return
    }
    const row = listRef.current?.children.item(active)
    row?.scrollIntoView({ block: 'nearest' })
  }, [active, hits])

  const dateLabel = (time: number) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    if (time >= today) {
      return t('sessionHistoryTimelineLabelToday')
    }
    if (time >= today - DAY_MS) {
      return t('sessionHistoryTimelineLabelYesterday')
    }
    const date = new Date(time)
    return (date.getFullYear() === now.getFullYear() ? monthDay : fullDate).format(date)
  }

  const renderSnippet = (hit: MessageSearchHit): ReactNode => {
    if (hit.ranges.length === 0) {
      return hit.snippet
    }
    const parts: ReactNode[] = []
    let cursor = 0
    for (const range of hit.ranges) {
      if (range.start > cursor) {
        parts.push(hit.snippet.slice(cursor, range.start))
      }
      parts.push(<mark key={range.start}>{hit.snippet.slice(range.start, range.end)}</mark>)
      cursor = range.end
    }
    parts.push(hit.snippet.slice(cursor))
    return parts
  }

  const selectHit = (hit: MessageSearchHit) => {
    closeMessageSearch()
    selectSession(hit.sessionId)
    jumpToMessage(hit.sessionId, hit.messageId)
  }

  const moveActive = (delta: number) => {
    if (hits.length === 0) {
      return
    }
    setActive((current) => (current + delta + hits.length) % hits.length)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMessageSearch()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[active]
      if (hit) {
        selectHit(hit)
      }
    }
  }

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeMessageSearch()
        }
      }}
    >
      <div
        className={clsx(styles.panel, withResults && styles.panelWithResults)}
        role="dialog"
        aria-modal="true"
        aria-label={t('searchConversation')}
      >
        <div className={clsx(styles.searchBar, withResults && styles.searchBarWithResults)}>
          <span className={styles.searchIcon}>
            <IconSearchOutline16 />
          </span>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            value={query}
            placeholder={t('searchConversationPlaceholder')}
            aria-label={t('searchConversationPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <IconButton
            className={styles.close}
            icon={<IconCloseOutline16 />}
            aria-label={t('close')}
            onClick={closeMessageSearch}
          />
        </div>
        {withResults ? (
          <div
            ref={listRef}
            className={styles.results}
            role="listbox"
            aria-label={t('searchResult')}
          >
            {hits.length > 0 ? (
              hits.map((hit, index) => (
                <button
                  key={`${hit.sessionId}-${hit.messageId}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={clsx(styles.row, index === active && styles.rowActive)}
                  onMouseMove={() => {
                    if (index !== active) {
                      setActive(index)
                    }
                  }}
                  onClick={() => selectHit(hit)}
                >
                  <span className={styles.rowIcon}>
                    <IconChatOutline20 />
                  </span>
                  <span className={styles.rowBody}>
                    <span className={styles.rowHeader}>
                      <span className={styles.rowTitle}>
                        {hit.sessionTitle || t('untitledChat')}
                      </span>
                      <span className={styles.rowDate}>{dateLabel(hit.createdAt)}</span>
                    </span>
                    <span className={styles.rowSnippet}>{renderSnippet(hit)}</span>
                  </span>
                </button>
              ))
            ) : (
              <div className={styles.hint}>
                {status === 'loading'
                  ? t('searchConversationSearching')
                  : status === 'error'
                    ? t('searchConversationFailed')
                    : t('searchConversationNoResult')}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
