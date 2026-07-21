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

/**
 * 获取 B站 API 基础 URL
 *
 * 优先使用代理地址（国内 VPS），否则直连。
 * 代理 URL 通过 NUXT_PROXY_URL 环境变量配置。
 */
function getApiBase(): string {
  const config = useRuntimeConfig()
  if (config.proxy?.url) {
    return config.proxy.url
  }
  return 'https://api.bilibili.com'
}

/**
 * 获取代理认证头（如果配置了代理）
 */
function getProxyHeaders(): Record<string, string> {
  const config = useRuntimeConfig()
  if (config.proxy?.url && config.proxy?.authKey) {
    return { 'X-Proxy-Auth': config.proxy.authKey }
  }
  return {}
}

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

    if (res.code === 0 && res.data?.wbi_img) {
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
  } catch (err: any) {
    console.warn('[bilibili] fetchWbiKeys 失败:', err?.message || err)
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
// ============================================================
// 纯 JavaScript MD5 实现（RFC 1321）
// Cloudflare Workers 不提供 node:crypto 和 Web Crypto MD5
// ============================================================

function md5Hex(str: string): string {
  const bytes = new TextEncoder().encode(str)
  const words = md5Raw(bytes)
  // 小端序转 hex
  let hex = ''
  for (const w of words) {
    hex += (w >>> 0).toString(16).padStart(8, '0')
  }
  return hex
}

function md5Raw(input: Uint8Array): number[] {
  const msgLen = input.length

  // 填充：追加 0x80，补零到 (length + 8) % 64 === 0，最后 8 字节为原始长度（bit，小端序）
  const paddedLen = (((msgLen + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLen)
  padded.set(input)
  padded[msgLen] = 0x80

  // 写入原始长度（bit，小端序 64-bit）
  const bitLen = msgLen * 8
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLen - 8, bitLen & 0xffffffff, true)
  view.setUint32(paddedLen - 4, (bitLen / 0x100000000) & 0xffffffff, true)

  // 初始化 MD5 缓冲区
  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476

  // 正弦表
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9,  14, 20, 5, 9,  14, 20, 5, 9,  14, 20, 5, 9,  14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]

  // K 表
  const K = new Uint32Array(64)
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)
  }

  // 处理每个 512-bit 块
  for (let offset = 0; offset < paddedLen; offset += 64) {
    const M = new Uint32Array(16)
    const blockView = new DataView(padded.buffer, offset, 64)
    for (let i = 0; i < 16; i++) {
      M[i] = blockView.getUint32(i * 4, true)
    }

    let aa = a
    let bb = b
    let cc = c
    let dd = d

    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (bb & cc) | (~bb & dd)
        g = i
      } else if (i < 32) {
        f = (dd & bb) | (~dd & cc)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = bb ^ cc ^ dd
        g = (3 * i + 5) % 16
      } else {
        f = cc ^ (bb | ~dd)
        g = (7 * i) % 16
      }

      f = (f + aa + K[i] + M[g]) >>> 0
      aa = dd
      dd = cc
      cc = bb
      bb = (bb + ((f << S[i]) | (f >>> (32 - S[i])))) >>> 0
    }

    a = (a + aa) >>> 0
    b = (b + bb) >>> 0
    c = (c + cc) >>> 0
    d = (d + dd) >>> 0
  }

  return [a, b, c, d]
}

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
  const queryParts = sortedKeys.map(
    (key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(allParams[key]))}`,
  )
  const queryString = queryParts.join('&')

  // MD5(query_string + mixin_key)
  const wRid = md5Hex(queryString + mixinKey)

  return { w_rid: wRid, wts }
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
  },
): Promise<BilibiliResponse<T>> {
  const headers: Record<string, string> = { ...DEFAULT_HEADERS, ...getProxyHeaders() }

  if (options?.cookie) {
    headers['Cookie'] = options.cookie
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

  const url = new URL(path, getApiBase())

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  }

  try {
    const response = await $fetch<BilibiliResponse<T>>(url.toString(), {
      headers,
      method: options?.method || 'GET',
      timeout: 8000,
    })

    if (response.code !== 0) {
      console.error(`[bilibili] API 错误 ${path}: code=${response.code} message=${response.message}`)
      throw createError({
        statusCode: 502,
        statusMessage: `B站API错误 [${response.code}]: ${response.message}`,
      })
    }

    return response
  } catch (err: any) {
    if (err.statusCode === 502) throw err // 重新抛出已处理的 B站业务错误
    console.error(`[bilibili] 请求失败 ${path}:`, err?.message || err)
    throw err
  }
}

// ============================================================
// 排行榜相关
// ============================================================

/** B站排行榜 API 返回的视频项 */
interface RankingVideo {
  bvid: string
  cid: number
  title: string
  pic: string
  owner: { name: string; mid: number }
  stat?: { view: number; danmaku: number }
}

/**
 * 获取 B站排行榜视频列表（全站榜 rid=0）
 *
 * API: GET /x/web-interface/ranking/v2
 * 参数: rid=0（全站）, type=all（全部）
 */
export async function getBilibiliRanking(): Promise<RankingVideo[]> {
  const response = await bilibiliRequest<{ list: RankingVideo[] }>(
    '/x/web-interface/ranking/v2',
    {
      params: { rid: '0', type: 'all', web_location: '1550101' },
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
export async function getBilibiliPopular(pages: number = 4): Promise<RankingVideo[]> {
  const results: RankingVideo[] = []

  for (let pn = 1; pn <= pages; pn++) {
    const response = await bilibiliRequest<{ list: RankingVideo[] }>(
      '/x/web-interface/popular',
      {
        params: { pn: String(pn), ps: '50' },
      },
    )
    const data = response.data as any
    const list = data.list || data || []
    results.push(...list)

    if (list.length < 50) break
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
	    const raw = parseInt(String(total).replace(/[^0-9]/g, ''), 10) || 0

	    // 观看人数 >= 1000 时追加 "+" 后缀，表示"超过"
	    const formatted = formatCount(raw) + (raw >= 1000 ? '+' : '')

	    return { formatted, raw }
  } catch {
    return { formatted: '0', raw: 0 }
  }
}

/**
 * 获取视频播放量和弹幕数
 *
 * API: GET /x/web-interface/view
 * 参数: bvid
 */
export async function getBilibiliVideoStats(bvid: string): Promise<{
  playCountNum: number
  danmakuCountNum: number
  playCount: string
  danmakuCount: string
  cid: number
}> {
  try {
    const response = await bilibiliRequest<{
      stat?: { view: number; danmaku: number }
      cid?: number
    }>('/x/web-interface/view', {
      params: { bvid },
      wbiSign: false, // /x/web-interface/view 是公开接口，不需要 WBI 签名
    })

    const stat = response.data?.stat
    const play = stat?.view || 0
    const danmaku = stat?.danmaku || 0

    return {
      playCountNum: play,
      danmakuCountNum: danmaku,
      playCount: formatCount(play),
      danmakuCount: formatCount(danmaku),
      cid: response.data?.cid || 0,
    }
  } catch (err: any) {
    console.warn(`[getBilibiliVideoStats] 获取视频 ${bvid} 数据失败:`, err.message || err)
    return {
      playCountNum: 0,
      danmakuCountNum: 0,
      playCount: '0',
      danmakuCount: '0',
      cid: 0,
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
// 批量查询（减少 Workers 子请求次数）
// ============================================================

/**
 * 批量获取视频详情（在线人数 + 播放量/弹幕）
 *
 * 通过代理的 /proxy-batch 接口一次查询多个 BV 号，
 * 避免 Cloudflare Workers 50 次子请求限制。
 */
export async function getBatchDetails(
  bvids: string[],
): Promise<
  Record<string, {
    online: { formatted: string; raw: number }
    stats: { playCountNum: number; danmakuCountNum: number; playCount: string; danmakuCount: string; cid: number }
  }>
> {
  if (bvids.length === 0) return {}

  const baseUrl = getApiBase()
  const url = new URL('/proxy-batch', baseUrl).toString()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getProxyHeaders(),
  }

  try {
    const result = await $fetch<Record<string, any>>(url, {
      method: 'POST',
      headers,
      body: { bvids },
      timeout: 15_000,
    })
    return result || {}
  } catch {
    // 批量接口不可用时返回空（调用方应 fallback 到单个请求）
    console.warn('[getBatchDetails] /proxy-batch 请求失败，请确认代理已更新')
    return {}
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
