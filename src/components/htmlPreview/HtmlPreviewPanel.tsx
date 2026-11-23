import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { getHtmlTitle } from '../../utils/html.js'
import { SidePanel } from '../sidePanel/SidePanel.js'
import { closeHtmlPreview, useSidePanel } from '../sidePanel/sidePanelState.js'
import styles from './HtmlPreviewPanel.module.css'

/** 右侧 HTML 预览面板：标题取自页面 <title>，左侧把手可拖动调整宽度 */
export const HtmlPreviewPanel = () => {
  const t = useTranslate()
  const content = useSidePanel((state) => state.content)
  const code = content?.kind === 'html' ? content.code : null
  // 关闭时保留最后预览的内容，让面板滑出时不至于瞬间清空
  const [lastCode, setLastCode] = useState<string | null>(null)
  const displayCode = code ?? lastCode

  useEffect(() => {
    if (code !== null) {
      setLastCode(code)
    }
  }, [code])

  const title = useMemo(() => {
    if (displayCode === null) {
      return ''
    }
    return getHtmlTitle(displayCode) || t('htmlPreview')
  }, [displayCode, t])

  if (displayCode === null) {
    return null
  }

  return (
    <SidePanel
      open={code !== null}
      title={title}
      ariaLabel={t('htmlPreview')}
      onClose={closeHtmlPreview}
    >
      <iframe
        className={styles.frame}
        title={title}
        srcDoc={displayCode}
        sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-pointer-lock"
        referrerPolicy="no-referrer"
      />
    </SidePanel>
  )
}
