import clsx from 'clsx'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismiss } from '../base/anchored.js'
import { IconCheckOutline16, IconChevronDownOutline14 } from '../base/icons.js'
import { setThinkingLevel, useSettings, type ThinkingLevel } from '../../services/settings.js'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { ThinkingIcon } from './ThinkingIcon.js'
import styles from './ChatInput.module.css'

/**
 * 深度思考的四档选项。off 表示关闭，其余三档都以 thinking.enabled 发送，
 * 等级只影响开关图标的形态与动画（接口没有更细的强度参数）。
 */
const options: { value: ThinkingLevel; name: TranslationKey; description: TranslationKey }[] = [
  {
    value: 'off',
    name: 'thinkingLevelOff',
    description: 'thinkingLevelOffDescription',
  },
  {
    value: 'low',
    name: 'thinkingLevelLow',
    description: 'thinkingLevelLowDescription',
  },
  {
    value: 'high',
    name: 'thinkingLevelHigh',
    description: 'thinkingLevelHighDescription',
  },
  {
    value: 'max',
    name: 'thinkingLevelMax',
    description: 'thinkingLevelMaxDescription',
  },
]

const byValue = (level: ThinkingLevel) =>
  options.find((option) => option.value === level) ?? options[0]

/**
 * 深度思考开关：由原来的二态按钮改造成等级列表。
 * 选中其它等级时图标播一次过渡；选中已选中的等级时播一次“收窄再展开”。
 */
export const ThinkingSwitch = () => {
  const t = useTranslate()
  const thinking = useSettings((state) => state.thinking)
  const storedLevel = useSettings((state) => state.thinkingLevel)
  // thinking 是随请求发送的唯一真相，关闭时等级一律显示为 off
  const level: ThinkingLevel = thinking ? storedLevel : 'off'
  const current = byValue(level)
  const [open, setOpen] = useState(false)
  const [nudge, setNudge] = useState(0)
  // 输入框在页面底部，菜单优先向上展开
  const { anchorRef, floatingRef, position } = useAnchoredPosition<
    HTMLButtonElement,
    HTMLDivElement
  >(open, { side: 'top', align: 'start', offset: 6 })
  // Esc 只关菜单，不影响页面其它快捷键
  useDismiss(open, [anchorRef, floatingRef], () => setOpen(false), { captureEscape: true })

  const choose = (next: ThinkingLevel) => {
    setOpen(false)
    if (next === level) {
      // 等级没有变化：播放一次图标自身的反馈动画
      setNudge((value) => value + 1)
      return
    }
    setThinkingLevel(next)
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={clsx(
          styles.toggle,
          styles.modelToggle,
          (open || level !== 'off') && styles.selected
        )}
        aria-label={`${t('thinkingSwitch')}: ${t(current.name)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ThinkingIcon level={level} nudge={nudge} size={18} />
        <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
        {level === 'off' ? null : (
          <span className={styles.thinkingLevel}>{t(current.name)}</span>
        )}
        <span className={styles.modelArrow}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={floatingRef}
              className={styles.modelMenu}
              style={position ?? undefined}
              role="listbox"
              aria-label={t('thinkingLevelList')}
            >
              {options.map((option) => {
                const selected = option.value === level
                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={selected}
                    className={clsx(styles.modelOption, selected && styles.modelOptionSelected)}
                    onClick={() => choose(option.value)}
                  >
                    <span className={styles.thinkingOptionIcon}>
                      <ThinkingIcon level={option.value} size={18} />
                    </span>
                    <span className={styles.modelOptionText}>
                      <span className={styles.modelOptionName}>{t(option.name)}</span>
                      <span className={styles.modelOptionDescription}>{t(option.description)}</span>
                    </span>
                    {selected ? (
                      <span className={styles.modelCheck}>
                        <IconCheckOutline16 />
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
