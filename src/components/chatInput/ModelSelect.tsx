import clsx from 'clsx'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismiss } from '../base/anchored.js'
import { IconCheckOutline16, IconChevronDownOutline14, IconModelOutline14 } from '../base/icons.js'
import type { ChatModel } from '../../services/api/types.js'
import { setModel, useSettings } from '../../services/settings.js'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import styles from './ChatInput.module.css'

/** 可选模型及其特点，顺序即菜单内的展示顺序 */
const models: { value: ChatModel; name: TranslationKey; description: TranslationKey }[] = [
  {
    value: 'deepseek-flash',
    name: 'modelDeepseekFlash',
    description: 'modelDeepseekFlashDescription',
  },
  {
    value: 'deepseek-v4-pro',
    name: 'modelDeepseekV4Pro',
    description: 'modelDeepseekV4ProDescription',
  },
]

/**
 * 输入框内的模型选择：触发器与开关同样式，菜单向上展开并列出模型名称与特点。
 * 用 portal 挂到 body，避免被输入框的圆角溢出裁剪。
 */
export const ModelSelect = () => {
  const t = useTranslate()
  const model = useSettings((state) => state.model)
  const [open, setOpen] = useState(false)
  const current = models.find((option) => option.value === model) ?? models[0]
  // 输入框位于页面底部，优先向上展开；空间不足时由 useAnchoredPosition 翻到下方。
  const { anchorRef, floatingRef, position } = useAnchoredPosition<
    HTMLButtonElement,
    HTMLDivElement
  >(open, { side: 'top', align: 'start', offset: 6 })
  // Esc 只关菜单，不影响页面其他快捷键
  useDismiss(open, [anchorRef, floatingRef], () => setOpen(false), { captureEscape: true })

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={clsx(styles.toggle, styles.modelToggle, open && styles.selected)}
        aria-label={`${t('modelSelectLabel')}: ${t(current.name)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <IconModelOutline14 />
        <span className={clsx(styles.toggleLabel, styles.modelLabel)}>{t(current.name)}</span>
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
              aria-label={t('modelSelectLabel')}
            >
              {models.map((option) => {
                const selected = option.value === model
                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={selected}
                    className={clsx(styles.modelOption, selected && styles.modelOptionSelected)}
                    onClick={() => {
                      setOpen(false)
                      setModel(option.value)
                    }}
                  >
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
