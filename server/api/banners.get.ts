/**
 * GET /api/banners
 *
 * 纯缓存读取 — 数据由 banner-warmer 插件写入 useStorage('cache')['banners']。
 * 缓存为空时返回 CDN 兜底数据。
 */
import type { BannerDataSet } from '../../app/types'
import { getFallbackBanners } from '../utils/bannerData'

interface BannerCacheEntry {
  data: BannerDataSet[]
  timestamp: number
}

export default defineEventHandler(async (event) => {
  const cached = await useStorage('cache').getItem<BannerCacheEntry>('banners')

  if (cached && cached.data && cached.data.length > 0) {
    setResponseHeader(event, 'X-Cache', 'HIT')
    return cached.data
  }

  // 缓存为空（首次启动、预热尚未完成）→ 返回兜底数据
  setResponseHeader(event, 'X-Cache', 'EMPTY')
  return getFallbackBanners()
})
