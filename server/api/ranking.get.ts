/**
 * GET /api/ranking
 *
 * 获取 B站实时在线观看人数排行榜
 * 缓存 5 分钟，减少对 B站 API 的请求频率
 * 每个 B站 API 调用有 10 秒超时，防止拖垮响应
 */
import type { CacheEntry, VideosDataMap } from '../../app/types'
import {
  getBilibiliRanking,
  getBilibiliPopular,
  getBilibiliOnlineCount,
  getBilibiliVideoStats,
  ensureHttps,
  dedupByBvid,
} from '../utils/bilibili'
import { MOCK_RANKING } from '../utils/mockData'

/** 带超时的 Promise 包装 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(fallback)
    }, ms)
    promise
      .then((val) => {
        clearTimeout(timer)
        resolve(val)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(fallback)
      })
  })
}

export default defineEventHandler(async (event) => {
  const cacheKey = 'ranking:latest'
  const cacheTTL = 5 * 60 * 1000 // 5 minutes
  const apiTimeout = 10_000 // 10 seconds per B站 API call

  // 1. 检查缓存
  const cached = await useStorage('cache').getItem<CacheEntry<VideosDataMap>>(cacheKey)

  if (cached && Date.now() - cached.timestamp < cacheTTL) {
    setResponseHeader(event, 'X-Cache', 'HIT')
    return cached.data
  }

  // 2. 并发请求排行榜 + 热门（带超时）
  const [ranking, popular] = await Promise.all([
    withTimeout(getBilibiliRanking().catch(() => []), apiTimeout, []),
    withTimeout(getBilibiliPopular(2).catch(() => []), apiTimeout, []),
  ])

  // 3. 合并 + 去重
  const merged = dedupByBvid([...ranking, ...popular])

  // 如果 B站 API 完全不可用，使用 mock 降级数据
  if (merged.length === 0) {
    setResponseHeader(event, 'X-Cache', 'MOCK')
    setResponseHeader(event, 'X-Data-Source', 'mock')
    return MOCK_RANKING
  }

  // 4. 如果 B站 API 完全不可用，返回空对象（而不是一直等待）
  const results: VideosDataMap = {}
  const maxResults = Math.min(merged.length, 200) // 最多 200 条

  for (let i = 0; i < maxResults; i += 5) {
    const batch = merged.slice(i, i + 5)
    const batchResults = await Promise.allSettled(
      batch.map(async (video) => {
        const cid = typeof video.cid === 'number' ? String(video.cid) : '0'

        const [onlineCount, stats] = await Promise.all([
          withTimeout(
            getBilibiliOnlineCount(video.bvid, cid),
            apiTimeout,
            { formatted: '0', raw: 0 },
          ),
          withTimeout(
            getBilibiliVideoStats(video.bvid),
            apiTimeout,
            { playCountNum: 0, danmakuCountNum: 0, playCount: '0', danmakuCount: '0' },
          ),
        ])

        return {
          bvid: video.bvid,
          data: {
            title: video.title || '',
            owner: video.owner?.name || '',
            mid: String(video.owner?.mid || ''),
            pic: ensureHttps(video.pic || ''),
            online_count: onlineCount.formatted,
            count_num: onlineCount.raw,
            play_count_num: stats.playCountNum,
            danmaku_count_num: stats.danmakuCountNum,
            play_count: stats.playCount,
            danmaku_count: stats.danmakuCount,
          },
        }
      }),
    )

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results[result.value.bvid] = result.value.data
      }
    }
  }

  // 5. 写入缓存（即使完全空也缓存，避免每次请求都等待）
  await useStorage('cache').setItem(cacheKey, {
    data: results,
    timestamp: Date.now(),
  })

  setResponseHeader(event, 'X-Cache', 'MISS')
  return results
})
