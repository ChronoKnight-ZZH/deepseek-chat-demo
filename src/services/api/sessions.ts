import { request } from './client.js'
import type { Session, SessionSummary } from '../chat/types.js'

export type SessionListResponse = {
  sessions: SessionSummary[]
}

export type FullSessionListResponse = {
  sessions: Session[]
}

const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`

export const listSessions = async (): Promise<SessionSummary[]> => {
  const response = await request('/sessions')
  const body = (await response.json()) as SessionListResponse
  return Array.isArray(body.sessions) ? body.sessions : []
}

/** 搜索/导出用：一次取回全部会话正文；服务端限制最多 1000 条 */
export const listAllSessions = async (): Promise<Session[]> => {
  const response = await request('/sessions?full=1')
  const body = (await response.json()) as FullSessionListResponse
  return Array.isArray(body.sessions) ? body.sessions : []
}

export const getSession = async (id: string): Promise<Session> => {
  const response = await request(sessionPath(id))
  return (await response.json()) as Session
}

export const saveSession = async (session: Session): Promise<void> => {
  await request(sessionPath(session.id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  })
}

export const renameSession = async (id: string, title: string): Promise<void> => {
  await request(sessionPath(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export const deleteSession = async (id: string): Promise<void> => {
  await request(sessionPath(id), { method: 'DELETE' })
}

export const clearSessions = async (): Promise<number> => {
  const response = await request('/sessions', { method: 'DELETE' })
  const body = (await response.json()) as { deleted?: number }
  return typeof body.deleted === 'number' ? body.deleted : 0
}
