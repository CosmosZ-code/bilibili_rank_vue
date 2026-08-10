/**
 * POST /api/auth/logout
 *
 * 退出登录：清除 session
 */
import { removeSession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const sessionId = getCookie(event, 'session_id')

  if (sessionId) {
    await removeSession(sessionId)
  }

  // 清除 cookie（secure 需与写入时一致，跟随请求协议）
  deleteCookie(event, 'session_id', {
    httpOnly: true,
    secure: getRequestProtocol(event) === 'https',
    sameSite: 'lax',
    path: '/',
  })

  return { ok: true }
})
