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
  getBatchDetails,
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
    withTimeout(
      getBilibiliRanking().catch((err) => {
        console.error('[ranking] 排行榜 API 失败:', err?.message || err)
        return []
      }),
      apiTimeout,
      [],
    ),
    withTimeout(
      getBilibiliPopular(2).catch((err) => {
        console.error('[ranking] 热门 API 失败:', err?.message || err)
        return []
      }),
      apiTimeout,
      [],
    ),
  ])

  // 3. 合并 + 去重
  const merged = dedupByBvid([...ranking, ...popular])

  // 如果 B站 API 完全不可用，使用 mock 降级数据
  if (merged.length === 0) {
    setResponseHeader(event, 'X-Cache', 'MOCK')
    setResponseHeader(event, 'X-Data-Source', 'mock')
    return MOCK_RANKING
  }

  // 4. 逐个获取视频详情
  const results: VideosDataMap = {}
  const maxResults = Math.min(merged.length, 200)

  let diagOk = 0, diagOnlineZero = 0, diagViewZero = 0, diagBothZero = 0

  for (let i = 0; i < maxResults; i += 5) {
    const batch = merged.slice(i, i + 5)
    const bvids = batch.map((v) => v.bvid)

    // 一次请求查询整批（绕开 Workers 50 子请求限制）
    const batchData = await getBatchDetails(bvids)

    for (const video of batch) {
      const detail = batchData[video.bvid]
      if (detail) {
        const onlineOk = detail.online.raw > 0
        const viewOk = detail.stats.playCountNum > 0
        if (onlineOk && viewOk) diagOk++
        else if (!onlineOk && !viewOk) diagBothZero++
        else if (!onlineOk) diagOnlineZero++
        else diagViewZero++

        results[video.bvid] = {
          title: video.title || '',
          owner: video.owner?.name || '',
          mid: String(video.owner?.mid || ''),
          pic: ensureHttps(video.pic || ''),
          online_count: detail.online.formatted,
          count_num: detail.online.raw,
          play_count_num: detail.stats.playCountNum,
          danmaku_count_num: detail.stats.danmakuCountNum,
          play_count: detail.stats.playCount,
          danmaku_count: detail.stats.danmakuCount,
        }
      }
    }
  }

  // 写入缓存
  await useStorage('cache').setItem(cacheKey, {
    data: results,
    timestamp: Date.now(),
  })

  const batchCount = Math.ceil(maxResults / 5)
  console.log(`[ranking] merged=${merged.length} max=${maxResults} batches=${batchCount} ok=${diagOk} onlineZero=${diagOnlineZero} viewZero=${diagViewZero} bothZero=${diagBothZero}`)

  setResponseHeader(event, 'X-Cache', 'MISS')
  setResponseHeader(event, 'X-Diag', `ok=${diagOk} onlineZero=${diagOnlineZero} viewZero=${diagViewZero} bothZero=${diagBothZero}`)
  return results
})
