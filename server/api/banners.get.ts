/**
 * GET /api/banners
 *
 * 返回最新的 5 套 Banner 数据集
 * 7 天内存缓存，每周日由 refresh-banners 任务自动刷新
 */
import { loadAllBanners, getFallbackBanners } from '../utils/bannerData'

// 缓存状态（与 bannerData.ts 缓存独立，用于 X-Cache 头）
let lastLoadTime = 0

export default defineEventHandler(async (event) => {
  try {
    const banners = await loadAllBanners()

    // 设置缓存头
    const cacheAge = Date.now() - lastLoadTime
    if (cacheAge < 7 * 24 * 60 * 60 * 1000 && lastLoadTime > 0) {
      setResponseHeader(event, 'X-Cache', 'HIT')
    } else {
      setResponseHeader(event, 'X-Cache', 'MISS')
      lastLoadTime = Date.now()
    }

    if (banners.length > 0) {
      return banners
    }
  } catch {
    // 加载失败，返回 fallback
  }

  return getFallbackBanners()
})
