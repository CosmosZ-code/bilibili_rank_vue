/**
 * 排行榜数据拉取器
 *
 * 从 B站 API 获取排行榜 + 热门视频，合并去重后批量获取视频详情。
 * 供 API 路由（ranking.get.ts）和后台定时任务（cache-warmer）共同使用。
 */
import type { VideosDataMap } from '../../app/types'
import {
  getBilibiliRanking,
  getBilibiliPopular,
  getBilibiliOnlineCount,
  getBilibiliVideoStats,
  ensureHttps,
  dedupByBvid,
  formatCount,
} from './bilibili'

/** fetchRankingData 成功时的返回值 */
export interface RankingFetchResult {
  /** 合并去重后的视频数据字典 */
  data: VideosDataMap
  /** 在线人数获取失败的 BV 号列表（count_num === 0），通过 /x/player/online/total 重试 */
  failedBvids: string[]
  /** 封面链接为空或非 https 的 BV 号列表，通过 /x/web-interface/view 重试 */
  emptyPicBvids: string[]
  /** 播放量为 0 的 BV 号列表（排行榜视频不应为 0），通过 /x/web-interface/view 重试 */
  zeroStatBvids: string[]
  /** 排行接口是否失败（返回 0 条） */
  rankingFailed: boolean
  /** 热门接口是否失败（返回 0 条） */
  popularFailed: boolean
}

/** retryFailedVideos 的返回值 */
export interface RetryResult {
  data: VideosDataMap
  stillFailed: string[]
}

/** retryFailedMetadata 的返回值 */
export interface MetadataRetryResult {
  data: VideosDataMap
  stillEmptyPic: string[]
  stillZeroStat: string[]
}

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

/** 校验封面链接是否有效 */
function isValidPic(pic: string): boolean {
  return pic.length > 0 && pic.startsWith('https://')
}

/**
 * 批量拉取一批视频的在线人数
 */
async function fetchOnlineCountBatch(
  batch: Array<{ bvid: string; cid: number }>,
  apiTimeout: number,
): Promise<{
  results: Array<{ bvid: string; onlineCount: { formatted: string; raw: number } }>
  failedBvids: string[]
}> {
  const batchResults = await Promise.allSettled(
    batch.map(async (video) => {
      const cid = typeof video.cid === 'number' ? String(video.cid) : '0'
      const onlineCount = await withTimeout(
        getBilibiliOnlineCount(video.bvid, cid),
        apiTimeout,
        { formatted: '0', raw: 0 },
      )
      return { bvid: video.bvid, onlineCount }
    }),
  )

  const results: Array<{ bvid: string; onlineCount: { formatted: string; raw: number } }> = []
  const failedBvids: string[] = []

  for (const result of batchResults) {
    if (result.status === 'fulfilled') {
      results.push(result.value)
      if (result.value.onlineCount.raw === 0) {
        failedBvids.push(result.value.bvid)
      }
    }
  }

  return { results, failedBvids }
}

/**
 * 从 B站 API 拉取完整的排行榜数据
 *
 * 流程：
 * 1. 串行请求排行榜 → 热门（各 10 秒超时），可通过 skipRanking/skipPopular 跳过
 * 2. 合并 + 按 BV 号去重（如传入 existingData 则以此为起点覆盖）
 * 3. 批量获取每个视频的在线人数（每批 5 个）
 * 4. 校验封面链接和播放量有效性
 *
 * @param options.cookie - 可选，传入用户的 B站 Cookie 使热门结果个性化
 * @param options.skipRanking - 跳过排行拉取（保留 existingData 中已有数据）
 * @param options.skipPopular - 跳过热门拉取（保留 existingData 中已有数据）
 * @param options.existingData - 已有数据，新拉取结果会覆盖同 BVid 条目
 * @returns RankingFetchResult — 正常数据 + 失败追踪；null — B站完全不可用
 */
export async function fetchRankingData(options?: {
  cookie?: string
  skipRanking?: boolean
  skipPopular?: boolean
  existingData?: VideosDataMap
}): Promise<RankingFetchResult | null> {
  const apiTimeout = 10_000
  let rankingFailed = false
  let popularFailed = false

  // 1. 拉取热门（可跳过）—— 先行，为 ranking "预热" 连接
  let popular: RankingVideo[] = []
  if (!options?.skipPopular) {
    popular = await withTimeout(
      getBilibiliPopular(2, options?.cookie).catch(() => []),
      apiTimeout,
      [],
    )
    if (popular.length === 0) popularFailed = true

    // 热门和排行之间间隔 1 秒
    await new Promise((r) => setTimeout(r, 1000))
  }

  // 2. 拉取排行榜（可跳过）
  let ranking: RankingVideo[] = []
  if (!options?.skipRanking) {
    ranking = await withTimeout(
      getBilibiliRanking().catch(() => []),
      apiTimeout,
      [],
    )
    if (ranking.length === 0) rankingFailed = true
  }

  // 3. 合并 + 去重
  const merged = dedupByBvid([...ranking, ...popular])

  if (merged.length === 0 && (!options?.existingData || Object.keys(options.existingData).length === 0)) {
    return null
  }

  // 4. 批量获取新视频详情（以 existingData 为起点，新数据覆盖同 BVid）
  const results: VideosDataMap = options?.existingData ? { ...options.existingData } : {}
  const allFailedBvids: string[] = []
  const allEmptyPicBvids: string[] = []
  const allZeroStatBvids: string[] = []
  const maxResults = Math.min(merged.length, 200)

  for (let i = 0; i < maxResults; i += 5) {
    const batch = merged.slice(i, i + 5)
    const { results: batchResults, failedBvids } = await fetchOnlineCountBatch(batch, apiTimeout)

    allFailedBvids.push(...failedBvids)

    for (const item of batchResults) {
      const video = merged.find((v) => v.bvid === item.bvid)
      if (!video) continue

      const statView = video.stat?.view || 0
      const statDanmaku = video.stat?.danmaku || 0

      // 封面链接有效性校验
      const pic = ensureHttps(video.pic || '')
      if (!isValidPic(pic)) {
        allEmptyPicBvids.push(item.bvid)
      }

      // 播放量校验（排行榜视频不应为 0）
      if (statView === 0) {
        allZeroStatBvids.push(item.bvid)
      }

      results[item.bvid] = {
        title: video.title || '',
        owner: video.owner?.name || '',
        mid: String(video.owner?.mid || ''),
        pic,
        online_count: item.onlineCount.formatted,
        count_num: item.onlineCount.raw,
        play_count_num: statView,
        danmaku_count_num: statDanmaku,
        play_count: formatCount(statView),
        danmaku_count: formatCount(statDanmaku),
      }
    }
  }

  return {
    data: results,
    failedBvids: allFailedBvids,
    emptyPicBvids: allEmptyPicBvids,
    zeroStatBvids: allZeroStatBvids,
    rankingFailed: options?.skipRanking ? false : rankingFailed,
    popularFailed: options?.skipPopular ? false : popularFailed,
  }
}

/**
 * 重试获取失败视频的在线人数，并将成功结果合并回已有数据
 */
export async function retryFailedVideos(
  failedBvids: string[],
  existingData: VideosDataMap,
): Promise<RetryResult> {
  const apiTimeout = 10_000
  const stillFailed: string[] = []

  const validBvids = failedBvids.filter((bvid) => bvid in existingData)
  if (validBvids.length === 0) {
    return { data: { ...existingData }, stillFailed: [] }
  }

  const mergedData = { ...existingData }

  for (let i = 0; i < validBvids.length; i += 5) {
    const batch = validBvids.slice(i, i + 5)
    const batchVideos = batch.map((bvid) => ({ bvid, cid: 0 }))
    const { results: batchResults, failedBvids: batchFailed } = await fetchOnlineCountBatch(
      batchVideos,
      apiTimeout,
    )

    stillFailed.push(...batchFailed)

    for (const item of batchResults) {
      if (item.onlineCount.raw > 0 && mergedData[item.bvid]) {
        mergedData[item.bvid] = {
          ...mergedData[item.bvid],
          online_count: item.onlineCount.formatted,
          count_num: item.onlineCount.raw,
        }
      }
    }
  }

  return { data: mergedData, stillFailed }
}

/**
 * 重试获取失败视频的元数据（封面链接、播放量、弹幕数）
 *
 * 通过 /x/web-interface/view 逐个请求（避免批量触发 B站封锁），
 * 一次请求同时提取 pic + stat.view + stat.danmaku，
 * 只覆盖空/零字段，已有有效值的保留不动。
 *
 * @param emptyPicBvids - 封面链接无效的 BV 号列表
 * @param zeroStatBvids - 播放量为 0 的 BV 号列表
 * @param existingData - 当前缓存中的完整数据
 */
export async function retryFailedMetadata(
  emptyPicBvids: string[],
  zeroStatBvids: string[],
  existingData: VideosDataMap,
): Promise<MetadataRetryResult> {
  const stillEmptyPic: string[] = []
  const stillZeroStat: string[] = []

  // 合并去重需要重试的 BVid
  const allBvids = [...new Set([...emptyPicBvids, ...zeroStatBvids])]
  const validBvids = allBvids.filter((bvid) => bvid in existingData)

  if (validBvids.length === 0) {
    return { data: { ...existingData }, stillEmptyPic: [], stillZeroStat: [] }
  }

  const mergedData = { ...existingData }
  const apiTimeout = 8_000

  // 逐个请求，避免批量触发 B站封锁
  for (const bvid of validBvids) {
    try {
      const stats = await withTimeout(
        getBilibiliVideoStats(bvid),
        apiTimeout,
        { playCountNum: 0, danmakuCountNum: 0, playCount: '0', danmakuCount: '0', pic: '' },
      )

      if (!mergedData[bvid]) continue

      let updated = false

      // 修复封面链接（空 → 有效值）
      if (!isValidPic(mergedData[bvid].pic) && isValidPic(stats.pic)) {
        mergedData[bvid] = { ...mergedData[bvid], pic: stats.pic }
        updated = true
      }

      // 修复播放量（0 → 有效值）
      if (mergedData[bvid].play_count_num === 0 && stats.playCountNum > 0) {
        mergedData[bvid] = {
          ...mergedData[bvid],
          play_count_num: stats.playCountNum,
          play_count: stats.playCount,
        }
        updated = true
      }

      // 修复弹幕数（0 → 有效值）——仅在播放量也被修复或弹幕数本身为 0 时
      if (mergedData[bvid].danmaku_count_num === 0 && stats.danmakuCountNum > 0) {
        mergedData[bvid] = {
          ...mergedData[bvid],
          danmaku_count_num: stats.danmakuCountNum,
          danmaku_count: stats.danmakuCount,
        }
        updated = true
      }

      if (updated) {
        console.log(`[retryFailedMetadata] 元数据已恢复: ${bvid}`)
      }

      // 检查是否仍在失败列表中
      if (!isValidPic(mergedData[bvid].pic)) {
        stillEmptyPic.push(bvid)
      }
      if (mergedData[bvid].play_count_num === 0) {
        stillZeroStat.push(bvid)
      }
    } catch {
      // 单个视频重试失败，保持原数据
      if (emptyPicBvids.includes(bvid)) stillEmptyPic.push(bvid)
      if (zeroStatBvids.includes(bvid)) stillZeroStat.push(bvid)
    }
  }

  return { data: mergedData, stillEmptyPic, stillZeroStat }
}

/**
 * 获取用户个性化的热门视频（仅增量部分）
 *
 * 与全局 ranking:latest 对比，排除已存在的 BV 号，
 * 只返回该用户独有（不在全局排行中）的新视频。
 *
 * @param cookie - 用户的 B站 Cookie
 * @returns VideosDataMap — 仅包含增量视频；null — 拉取失败或 cookie 无效
 */
export async function fetchPersonalizedOnly(cookie: string): Promise<VideosDataMap | null> {
  const apiTimeout = 10_000

  // 1. 拉取全局缓存，获取已有 BV 号集合
  const globalCache = await useStorage('cache').getItem<{
    data: VideosDataMap
    timestamp: number
  }>('ranking:latest')

  const existingBvids = new Set(
    globalCache?.data ? Object.keys(globalCache.data) : [],
  )

  // 2. 拉取用户个性化热门
  const popular = await withTimeout(
    getBilibiliPopular(2, cookie).catch(() => []),
    apiTimeout,
    [],
  )

  if (popular.length === 0) return null

  // 3. 排除全局已有的视频
  const newVideos = popular.filter((v) => !existingBvids.has(v.bvid))
  if (newVideos.length === 0) return {}

  // 4. 批量获取在线人数
  const results: VideosDataMap = {}
  const maxResults = Math.min(newVideos.length, 20) // 增量最多 20 个

  for (let i = 0; i < maxResults; i += 5) {
    const batch = newVideos.slice(i, i + 5)
    const { results: batchResults } = await fetchOnlineCountBatch(batch, apiTimeout)

    for (const item of batchResults) {
      const video = newVideos.find((v) => v.bvid === item.bvid)
      if (!video) continue

      const statView = video.stat?.view || 0
      const statDanmaku = video.stat?.danmaku || 0
      const pic = ensureHttps(video.pic || '')

      results[item.bvid] = {
        title: video.title || '',
        owner: video.owner?.name || '',
        mid: String(video.owner?.mid || ''),
        pic,
        online_count: item.onlineCount.formatted,
        count_num: item.onlineCount.raw,
        play_count_num: statView,
        danmaku_count_num: statDanmaku,
        play_count: formatCount(statView),
        danmaku_count: formatCount(statDanmaku),
      }
    }
  }

  return results
}
