import { formatDate } from '../../utils/format.js'
import { clearSessions as clearSessionsApi, getSession as getSessionApi } from '../api/sessions.js'
import * as db from './db.js'
import { replaceHistory, useChatStore, waitForServerSaves } from './store.js'
import type { Session } from './types.js'

export { BackupError } from './history/errors.js'

// 导入、导出与全部删除串行处理，避免读取归档时数据被清空或两个替换事务交错。
let backupQueue: Promise<unknown> = Promise.resolve()

const enqueueBackup = <T>(run: () => Promise<T>): Promise<T> => {
  const task = backupQueue.then(run)
  backupQueue = task.catch(() => {})
  return task
}

const backupFileName = (date: Date) => `deepseek_data-${formatDate(date)}.zip`

/** 导出为历史会话导出格式的 ZIP，可再次导入。 */
export const exportHistory = (): Promise<{ name: string; blob: Blob }> =>
  enqueueBackup(async () => {
    // 列表和已加载内容保留导出开始时的快照；未打开的会话逐条读取，不填满详情缓存。
    const { sessions, sessionCache } = useChatStore.getState()
    async function* readSessions(): AsyncGenerator<Session> {
      for (const summary of sessions) {
        let session: Session | undefined
        if (Object.hasOwn(sessionCache, summary.id)) {
          session = sessionCache[summary.id]
        } else {
          try {
            session = await getSessionApi(summary.id)
          } catch {
            // 服务端不可用时退回本地缓存；两者都没有则按导出失败处理
            session = await db.loadSession(summary.id)
          }
        }
        if (!session) {
          throw new Error(`History session disappeared during export: ${summary.id}`)
        }
        // 详情读取期间可能重命名，归档标题与开始时的列表保持一致。
        yield { ...session, ...summary }
      }
    }
    const { exportArchive } = await import('./history/exportArchive.js')
    const now = new Date()
    const blob = await exportArchive(readSessions())
    return { name: backupFileName(now), blob }
  })

/**
 * 浏览器端不再提供历史导入：历史只能由云端 CLI 导入。
 * 保留导出用于本地备份。
 */

/** 确认删除后调用：先删服务端，再以空历史替换本地缓存；保留其他设置。 */
export const clearHistory = (): Promise<void> =>
  enqueueBackup(async () => {
    await waitForServerSaves()
    await clearSessionsApi()
    await replaceHistory(async () => {})
  })
