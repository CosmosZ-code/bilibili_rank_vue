/**
 * Auth 中间件
 *
 * 从 session_id cookie 解析用户身份，注入 event.context。
 * 不阻断请求——即使未登录也放行，由下游 API 决定是否拒绝。
 */
import { getSessionUser, type AuthUser } from '../utils/auth'

// 扩展 h3 event context 类型
declare module 'h3' {
  interface H3EventContext {
    /** 当前用户（未登录时为 null） */
    user: AuthUser | null
    /** 解密后的 B站 Cookie（未登录时为 null） */
    bilibiliCookie: string | null
  }
}

export default defineEventHandler(async (event) => {
  // 初始化默认值
  event.context.user = null
  event.context.bilibiliCookie = null

  // 读取 session_id
  const sessionId = getCookie(event, 'session_id')
  if (!sessionId) return

  // 查找会话
  const result = await getSessionUser(sessionId)
  if (!result) return

  // 注入上下文
  event.context.user = result.user
  event.context.bilibiliCookie = result.bilibiliCookie
})
