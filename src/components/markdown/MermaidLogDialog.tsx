import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import {
  clearMermaidLog,
  closeMermaidLog,
  downloadMermaidLog,
  formatMermaidLog,
  formatTime,
  useMermaidLog,
} from '../../services/markdown/mermaidLog.js'
import { copyText } from '../../utils/clipboard.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './MermaidLogDialog.module.css'

/** 图表日志：按时间倒序展示渲染与导出记录，可复制或下载为文本 */
export const MermaidLogDialog = () => {
  const t = useTranslate()
  const open = useMermaidLog((state) => state.open)
  const entries = useMermaidLog((state) => state.entries)

  if (!open) {
    return null
  }
  return (
    <Modal
      title={
        <span className={styles.title}>
          {t('mermaidLogTitle')}
          <span className={styles.count}>{t('mermaidLogCount', { count: entries.length })}</span>
        </span>
      }
      closable
      className={styles.dialog}
      mainClassName={styles.main}
      onClose={closeMermaidLog}
      footer={
        <>
          <Button
            variant="outlined"
            size="s"
            disabled={entries.length === 0}
            onClick={clearMermaidLog}
          >
            {t('mermaidLogClear')}
          </Button>
          <div className={styles.footerRight}>
            <Button
              variant="outlined"
              size="s"
              disabled={entries.length === 0}
              onClick={() => {
                void copyText(formatMermaidLog(entries)).then((ok) =>
                  showToast({ key: ok ? 'copied' : 'copyFailed' })
                )
              }}
            >
              {t('copy')}
            </Button>
            <Button
              variant="primary"
              size="s"
              disabled={entries.length === 0}
              onClick={downloadMermaidLog}
            >
              {t('mermaidLogDownload')}
            </Button>
          </div>
        </>
      }
    >
      <div className={styles.list}>
        {entries.length === 0 ? (
          <div className={styles.empty}>{t('mermaidLogEmpty')}</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={clsx(styles.entry, entry.level === 'error' && styles.error)}
            >
              <div className={styles.meta}>
                <span className={styles.time}>{formatTime(entry.at)}</span>
                <span className={styles.tag}>
                  {entry.action}/{entry.target}
                </span>
                <span className={styles.level}>{entry.level.toUpperCase()}</span>
                {entry.line ? (
                  <span className={styles.line}>{t('mermaidLogLine', { line: entry.line })}</span>
                ) : null}
                {entry.repeat > 1 ? <span className={styles.repeat}>×{entry.repeat}</span> : null}
              </div>
              <div className={styles.message}>{entry.message}</div>
              {entry.code ? <CodeLines code={entry.code} line={entry.line} /> : null}
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}

/** 带行号的源码：出错行整行高亮，方便直接定位 */
const CodeLines = ({ code, line }: { code: string; line?: number }) => (
  <pre className={styles.code}>
    {code.split(/\r?\n/).map((text, index) => {
      const number = index + 1
      return (
        <span
          key={number}
          className={clsx(styles.codeLine, number === line && styles.codeLineError)}
        >
          <span className={styles.codeLineNumber}>{number}</span>
          <span className={styles.codeLineText}>{text || ' '}</span>
        </span>
      )
    })}
  </pre>
)
