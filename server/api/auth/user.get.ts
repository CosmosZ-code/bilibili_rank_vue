/**
 * GET /api/auth/user
 *
 * 获取当前登录用户信息
 * 通过 session_id cookie 识别用户
 */
import { getSessionUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const sessionId = getCookie(event, 'session_id')

  if (!sessionId) {
    return { user: null }
  }

  const result = await getSessionUser(sessionId)

  if (!result) {
    return { user: null }
  }

  return {
    user: {
      bilibiliUid: result.user.bilibiliUid,
      bilibiliUname: result.user.bilibiliUname,
      bilibiliFace: result.user.bilibiliFace,
    },
  }
})
