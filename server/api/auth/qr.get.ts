/**
 * GET /api/auth/qr
 *
 * 申请 B站 扫码登录二维码
 * 返回 { url, qrcode_key, cookies }
 */
import { generateQrCode } from '../../utils/bilibili'

export default defineEventHandler(async () => {
  return await generateQrCode()
})
