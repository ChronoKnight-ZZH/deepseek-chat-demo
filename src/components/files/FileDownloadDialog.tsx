import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { closeFileDownload, downloadRequestedFile, useFileDownload } from './fileDownloadState.js'
import styles from './FileDownloadDialog.module.css'

/**
 * 不能在线预览的文件点击后先确认：说明无法预览，确认后才开始下载。
 * PDF、文本等可预览类型不会走到这里。
 */
export const FileDownloadDialog = () => {
  const t = useTranslate()
  const request = useFileDownload((state) => state.request)

  if (!request) {
    return null
  }

  return (
    <Modal
      title={t('fileDownloadTitle')}
      onClose={closeFileDownload}
      footer={
        <>
          <Button variant="outlined" onClick={closeFileDownload}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => {
              downloadRequestedFile(request)
              closeFileDownload()
            }}
          >
            {t('download')}
          </Button>
        </>
      }
    >
      <div className={styles.description}>
        {t('fileDownloadDescription', { name: request.name })}
      </div>
    </Modal>
  )
}
