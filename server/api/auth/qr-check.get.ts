/**
 * GET /api/auth/qr-check?qrcode_key=xxx
 *
 * 轮询 B站 扫码登录状态
 * 登录成功时自动完成用户创建、Cookie 存储、session 创建
 */
import { pollQrCode } from '../../utils/bilibili'
import { handleLoginSuccess } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const qrcodeKey = query.qrcode_key as string
  const cookies = query.cookies as string | undefined

  if (!qrcodeKey) {
    throw createError({
      statusCode: 400,
      message: '缺少 qrcode_key 参数',
    })
  }

  // 轮询 B站 扫码状态（传入 cookies 以维持同一会话）
  const result = await pollQrCode(qrcodeKey, cookies)

  // 登录成功，处理后续流程
  if (result.status === 'success' && result.cookie) {
    const sessionId = await handleLoginSuccess(result.cookie, result.refreshToken)

    // 设置 session cookie
    // 仅 HTTPS 下启用 secure：HTTP 环境（本地 dev 等）浏览器会拒绝保存 secure cookie，
    // 导致登录成功但后续请求拿不到 session（右上角仍显示未登录）
    setCookie(event, 'session_id', sessionId, {
      httpOnly: true,
      secure: getRequestProtocol(event) === 'https',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 天
      path: '/',
    })

    // 个性化数据不在此后台预热：
    // 客户端登录成功后由 refreshPersonalized 触发拉取（唯一 fetch 源），
    // 避免与预热并发导致重复请求 B站（防风控）
    return {
      status: 'success',
      message: '登录成功',
    }
  }

  // 其他状态直接返回
  return {
    status: result.status,
    message: result.message,
    rawCode: result.rawCode,
  }
})
