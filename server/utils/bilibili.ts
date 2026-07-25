/**
 * B站 API 封装
 *
 * 参考：bilibili-API-collect (https://github.com/SocialSisterYi/bilibili-API-collect)
 *
 * 提供统一的 B站 API 请求方法，包括：
 * - WBI 签名（Web 端身份校验）
 * - 排行榜视频列表
 * - 热门视频列表
 * - 在线人数查询
 * - 视频播放/弹幕统计
 * - 用户历史记录
 * - 用户收藏夹
 */

import type { BilibiliResponse } from '../../app/types'
import { createHash, createHmac } from 'node:crypto'

const BILIBILI_API_BASE = 'https://api.bilibili.com'

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
}

// WBI 签名混排表（来自 bilibili-API-collect）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 52, 44, 34,
]

// WBI 密钥缓存（避免每次都请求 nav 接口）
let wbiKeysCache: { imgKey: string; subKey: string; cachedAt: number } | null = null
const WBI_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

// bili_ticket 缓存（降低风控概率，有效期 3 天）
let biliTicketCache: { ticket: string; cachedAt: number } | null = null
const TICKET_CACHE_TTL = 259200 * 1000 // 3 天（与 B站 ticket 有效期对齐）

/** 简单的异步延迟 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================
// WBI 签名
// ============================================================

/**
 * 从 B站 nav 接口获取 WBI 签名密钥
 *
 * img_url 和 sub_url 实际上是伪装成图片 URL 的密钥字符串，
 * 需要从 URL 中提取真正的密钥。
 */
async function fetchWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  // 检查缓存
  if (wbiKeysCache && Date.now() - wbiKeysCache.cachedAt < WBI_CACHE_TTL) {
    return { imgKey: wbiKeysCache.imgKey, subKey: wbiKeysCache.subKey }
  }

  try {
    const res = await $fetch<{
      code: number
      data: { wbi_img: { img_url: string; sub_url: string } }
    }>(`${BILIBILI_API_BASE}/x/web-interface/nav`, {
      headers: DEFAULT_HEADERS,
      timeout: 5000,
    })

    // code=0 表示已登录，-101 表示未登录但 wbi_img 仍然返回
    if ((res.code === 0 || res.code === -101) && res.data?.wbi_img) {
      // img_url 和 sub_url 格式如:
      // "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png"
      // 需要从文件名中提取密钥（去除 .png 后缀和路径前缀）
      const imgUrl = res.data.wbi_img.img_url
      const subUrl = res.data.wbi_img.sub_url

      const imgKey = imgUrl.split('/').pop()?.replace(/\.(png|gif|jpe?g)$/, '') || ''
      const subKey = subUrl.split('/').pop()?.replace(/\.(png|gif|jpe?g)$/, '') || ''

      if (imgKey && subKey) {
        wbiKeysCache = { imgKey, subKey, cachedAt: Date.now() }
        return { imgKey, subKey }
      }
    }
  } catch {
    // nav 接口偶尔失败，使用空密钥（部分接口可以不签名）
  }

  return { imgKey: '', subKey: '' }
}

/**
 * 生成 WBI 签名参数 w_rid 和 wts
 *
 * 算法：
 * 1. 拼接 img_key + sub_key → mixedStr
 * 2. 对 mixedStr 按 MIXIN_KEY_ENC_TAB 重新排列 → 取前 32 个字符 = mixinKey
 * 3. 参数按 key 排序 → URL 编码 → 追加 mixinKey → MD5 → w_rid
 * 4. 添加当前时间戳 wts
 */
function getMixinKey(orig: string): string {
  const chars: string[] = []
  for (const idx of MIXIN_KEY_ENC_TAB) {
    if (idx < orig.length) {
      chars.push(orig[idx])
    }
  }
  return chars.join('').slice(0, 32)
}

function signWbiParams(
  params: Record<string, string | number>,
  imgKey: string,
  subKey: string,
): { w_rid: string; wts: number } {
  const mixinKey = getMixinKey(imgKey + subKey)
  const wts = Math.floor(Date.now() / 1000)

  // 添加时间戳，按 key 排序
  const allParams = { ...params, wts }
  const sortedKeys = Object.keys(allParams).sort()

  // 构建查询字符串（不包含 ?）
  // 过滤 value 中的 "!'()*" 字符（WBI 规范要求）
  const chrFilter = /[!'()*]/g
  const queryParts = sortedKeys.map((key) => {
    const value = String(allParams[key]).replace(chrFilter, '')
    return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
  })
  const queryString = queryParts.join('&')

  // MD5(query_string + mixin_key)
  const wRid = createHash('md5')
    .update(queryString + mixinKey)
    .digest('hex')

  return { w_rid: wRid, wts }
}

// ============================================================
// bili_ticket（降低风控概率）
// ============================================================

/**
 * 获取 bili_ticket JWT 令牌
 *
 * bili_ticket 位于 Cookie 中，可降低 B站风控概率。
 * 使用 HMAC-SHA256 签名调用 GenWebTicket API 获取，缓存有效期 3 天。
 * 同时可顺便提取 WBI keys（作为 nav 接口的备选来源）。
 *
 * 建议在服务启动时调用 prefetchBiliTicket() 预取，
 * 避免首次 API 请求因取 ticket 而触发风控。
 *
 * 参考：bilibili-API-collect/docs/misc/sign/bili_ticket.md
 */
async function fetchBiliTicket(): Promise<string> {
  // 检查缓存
  if (biliTicketCache && Date.now() - biliTicketCache.cachedAt < TICKET_CACHE_TTL) {
    return biliTicketCache.ticket
  }

  try {
    const ts = Math.floor(Date.now() / 1000)
    const hmac = createHmac('sha256', 'XgwSnGZ1p')
    hmac.update(`ts${ts}`)
    const hexSign = hmac.digest('hex')

    const url = new URL(
      '/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket',
      BILIBILI_API_BASE,
    )
    url.searchParams.set('key_id', 'ec02')
    url.searchParams.set('hexsign', hexSign)
    url.searchParams.set('context[ts]', String(ts))
    url.searchParams.set('csrf', '')

    const response = await $fetch<{
      code: number
      message: string
      data?: {
        ticket?: string
        nav?: { img?: string; sub?: string }
      }
    }>(url.toString(), {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      timeout: 5000,
    })

    if (response.code === 0 && response.data?.ticket) {
      biliTicketCache = { ticket: response.data.ticket, cachedAt: Date.now() }
      console.log('[bili_ticket] ticket 已刷新')

      // 顺便更新 WBI keys（如果 nav 接口之前获取失败）
      if (response.data.nav?.img && response.data.nav?.sub) {
        const imgKey = response.data.nav.img.split('/').pop()?.replace(/\.(png|gif|jpe?g)$/, '') || ''
        const subKey = response.data.nav.sub.split('/').pop()?.replace(/\.(png|gif|jpe?g)$/, '') || ''
        if (imgKey && subKey && (!wbiKeysCache || !wbiKeysCache.imgKey)) {
          wbiKeysCache = { imgKey, subKey, cachedAt: Date.now() }
          console.log('[bili_ticket] WBI keys 已同步更新')
        }
      }

      return response.data.ticket
    }

    console.warn('[bili_ticket] 获取失败:', response.code, response.message)
  } catch (err: any) {
    console.warn('[bili_ticket] 请求异常:', err.message || err)
  }

  return ''
}

/**
 * 预取 bili_ticket（供 cache-warmer 启动时调用）
 *
 * 提前获取 ticket，避免首次 API 请求因 GenWebTicket 调用与 B站 API
 * 请求间隔过近而触发风控。
 */
export async function prefetchBiliTicket(): Promise<void> {
  await fetchBiliTicket()
}

// ============================================================
// 通用请求
// ============================================================

/**
 * 通用 B站 API 请求封装（支持 WBI 签名）
 */
export async function bilibiliRequest<T>(
  path: string,
  options?: {
    params?: Record<string, string | number>
    cookie?: string
    method?: 'GET' | 'POST'
    wbiSign?: boolean // 是否启用 WBI 签名
    skipTicket?: boolean // 跳过 bili_ticket 附加（用于 GenWebTicket 自身）
  },
): Promise<BilibiliResponse<T>> {
  const headers: Record<string, string> = { ...DEFAULT_HEADERS }

  if (options?.cookie) {
    headers['Cookie'] = options.cookie
  }

  // 附加 bili_ticket（降低风控概率）
  // 注意：skipTicket 为 true 时跳过（用于 GenWebTicket 自身，避免循环）
  if (options?.skipTicket !== true) {
    const ticket = await fetchBiliTicket()
    if (ticket) {
      const existingCookie = headers['Cookie'] || ''
      headers['Cookie'] = existingCookie
        ? `${existingCookie}; bili_ticket=${ticket}`
        : `bili_ticket=${ticket}`
    }
  }

  let params = { ...(options?.params || {}) }

  // WBI 签名（如果需要且路径匹配）
  if (options?.wbiSign !== false) {
    const { imgKey, subKey } = await fetchWbiKeys()
    if (imgKey && subKey) {
      const { w_rid, wts } = signWbiParams(params, imgKey, subKey)
      params = { ...params, w_rid, wts }
    }
  }

  const url = new URL(path, BILIBILI_API_BASE)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  }

  const response = await $fetch<BilibiliResponse<T>>(url.toString(), {
    headers,
    method: options?.method || 'GET',
    timeout: 8000,
  })

  if (response.code !== 0) {
    // -352 风控失败：记录 v_voucher 信息以便排查
    if (response.code === -352) {
      const data = response.data as any
      const vVoucher = data?.v_voucher || ''
      if (vVoucher) {
        console.warn(
          `[bilibili] -352 风控 (${path}): v_voucher=${vVoucher} — 可能需要 CAPTCHA 解锁`,
        )
      } else {
        console.warn(
          `[bilibili] -352 风控 (${path}): 无 v_voucher，请检查 UA / WBI 签名 / bili_ticket`,
        )
      }
    }

    throw createError({
      statusCode: 502,
      message: `B站API错误 [${response.code}]: ${response.message}`,
    })
  }

  return response
}

// ============================================================
// 排行榜相关
// ============================================================

/** B站排行榜 API 返回的视频项 */
export interface RankingVideo {
  bvid: string
  cid: number
  title: string
  pic: string
  owner: { name: string; mid: number }
  stat?: { view: number; danmaku: number }
}

/**
 * 获取 B站排行榜视频列表
 *
 * API: GET /x/web-interface/ranking/v2
 * 参数: rid（分区 tid，默认 0 全站）, type=all（全部）
 *
 * @param rid - 分区 tid，默认 '0'（全站），仅支持主分区
 */
export async function getBilibiliRanking(rid: string = '0'): Promise<RankingVideo[]> {
  const response = await bilibiliRequest<{ list: RankingVideo[] }>(
    '/x/web-interface/ranking/v2',
    {
      params: { rid, type: 'all' },
    },
  )
  const data = response.data as any
  return data.list || data || []
}

/**
 * 获取 B站热门视频（分页拉取）
 *
 * API: GET /x/web-interface/popular
 * 参数: pn（页码）, ps（每页 50 条）
 *
 * @param pages - 需要拉取的页数
 */
export async function getBilibiliPopular(pages: number = 4, cookie?: string): Promise<RankingVideo[]> {
  const results: RankingVideo[] = []

  for (let pn = 1; pn <= pages; pn++) {
    try {
      const response = await bilibiliRequest<{ list: RankingVideo[] }>(
        '/x/web-interface/popular',
        {
          params: { pn: String(pn), ps: '50' },
          cookie,
        },
      )
      const data = response.data as any
      const list = data.list || data || []
      results.push(...list)

      if (list.length < 50) break

      // 页间延迟，避免触发风控
      if (pn < pages) {
        await sleep(500)
      }
    } catch (err: any) {
      // 单页失败不中断其他页的请求
      console.warn(`[getBilibiliPopular] 第 ${pn} 页请求失败:`, err.message || err)
    }
  }

  return results
}

// ============================================================
// 视频详情相关
// ============================================================

/**
 * 获取视频在线观看人数
 *
 * API: GET /x/player/online/total
 * 参数: bvid, cid
 * 返回: { total: "10万+", count: "..." }
 */
export async function getBilibiliOnlineCount(
  bvid: string,
  cid: number | string,
): Promise<{ formatted: string; raw: number }> {
  try {
    const response = await bilibiliRequest<{ total?: string; count?: string }>(
      '/x/player/online/total',
      {
        params: { bvid, cid: String(cid) },
        wbiSign: false, // 在线人数接口不需要 WBI 签名
      },
    )

	    const total = response.data?.total || response.data?.count || '0'
	    const { value: raw, hasPlus } = parseChineseNumber(String(total))

	    // 观看人数 >= 1000 时追加 "+" 后缀，表示"超过"
	    const formatted = formatCount(raw) + (hasPlus || raw >= 1000 ? '+' : '')

	    return { formatted, raw }
  } catch {
    return { formatted: '0', raw: 0 }
  }
}

/**
 * 获取视频元数据（播放量、弹幕数、封面链接）
 *
 * API: GET /x/web-interface/view
 * 参数: bvid
 *
 * 注意：该接口批量请求会被 B站封锁，仅供逐个重试少量失败视频使用。
 */
export async function getBilibiliVideoStats(bvid: string): Promise<{
  playCountNum: number
  danmakuCountNum: number
  playCount: string
  danmakuCount: string
  pic: string
}> {
  try {
    const response = await bilibiliRequest<{
      stat?: { view: number; danmaku: number }
      pic?: string
    }>('/x/web-interface/view', {
      params: { bvid },
      wbiSign: false, // /x/web-interface/view 是公开接口，不需要 WBI 签名
    })

    const data = response.data as any
    const stat = data?.stat
    const play = stat?.view || 0
    const danmaku = stat?.danmaku || 0
    const pic = ensureHttps(data?.pic || '')

    return {
      playCountNum: play,
      danmakuCountNum: danmaku,
      playCount: formatCount(play),
      danmakuCount: formatCount(danmaku),
      pic,
    }
  } catch (err: any) {
    console.warn(`[getBilibiliVideoStats] 获取视频 ${bvid} 元数据失败:`, err.message || err)
    return {
      playCountNum: 0,
      danmakuCountNum: 0,
      playCount: '0',
      danmakuCount: '0',
      pic: '',
    }
  }
}

// ============================================================
// 用户历史 & 收藏
// ============================================================

/**
 * 获取用户观看历史
 *
 * API: GET /x/web-interface/history/cursor
 * 需要 Cookie(SESSDATA)
 */
export async function fetchBilibiliHistory(
  cookie: string,
  page?: { max?: number; viewAt?: number },
): Promise<any> {
  const params: Record<string, string> = {}
  if (page?.max) params.max = String(page.max)
  if (page?.viewAt) params.view_at = String(page.viewAt)

  return bilibiliRequest('/x/web-interface/history/cursor', {
    params,
    cookie,
  })
}

/**
 * 获取用户收藏夹列表
 *
 * API: GET /x/v3/fav/folder/created/list
 * 需要 Cookie(SESSDATA)
 */
export async function fetchBilibiliFavorites(
  cookie: string,
  params?: { mediaId?: number; page?: number },
): Promise<any> {
  const queryParams: Record<string, string> = {}
  if (params?.mediaId) queryParams.media_id = String(params.mediaId)
  if (params?.page) queryParams.pn = String(params.page)
  queryParams.ps = String(params?.page ? 20 : 30)

  return bilibiliRequest('/x/v3/fav/folder/created/list', {
    params: queryParams,
    cookie,
  })
}

// ============================================================
// 扫码登录相关
// ============================================================

const PASSPORT_BASE = 'https://passport.bilibili.com'

/** 二维码申请返回 */
export interface QrCodeResult {
  url: string
  qrcode_key: string
  /** generate 请求返回的 Set-Cookie，后续 poll 时需要回传以维持同一会话 */
  cookies: string
}

/** 扫码轮询状态码 */
export type QrPollStatus = 'pending' | 'scanned' | 'expired' | 'success'

/** 扫码轮询返回 */
export interface QrPollResult {
  status: QrPollStatus
  /** 登录成功时返回的完整 Cookie 字符串 */
  cookie?: string
  /** 登录成功时返回的 refresh_token */
  refreshToken?: string
  /** 原始 data.code */
  rawCode: number
  /** 原始 message */
  message: string
}

/** 用户信息（从 /x/web-interface/nav 获取） */
export interface BilibiliUserInfo {
  mid: number
  uname: string
  face: string
  isLogin: boolean
}

/**
 * 申请 B站 Web 扫码登录二维码
 *
 * API: GET https://passport.bilibili.com/x/passport-login/web/qrcode/generate
 * 返回二维码 URL 和 qrcode_key（密钥有效期 180 秒）
 */
export async function generateQrCode(): Promise<QrCodeResult> {
  // 使用原生 fetch 以获取 Set-Cookie 响应头（后续 poll 时需要回传以维持同一会话）
  const response = await fetch(`${PASSPORT_BASE}/x/passport-login/web/qrcode/generate`, {
    headers: DEFAULT_HEADERS,
  })

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      message: `B站二维码生成失败: HTTP ${response.status}`,
    })
  }

  const body = await response.json() as {
    code: number
    message: string
    data: { url: string; qrcode_key: string }
  }

  if (body.code !== 0) {
    throw createError({
      statusCode: 502,
      message: `B站二维码生成失败 [${body.code}]: ${body.message}`,
    })
  }

  // 提取 Set-Cookie 响应头，后续 poll 时需要回传以维持同一会话
  const setCookieHeaders = response.headers.getSetCookie?.() || []
  const cookies = setCookieHeaders
    .map((h) => h.split(';')[0])
    .join('; ')

  return {
    url: body.data.url,
    qrcode_key: body.data.qrcode_key,
    cookies,
  }
}

/**
 * 轮询 B站 扫码登录状态
 *
 * API: GET https://passport.bilibili.com/x/passport-login/web/qrcode/poll
 *
 * 状态码说明：
 * - 86101: 未扫码 → pending
 * - 86090: 已扫码未确认 → scanned
 * - 86038: 二维码已失效 → expired
 * - 0: 登录成功 → success（同时返回 Set-Cookie 和 refresh_token）
 *
 * @param qrcodeKey - 二维码密钥
 * @param cookies - generate 请求返回的 Cookie（维持同一会话）
 * @returns 轮询结果（含 cookie 和 refresh_token 如果登录成功）
 */
export async function pollQrCode(qrcodeKey: string, cookies?: string): Promise<QrPollResult> {
  // 使用原始 fetch 以获取 Set-Cookie 响应头
  const url = `${PASSPORT_BASE}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`

  const headers: Record<string, string> = { ...DEFAULT_HEADERS }
  if (cookies) {
    headers['Cookie'] = cookies
  }

  const response = await fetch(url, {
    headers,
  })

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      message: `B站扫码轮询失败: HTTP ${response.status}`,
    })
  }

  const body = await response.json() as {
    code: number
    message: string
    data: {
      code: number
      message: string
      refresh_token?: string
      url?: string
    }
  }

  const dataCode = body.data?.code
  const message = body.data?.message || body.message || ''

  // 解析状态码
  let status: QrPollStatus
  switch (dataCode) {
    case 0:
      status = 'success'
      break
    case 86090:
      status = 'scanned'
      break
    case 86038:
      status = 'expired'
      break
    case 86101:
    default:
      status = 'pending'
      break
  }

  const result: QrPollResult = {
    status,
    rawCode: dataCode,
    message,
  }

  // 登录成功时，提取 Set-Cookie 和 refresh_token
  if (status === 'success') {
    // 从 Set-Cookie 响应头提取完整 Cookie 字符串
    const setCookieHeaders = response.headers.getSetCookie?.() || []
    if (setCookieHeaders.length > 0) {
      // 将 Set-Cookie 数组转换为 Cookie 字符串格式（key=value; key=value）
      result.cookie = setCookieHeaders
        .map((h) => h.split(';')[0]) // 取第一个分号前的 key=value
        .join('; ')
    }

    // refresh_token 在响应体中
    if (body.data?.refresh_token) {
      result.refreshToken = body.data.refresh_token
    }
  }

  return result
}

/**
 * 获取 B站 当前登录用户信息
 *
 * API: GET https://api.bilibili.com/x/web-interface/nav
 * 认证方式：仅可 Cookie (SESSDATA)
 *
 * @param cookie - B站 Cookie 字符串
 * @returns 用户信息
 */
export async function getNavUserInfo(cookie: string): Promise<BilibiliUserInfo> {
  try {
    const response = await bilibiliRequest<{
      isLogin: boolean
      mid: number
      uname: string
      face: string
    }>('/x/web-interface/nav', { cookie })

    const data = response.data as any
    return {
      mid: data.mid || 0,
      uname: data.uname || '',
      face: data.face || '',
      isLogin: data.isLogin || false,
    }
  } catch (err: any) {
    // code=-101 表示账号未登录，这是正常状态而非错误
    if (err.statusCode === 502 && err.message?.includes('-101')) {
      return { mid: 0, uname: '', face: '', isLogin: false }
    }
    throw err
  }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 格式化数字为中文单位（万、亿）
 */
export function formatCount(num: number): string {
  if (num >= 100000000) {
    return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '亿'
  }
  if (num >= 10000) {
    return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  }
  return String(num)
}

/**
 * 解析中文数字字符串为原始数值
 *
 * 支持格式：
 * - "1万+" → { value: 10000, hasPlus: true }
 * - "2.3万" → { value: 23000, hasPlus: false }
 * - "1.5亿" → { value: 150000000, hasPlus: false }
 * - "999"   → { value: 999, hasPlus: false }
 * - "1500+" → { value: 1500, hasPlus: true }
 *
 * @param str B站 API 返回的已格式化字符串
 * @returns 解析后的数值和是否有 "+" 后缀
 */
export function parseChineseNumber(str: string): { value: number; hasPlus: boolean } {
  const s = String(str).trim()
  if (!s || s === '0') return { value: 0, hasPlus: false }

  const hasPlus = s.endsWith('+')
  const cleaned = s.replace(/\+$/, '')

  // 亿
  if (cleaned.includes('亿')) {
    const num = parseFloat(cleaned.replace('亿', ''))
    return { value: Math.round(num * 100000000), hasPlus }
  }

  // 万
  if (cleaned.includes('万')) {
    const num = parseFloat(cleaned.replace('万', ''))
    return { value: Math.round(num * 10000), hasPlus }
  }

  // 普通数字
  const num = parseInt(cleaned, 10)
  return { value: Number.isNaN(num) ? 0 : num, hasPlus }
}

/**
 * 确保图片 URL 使用 HTTPS
 */
export function ensureHttps(url: string): string {
  if (!url) return url
  return url.replace(/^http:\/\//, 'https://')
}

/**
 * 按 BV 号对视频列表去重
 */
export function dedupByBvid<T extends { bvid: string }>(list: T[]): T[] {
  const seen = new Set<string>()
  return list.filter((item) => {
    if (seen.has(item.bvid)) return false
    seen.add(item.bvid)
    return true
  })
}

// ============================================================
// 直播相关
// ============================================================

const BILIBILI_LIVE_API_BASE = 'https://api.live.bilibili.com'

/** 直播 API 返回的房间条目 */
export interface LiveRoomRawItem {
  roomid: number
  uid: number
  uname: string
  title: string
  online: number
  cover: string
  user_cover?: string
  system_cover?: string
  face: string
  link: string
  area_v2_id?: number
  area_v2_name?: string
  area_name?: string
  parent_id?: number
  parent_area_id?: number
  parent_area_name?: string
  parent_name?: string
}

/** 直播分区导航项 */
export interface LiveAreaItem {
  id: number
  name: string
}

/**
 * 获取直播分区列表（一级分区）
 *
 * API: GET /room/v1/area/getList?parent_id=0&platform=web
 * 公开 GET，不需要 Cookie 和 WBI 签名。
 * 返回的一级分区字段：id, name, list（子分区数组）
 *
 * @returns 一级分区列表 [{ id, name }]
 */
export async function getLiveAreas(): Promise<LiveAreaItem[]> {
  try {
    const response = await $fetch<{
      code: number
      message: string
      data?: Array<{
        id: number
        name: string
        list?: Array<{ id: string; name: string }>
      }>
    }>(`${BILIBILI_LIVE_API_BASE}/room/v1/area/getList`, {
      params: { parent_id: '0', platform: 'web' },
      headers: DEFAULT_HEADERS,
      timeout: 5000,
    })

    if (response.code === 0 && Array.isArray(response.data)) {
      const areas: LiveAreaItem[] = []
      for (const item of response.data) {
        if (item.id !== undefined && item.id > 0 && item.name) {
          areas.push({ id: item.id, name: item.name })
        }
      }
      return areas
    }
  } catch (err: any) {
    console.warn('[getLiveAreas] 获取分区列表失败:', err.message || err)
  }

  return []
}

/**
 * 获取直播房间列表（按在线人数排序）
 *
 * API: GET /room/v3/area/getRoomList
 * 完全公开 GET，不需要 WBI 签名和 Cookie。
 *
 * @param opts.page - 页码（默认 1）
 * @param opts.pageSize - 每页条数（默认 30）
 * @param opts.parentAreaId - 一级分区 ID（可选，0 或 undefined 为全站）
 * @returns 直播房间条目数组
 */
export async function getLiveRoomList(options?: {
  page?: number
  pageSize?: number
  parentAreaId?: number
}): Promise<LiveRoomRawItem[]> {
  const params: Record<string, string | number> = {
    platform: 'web',
    page: options?.page ?? 1,
    page_size: options?.pageSize ?? 30,
    sort_type: 'online',
  }

  // parent_area_id=0 等同于不传（全站），传 undefined 避免无效参数
  if (options?.parentAreaId && options.parentAreaId > 0) {
    params.parent_area_id = options.parentAreaId
  }

  try {
    const response = await $fetch<{
      code: number
      message: string
      data?: {
        list?: LiveRoomRawItem[]
        count?: number
      }
    }>(`${BILIBILI_LIVE_API_BASE}/room/v3/area/getRoomList`, {
      params,
      headers: DEFAULT_HEADERS,
      timeout: 8000,
    })

    if (response.code === 0 && response.data?.list) {
      // 补充 link 字段（部分条目可能没有 link，或者 link 是相对路径 /5050）
      return response.data.list.map((room) => {
        let link = room.link || ''
        if (link && !link.startsWith('http')) {
          // 处理相对路径或协议相关路径
          link = link.startsWith('//')
            ? `https:${link}`
            : `https://live.bilibili.com${link.startsWith('/') ? link : `/${room.roomid}`}`
        } else if (!link) {
          link = `https://live.bilibili.com/${room.roomid}`
        }
        return {
          ...room,
          link,
          cover: ensureHttps(room.cover || room.user_cover || room.system_cover || ''),
        }
      })
    }

    console.warn('[getLiveRoomList] API 返回异常:', response.code, response.message)
  } catch (err: any) {
    console.warn('[getLiveRoomList] 请求失败:', err.message || err)
  }

  return []
}

/**
 * 按 roomid 对直播房间列表去重
 */
export function dedupByRoomid<T extends { roomid: number }>(list: T[]): T[] {
  const seen = new Set<number>()
  return list.filter((item) => {
    if (seen.has(item.roomid)) return false
    seen.add(item.roomid)
    return true
  })
}
