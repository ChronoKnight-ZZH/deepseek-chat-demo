import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { contentUrl, getSignedUrls, type FileUrlSet } from '../../services/api/fileStorage.js'
import { useUploads } from '../../services/attachments.js'
import { loadFile } from '../../services/chat/db.js'
import type { FileAttachment } from '../../services/chat/types.js'
import { isTextPreviewable } from '../../services/filePreview.js'
import { IconPhotoErrorFill20, IconRefreshOutline16 } from '../base/icons.js'
import { openImageViewer } from '../base/imageViewerState.js'
import { Tooltip } from '../base/Tooltip.js'
import { FileCard } from '../files/FileCard.js'
import { openFilePreview } from '../files/filePreviewState.js'
import styles from './MessageFile.module.css'

/** 原件从 IndexedDB 读出并生成本地地址；undefined 表示加载中，null 表示原件缺失。 */
const useFileUrl = (id: string) => {
  const [fileUrl, setFileUrl] = useState<{ id: string; url: string | null } | null>(null)
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    loadFile(id).then((blob) => {
      if (!cancelled) {
        objectUrl = blob ? URL.createObjectURL(blob) : null
        setFileUrl({ id, url: objectUrl })
      }
    })
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [id])
  return fileUrl?.id === id ? fileUrl.url : undefined
}

/** 历史或失效附件的补传状态：只在还没有 serverId 时显示 */
const useUploadState = (file: FileAttachment) =>
  useUploads((state) => {
    if (file.serverId) {
      return null
    }
    const task = state.tasks[file.id]
    return task?.status === 'uploading' || task?.status === 'error' ? task : null
  })

type RemoteState =
  | { status: 'ready'; fileId: string; urls: FileUrlSet }
  | { status: 'failed'; fileId: string }

/**
 * 本地没有原件时（换设备、清过缓存），用 storageId 向 BFF 换取短期地址。
 * force 用于票据过期后重签一次；state 带 fileId 以免切换附件时串用地址。
 */
const useRemoteUrls = (fileId: string | null, sessionId: string, enabled: boolean) => {
  const [state, setState] = useState<RemoteState | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled || !fileId) {
      return
    }
    let cancelled = false
    getSignedUrls(fileId, sessionId, { force: attempt > 0 })
      .then((urls) => {
        if (!cancelled) {
          setState({ status: 'ready', fileId, urls })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'failed', fileId })
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, fileId, sessionId, attempt])

  const refresh = useCallback(() => setAttempt((value) => value + 1), [])
  const current = state?.fileId === fileId ? state : null
  return { current, refresh, refreshed: attempt > 0 }
}

/**
 * 消息里的附件：
 * - 图片：纯图片显示 120×120 缩略图，与文件混排时为 64×64；上传中显示 loading 蒙层，
 *   上传失败显示品牌色描边 + 中心重试图标（可重试）或 photo-error 图标（不可重试）。
 * - 文件：显示文件卡片。
 */
export const MessageFile = ({
  sessionId,
  file,
  onRetry,
}: {
  sessionId: string
  file: FileAttachment
  /** 本条消息补传失败且可重试时提供 */
  onRetry: (() => void) | null
}) => {
  const t = useTranslate()
  const localUrl = useFileUrl(file.id)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const upload = useUploadState(file)
  const uploading = upload?.status === 'uploading'
  const failed = upload?.status === 'error'
  const retryable = failed && upload.retryable
  const errorText = failed ? t(upload.error.key, upload.error.params) : undefined

  // 本地原件缺失时才走服务端：本地存在（含 0 字节不可能）就始终优先本地
  const storageId = file.storageId
  const {
    current: remote,
    refresh: refreshRemote,
    refreshed,
  } = useRemoteUrls(storageId, sessionId, localUrl === null && Boolean(storageId))
  const remoteUrls = remote?.status === 'ready' ? remote.urls : null
  // undefined = 本地原件仍在读，先显示占位；null = 本地确实没有，才退回服务端地址
  const imageUrl =
    localUrl === undefined
      ? undefined
      : (localUrl ??
        (remoteUrls && storageId ? contentUrl(remoteUrls.urls.p, storageId, 'p') : null))
  const downloadUrl =
    localUrl === undefined
      ? undefined
      : (localUrl ??
        (remoteUrls && storageId ? contentUrl(remoteUrls.urls.r, storageId, 'r') : null))

  const retry = retryable ? onRetry : null

  // 图片本地缺失但服务端有 storageId 时留在图片分支：等待换票或显示失效，
  // 避免先闪一下文件卡片；没有 storageId 的旧图片仍退回文件卡片。
  const remoteImage = localUrl === null && Boolean(storageId)
  if (file.isImage && (imageUrl !== null || remoteImage)) {
    const preview = imageUrl ? (
      failedUrl === imageUrl ? (
        <span className={styles.failedIcon} role="img" aria-label={file.name}>
          <IconPhotoErrorFill20 />
        </span>
      ) : (
        <img
          src={imageUrl}
          alt={file.name}
          onError={() => {
            // 服务端票据可能已过期：同一次挂载内只重签一次，避免死循环
            if (remoteUrls && !refreshed) {
              refreshRemote()
            } else {
              setFailedUrl(imageUrl)
            }
          }}
        />
      )
    ) : null

    // 上传中：本地原件已在 IndexedDB，先垫在蒙层下显示，避免只有一块灰色占位
    if (uploading) {
      return (
        <div className={clsx(styles.image, styles.imageThumb)} title={file.name}>
          {preview}
          <div className={styles.overlay}>
            <span className={styles.spinner} />
          </div>
        </div>
      )
    }

    // 「上传失败」只显示状态，其余原因写在图片底部的渐变上
    const reason =
      errorText && errorText !== t('uploadFileStatusFailed') ? (
        <span className={styles.reason}>{errorText}</span>
      ) : null

    // 上传失败不可重试：保留缩略图，底部渐变显示原因
    if (failed && !retry) {
      return (
        <div
          className={clsx(styles.image, styles.imageThumb)}
          title={errorText}
          aria-label={errorText}
        >
          {preview ?? (
            <span className={styles.failedIcon}>
              <IconPhotoErrorFill20 />
            </span>
          )}
          {reason}
        </div>
      )
    }

    // 上传失败可重试：缩略图 + 红色描边 + 蒙层重试图标，原因在底部
    if (failed && retry) {
      const retryLabel = t('uploadRetry', { message: errorText ?? t('uploadFileStatusFailed') })
      return (
        <Tooltip content={retryLabel}>
          <button
            type="button"
            className={clsx(styles.image, styles.imageThumb, styles.retryImage)}
            aria-label={retryLabel}
            onClick={retry}
          >
            {preview}
            <div className={clsx(styles.overlay, styles.retryOverlay)}>
              <IconRefreshOutline16 />
            </div>
            {reason}
          </button>
        </Tooltip>
      )
    }

    // 正常态：页面内弹窗预览原件
    return imageUrl ? (
      <button
        type="button"
        className={clsx(styles.image, styles.imageThumb)}
        title={file.name}
        aria-label={file.name}
        onClick={() => openImageViewer(imageUrl, file.name)}
      >
        {preview}
      </button>
    ) : remote?.status === 'failed' ? (
      // 本地缺失且服务端取不到原件：明确显示失效，避免一直空白
      <div className={styles.image} title={file.name}>
        <span className={styles.failedIcon} role="img" aria-label={file.name}>
          <IconPhotoErrorFill20 />
        </span>
      </div>
    ) : (
      // 原件还没加载出来（极短暂）
      <div className={styles.image} />
    )
  }

  // 文本类附件点开是预览（本地原件优先，缺失时用 p 票据），其余仍走 r 票据下载
  const previewable = isTextPreviewable(file.name, file.mimeType)
  const hasOriginal = localUrl !== undefined && (localUrl !== null || Boolean(storageId))
  const openable = !upload && hasOriginal && (previewable || Boolean(downloadUrl))
  const open = () => {
    if (previewable) {
      openFilePreview({
        id: file.id,
        name: file.name,
        size: file.size,
        storageId,
        sessionId,
        downloadUrl: downloadUrl ?? null,
      })
      return
    }
    if (downloadUrl) {
      window.open(downloadUrl, '_blank', 'noreferrer')
    }
  }

  return (
    <FileCard
      name={file.name}
      size={file.size}
      status={uploading ? 'uploading' : failed ? 'error' : 'done'}
      error={errorText}
      onRetry={retry ?? undefined}
      onOpen={openable ? open : undefined}
    />
  )
}
