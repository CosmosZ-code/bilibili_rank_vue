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

  if (!qrcodeKey) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 qrcode_key 参数',
    })
  }

  // 轮询 B站 扫码状态
  const result = await pollQrCode(qrcodeKey)

  // 登录成功，处理后续流程
  if (result.status === 'success' && result.cookie) {
    const sessionId = await handleLoginSuccess(result.cookie, result.refreshToken)

    // 设置 session cookie
    setCookie(event, 'session_id', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 天
      path: '/',
    })

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
