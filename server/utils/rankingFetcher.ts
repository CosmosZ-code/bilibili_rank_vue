/**
 * 排行榜数据拉取器
 *
 * 从 B站 API 获取排行榜 + 热门视频，合并去重后批量获取视频详情。
 * 供 API 路由（ranking.get.ts）和后台定时任务（cache-warmer）共同使用。
 */
import type { VideosDataMap, VideoWithBvid, VideoInfo } from '../../app/types'
import type { RankingVideo } from './bilibili'
import {
  getBilibiliRanking,
  getBilibiliPopular,
  getBilibiliOnlineCount,
  getBilibiliVideoStats,
  ensureHttps,
  formatCount,
} from './bilibili'
import {
  COMBINED_CACHE_KEY,
  VALID_RANKING_RIDS,
  OFF_RANKING_KEEP_THRESHOLD,
  OFF_RANKING_RETAIN_TTL,
  MIN_ONLINE_COUNT,
  ONLINE_BATCH_DELAY_MS,
  ONLINE_BATCH_DELAY_JITTER_MS,
  METADATA_RETRY_DELAY_MS,
} from './rankingConstants'

/**
 * 对 VideosDataMap 进行排序、搜索过滤、净化过滤，返回 VideoWithBvid[]
 *
 * 用于 /api/ranking 分页接口的服务端数据处理。
 * 排序：count_num 降序，相同则 bvid 升序（保证跨页稳定）。
 *
 * @param dataMap - 从缓存中读取的原始 VideosDataMap
 * @param opts.sortBy - 排序方式（默认 'count'）
 * @param opts.search - 搜索关键词（大小写不敏感，匹配 title / owner）
 * @param opts.purifyPercent - 净化阈值（0 = 不过滤）
 */
export function sortAndFilterRanking(
  dataMap: VideosDataMap,
  opts: { sortBy?: string; search?: string; purifyPercent?: number } = {},
): VideoWithBvid[] {
  let list: VideoWithBvid[] = Object.entries(dataMap).map(([bvid, info]) => ({
    bvid,
    ...info,
  }))

  // 排序
  if (opts.sortBy !== 'count') {
    // 未来可扩展其他排序方式
  }
  list.sort((a, b) => {
    const diff = b.count_num - a.count_num
    if (diff !== 0) return diff
    // 二级排序：bvid 升序保证跨页稳定
    return a.bvid.localeCompare(b.bvid)
  })

  // 搜索过滤
  const term = (opts.search || '').trim().toLowerCase()
  if (term) {
    list = list.filter(
      (v) => v.title.toLowerCase().includes(term) || v.owner.toLowerCase().includes(term),
    )
  }

  // 净化过滤
  const purifyPercent = opts.purifyPercent ?? 0
  if (purifyPercent > 0) {
    list = list.filter((v) => {
      if (v.danmaku_count_num > 10000) return true
      return v.danmaku_count_num * 66 >= (v.play_count_num * purifyPercent) / 100
    })
  }

  return list
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

/**
 * 批间随机延迟：基础间隔 + 抖动
 *
 * 固定间隔会形成规律性请求模式，更容易被 B站 风控识别；
 * 在基础值上叠加随机抖动模拟真实用户节奏。默认用于在线人数
 * 批量请求（每批 5 并发），也可传入自定义基础值（如 /view 串行重试）。
 */
function batchDelay(
  ms: number = ONLINE_BATCH_DELAY_MS,
  jitter: number = ONLINE_BATCH_DELAY_JITTER_MS,
): Promise<void> {
  const delay = ms + Math.floor(Math.random() * (jitter + 1))
  return new Promise((resolve) => setTimeout(resolve, delay))
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

// ============================================================
// 分区缓存（PartitionCache）相关
// ============================================================

/**
 * 分区缓存条目结构
 *
 * - data: 该分区完整排行列表（含在线人数，未拉到则 count_num=0）
 * - timestamp: 列表拉取时间
 * - onlineAt: bvid → 在线人数拉取时间戳（用于新鲜度判断）
 * - cids: bvid → cid（在线人数接口必需参数，从列表数据保存）
 */
export interface PartitionCacheEntry {
  data: VideosDataMap
  timestamp: number
  onlineAt: Record<string, number>
  cids?: Record<string, number>
}

/**
 * 个性化缓存条目结构
 *
 * - data: 该用户个性化增量视频（含在线人数）
 * - timestamp: 缓存写入时间（TTL 续期基准）
 * - cids: bvid → cid（在线人数接口必需参数，供保留视频续期拉取）
 */
export interface PersonalizedCacheEntry {
  data: VideosDataMap
  timestamp: number
  cids?: Record<string, number>
}

/**
 * 由列表数据构建 VideoInfo（无在线人数，count_num=0）
 */
export function buildVideoInfoFromList(video: RankingVideo): VideoInfo {
  const statView = video.stat?.view || 0
  const statDanmaku = video.stat?.danmaku || 0
  return {
    title: video.title || '',
    owner: video.owner?.name || '',
    mid: String(video.owner?.mid || ''),
    pic: ensureHttps(video.pic || ''),
    online_count: '0',
    count_num: 0,
    play_count_num: statView,
    danmaku_count_num: statDanmaku,
    play_count: formatCount(statView),
    danmaku_count: formatCount(statDanmaku),
  }
}

/**
 * 剔除在线人数低于阈值的视频（缓存瘦身）
 *
 * count_num < minOnline 的一律移除（含 0：未拉到人数的视频也剔除，
 * 拉到确认 ≥ 阈值后再重新入缓存）。调用方需同步清理 onlineAt/cids 中对应键。
 *
 * @param map - 待过滤的 VideosDataMap
 * @param minOnline - 保留最低在线人数（默认 MIN_ONLINE_COUNT）
 */
export function filterLowOnlineVideos(
  map: VideosDataMap,
  minOnline: number = MIN_ONLINE_COUNT,
): VideosDataMap {
  const result: VideosDataMap = {}
  for (const [bvid, info] of Object.entries(map)) {
    if (info.count_num < minOnline) continue
    result[bvid] = info
  }
  return result
}

/**
 * 合并分区缓存（防累积核心逻辑）
 *
 * - newList 为底（该分区当前完整排行，覆盖）
 * - 仍在列表中的视频：保留旧在线人数（count_num > 0 且未被本轮覆盖时）
 * - 离开排行的视频：在线人数 ≥ keepThreshold（默认 1000）才保留
 *   （热门视频可能短暂跌出榜单，保留避免误移除；< 阈值则移除防累积）
 * - 覆盖本轮新拉到的在线人数
 * - 最终剔除在线人数 < MIN_ONLINE_COUNT 的视频（缓存瘦身）
 * - cids 合并：旧值保留 + 新列表覆盖
 *
 * 离开排行保留条目的生命周期（防冻结核心逻辑）：
 * - 保留期限：onlineAt 超过 retainTtl 未刷新 → 强制淘汰（TTL 兜底）
 * - 轮转刷新（newOnline 覆盖，不在 newList 中的条目）：
 *   - 新值 ≥ keepThreshold → 更新数据并续期 onlineAt
 *   - 新值 ∈ (0, keepThreshold) → 热度消退，淘汰
 *   - 新值 = 0（拉取失败/接口错误）→ 保留旧值 + 旧 onlineAt（保持 stale 待重试，不误删）
 *
 * @param newList - 本轮拉取的完整列表（count_num=0）
 * @param oldCache - 旧分区缓存（可能为 null）
 * @param newOnline - 本轮拉到的在线人数数据（含保留条目的刷新值）
 * @param now - 当前时间戳
 * @param keepThreshold - 离开排行保留阈值（默认 500）
 * @param retainTtl - 离开排行保留期限（默认 OFF_RANKING_RETAIN_TTL）
 */
export function mergePartitionCache(
  newList: VideosDataMap,
  oldCache: PartitionCacheEntry | null,
  newOnline: VideosDataMap,
  now: number = Date.now(),
  keepThreshold: number = OFF_RANKING_KEEP_THRESHOLD,
  retainTtl: number = OFF_RANKING_RETAIN_TTL,
): PartitionCacheEntry {
  const data: VideosDataMap = { ...newList }
  const onlineAt: Record<string, number> = {}
  const cids: Record<string, number> = { ...(oldCache?.cids || {}) }

  // 保留旧在线人数（仍在列表中、未被本轮覆盖）
  if (oldCache) {
    for (const [bvid, info] of Object.entries(oldCache.data)) {
      if (data[bvid]) {
        // 仍在列表中：保留旧在线人数（未被本轮覆盖时）
        if (info.count_num > 0 && !newOnline[bvid]) {
          data[bvid] = {
            ...data[bvid],
            online_count: info.online_count,
            count_num: info.count_num,
          }
          if (oldCache.onlineAt[bvid]) {
            onlineAt[bvid] = oldCache.onlineAt[bvid]
          }
        }
      } else if (
        info.count_num >= keepThreshold &&
        (!oldCache.onlineAt[bvid] || now - oldCache.onlineAt[bvid] < retainTtl)
      ) {
        // 离开排行但在线人数 ≥ 阈值且未超过保留期限：保留（热门视频可能短暂跌出榜单）
        data[bvid] = info
        if (oldCache.onlineAt[bvid]) {
          onlineAt[bvid] = oldCache.onlineAt[bvid]
        }
      }
      // 离开排行且（在线人数 < 阈值 或 超过保留期限）→ 移除（不进入 data，防累积）
    }
  }

  // 本轮新拉的在线人数覆盖
  for (const [bvid, info] of Object.entries(newOnline)) {
    if (data[bvid]) {
      // 保留条目（不在本轮列表中）：刷新后低于保留阈值 → 淘汰
      // raw=0（拉取失败）→ 保留旧值（不覆盖、不续期，保持 stale 待下轮重试）
      if (!newList[bvid] && info.count_num < keepThreshold) {
        if (info.count_num === 0) continue
        delete data[bvid]
        delete onlineAt[bvid]
        continue
      }
      data[bvid] = {
        ...data[bvid],
        online_count: info.online_count,
        count_num: info.count_num,
      }
      onlineAt[bvid] = now
    }
  }

  // 剔除在线人数 < 阈值的视频（瘦身），并清理其 onlineAt
  for (const bvid of Object.keys(data)) {
    if (data[bvid].count_num < MIN_ONLINE_COUNT) {
      delete data[bvid]
      delete onlineAt[bvid]
    }
  }

  return { data, timestamp: now, onlineAt, cids }
}

// ============================================================
// 在线人数目标选择（跨 rid 去重 + 弹幕量预筛选 + 轮转采样）
// ============================================================

/**
 * 跨 rid 去重：保留较小 rid 的版本（如 0、2 重复保留 0）
 *
 * 按 VALID_RANKING_RIDS 升序遍历（0 全站最先），同一 bvid 首次出现即保留，
 * 后续分区中的重复条目不再覆盖。全站 rid=0 的视频在去重池中占主导，
 * 只有全站独有的视频（不出现在任何分区列表）才由其自身贡献。
 *
 * @param perRidVideos - 分区 → 视频列表（正常模式来自本轮拉取，退避模式来自分区缓存）
 * @returns 去重后的全局候选列表
 */
export function dedupRankingVideos(perRidVideos: Record<string, RankingVideo[]>): RankingVideo[] {
  const map = new Map<string, RankingVideo>()
  for (const rid of VALID_RANKING_RIDS) {
    for (const video of perRidVideos[rid] || []) {
      if (!map.has(video.bvid)) {
        map.set(video.bvid, video)
      }
    }
  }
  return [...map.values()]
}

/**
 * 选择本轮需要拉取在线人数的视频目标
 *
 * 策略：
 * 1. 候选按弹幕量降序排序（列表数据自带 stat.danmaku，零成本）
 * 2. 取前 topCount 为常驻 TOP（高互动视频）
 * 3. 剩余候选中按轮转索引环形取 rotationBatch 条（覆盖全部候选）
 *
 * @param candidates - 候选视频（含 stat.danmaku）
 * @param opts.topCount - 常驻 TOP 数量
 * @param opts.rotationBatch - 每轮轮转数量
 * @param opts.rotationIndex - 轮转索引（cache-warmer 模块级状态，逐轮递增）
 */
export function selectOnlineTargets(
  candidates: RankingVideo[],
  opts: { topCount: number; rotationBatch: number; rotationIndex: number },
): { top: RankingVideo[]; rotated: RankingVideo[] } {
  // 弹幕量降序（稳定排序：同弹幕量保持原顺序）
  const sorted = [...candidates].sort(
    (a, b) => (b.stat?.danmaku || 0) - (a.stat?.danmaku || 0),
  )

  const top = sorted.slice(0, opts.topCount)
  const rest = sorted.slice(opts.topCount)

  if (rest.length === 0) {
    return { top, rotated: [] }
  }

  // 环形轮转：从 rotationIndex * rotationBatch 位置取 rotationBatch 条
  const start = (opts.rotationIndex * opts.rotationBatch) % rest.length
  const rotated = [
    ...rest.slice(start, start + opts.rotationBatch),
    ...rest.slice(0, Math.max(0, start + opts.rotationBatch - rest.length)),
  ]

  return { top, rotated }
}

/**
 * 过滤掉缓存中仍新鲜的视频（复用旧值，不重复请求）
 *
 * 仅当缓存有该 bvid 且在线人数在 TTL 内拉取过 → 跳过。
 * count_num <= 0 或 无时间戳 → 立即请求（新视频不受 TTL 限制）。
 *
 * @param targets - 目标视频
 * @param cached - 分区缓存（可能为 null）
 * @param ttl - 在线人数新鲜度 TTL（毫秒）
 * @param now - 当前时间戳
 */
export function filterStaleOnlineTargets(
  targets: RankingVideo[],
  cached: PartitionCacheEntry | null,
  ttl: number,
  now: number = Date.now(),
): RankingVideo[] {
  if (!cached) return targets

  return targets.filter((video) => {
    const info = cached.data?.[video.bvid]
    const onlineAt = cached.onlineAt?.[video.bvid]
    // 无缓存值 或 在线人数过期 → 需要重新拉取
    if (!info || info.count_num <= 0 || !onlineAt) return true
    return now - onlineAt >= ttl
  })
}

// ============================================================
// 列表拉取（不拉在线人数，轻量）
// ============================================================

/**
 * 拉取全部分区排行榜列表 + 热门列表（不拉在线人数）
 *
 * 逐 rid 请求，遇风控（返回空）停止并记录 failedRid。
 * 列表数据自带 stat（播放量/弹幕量）和 cid，供弹幕量预筛选与在线人数拉取使用。
 *
 * 条数约定：每个 rid 的列表上限恒为 100 条（B站接口约束，与 rid 取值无关，
 * 见 getBilibiliRanking 注释）。热门 2 页 = 100 条。
 * 全站 rid=0 与各分区高度重叠，合并去重后全局候选远小于 16×100。
 *
 * @param options.singleRid - 单 rid 模式（独立重试时使用）
 * @param options.skipRanking - 跳过排行拉取
 * @param options.skipPopular - 跳过热门拉取
 */
export async function fetchAllRankingLists(options?: {
  skipRanking?: boolean
  skipPopular?: boolean
  singleRid?: string
}): Promise<{
  perRid: Record<string, RankingVideo[]>
  popular: RankingVideo[]
  rankingFailed: boolean
  popularFailed: boolean
  failedRid?: string
}> {
  const apiTimeout = 10_000
  let rankingFailed = false
  let popularFailed = false
  let failedRid: string | undefined
  const perRid: Record<string, RankingVideo[]> = {}
  let popular: RankingVideo[] = []

  // 1. 热门（先行，为 ranking "预热"连接；2 页 = 100 条，页数过多会提高突发风控概率）
  if (!options?.skipPopular) {
    popular = await withTimeout(
      getBilibiliPopular(2).catch(() => []),
      apiTimeout,
      [],
    )
    if (popular.length === 0) popularFailed = true

    // 热门和排行之间间隔 1 秒
    await new Promise((r) => setTimeout(r, 1000))
  }

  // 2. 排行榜（逐个 rid）
  if (!options?.skipRanking) {
    const ridsToFetch = options?.singleRid
      ? [options.singleRid]
      : [...VALID_RANKING_RIDS]

    let allEmpty = true

    for (let i = 0; i < ridsToFetch.length; i++) {
      const rid = ridsToFetch[i]

      const ranking = await withTimeout(
        getBilibiliRanking(rid).catch(() => []),
        apiTimeout,
        [],
      )

      if (ranking.length > 0) {
        perRid[rid] = ranking
        allEmpty = false
      } else {
        // 风控触发：记录失败的 rid，停止处理剩余
        failedRid = rid
        break
      }

      // 单 rid 模式不需要间隔；全量模式每个 rid 间隔 500ms 防风控
      if (!options?.singleRid && i < ridsToFetch.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    rankingFailed = allEmpty
  }

  return {
    perRid,
    popular,
    rankingFailed: options?.skipRanking ? false : rankingFailed,
    popularFailed: options?.skipPopular ? false : popularFailed,
    failedRid,
  }
}

/**
 * 批量拉取视频的在线人数并组装 VideoInfo
 *
 * 每批 5 个并发，10 秒超时。拉取失败（raw=0）的 bvid 计入 failedBvids。
 *
 * @param videos - 目标视频（需含 bvid/cid 及列表元数据）
 * @param apiTimeout - 单个请求超时（毫秒）
 */
export async function fetchOnlineCountForVideos(
  videos: RankingVideo[],
  apiTimeout: number = 10_000,
): Promise<{ data: VideosDataMap; failedBvids: string[] }> {
  const data: VideosDataMap = {}
  const failedBvids: string[] = []

  for (let i = 0; i < videos.length; i += 5) {
    const batch = videos.slice(i, i + 5)
    const { results: batchResults, failedBvids: batchFailed } = await fetchOnlineCountBatch(
      batch,
      apiTimeout,
    )

    failedBvids.push(...batchFailed)

    for (const item of batchResults) {
      const video = videos.find((v) => v.bvid === item.bvid)
      if (!video) continue

      data[item.bvid] = {
        ...buildVideoInfoFromList(video),
        online_count: item.onlineCount.formatted,
        count_num: item.onlineCount.raw,
      }
    }

    // 批间随机延迟（防风控：同接口短时间高频请求会触发 -352）
    if (i + 5 < videos.length) {
      await batchDelay()
    }
  }

  return { data, failedBvids }
}

/**
 * 重试失败视频的在线人数
 *
 * @param failedBvids - 失败视频 BV 号列表
 * @param existingData - 当前缓存中的完整数据
 * @param cids - bvid → cid 映射（在线人数接口必需；缺失时回退 cid=0，请求会失败，由调用方限制重试次数）
 */
export async function retryFailedVideos(
  failedBvids: string[],
  existingData: VideosDataMap,
  cids?: Record<string, number>,
): Promise<RetryResult> {
  const apiTimeout = 10_000
  const stillFailed: string[] = []

  const validBvids = failedBvids.filter((bvid) => bvid in existingData)
  if (validBvids.length === 0) {
    return { data: { ...existingData }, stillFailed: [] }
  }

  let mergedData = { ...existingData }

  for (let i = 0; i < validBvids.length; i += 5) {
    const batch = validBvids.slice(i, i + 5)
    const batchVideos = batch.map((bvid) => ({ bvid, cid: cids?.[bvid] ?? 0 }))
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

    // 批间随机延迟（防风控：同接口短时间高频请求会触发 -352）
    if (i + 5 < validBvids.length) {
      await batchDelay()
    }
  }

  // 先剔除在线人数 < 阈值的视频（重试恢复后确认过低则移除，分区缓存由下一轮 merge 统一清理）
  mergedData = filterLowOnlineVideos(mergedData)

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

    // 请求间隔（/x/web-interface/view 批量请求会被 B站封锁，串行也要限速）
    if (bvid !== validBvids[validBvids.length - 1]) {
      await batchDelay(METADATA_RETRY_DELAY_MS, 200)
    }
  }

  return { data: mergedData, stillEmptyPic, stillZeroStat }
}

/**
 * 获取用户个性化的热门视频（仅增量部分）
 *
 * 与全局 ranking:latest 对比，排除已存在的 BV 号，
 * 只返回该用户独有（不在全局排行中）的新视频。
 * cids 一并收集（在线人数接口必需参数，随缓存保存供后续续期拉取）。
 *
 * @param cookie - 用户的 B站 Cookie
 * @returns 增量视频 + cids 映射；null — 拉取失败或 cookie 无效
 */
export async function fetchPersonalizedOnly(
  cookie: string,
): Promise<{ data: VideosDataMap; cids: Record<string, number> } | null> {
  const apiTimeout = 10_000

  // 1. 拉取全局缓存，获取已有 BV 号集合
  const globalCache = await useStorage('cache').getItem<{
    data: VideosDataMap
    timestamp: number
  }>(COMBINED_CACHE_KEY)

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
  if (newVideos.length === 0) return { data: {}, cids: {} }

  // 4. 批量获取在线人数（全部增量，不做截断）
  const results: VideosDataMap = {}
  const cids: Record<string, number> = {}

  for (let i = 0; i < newVideos.length; i += 5) {
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
      cids[item.bvid] = video.cid
    }

    // 批间随机延迟（防风控：同接口短时间高频请求会触发 -352）
    if (i + 5 < newVideos.length) {
      await batchDelay()
    }
  }

  // 剔除在线人数 < MIN_ONLINE_COUNT 的视频（含 0，瘦身）
  // 覆盖扫码登录预热等直接消费本函数数据的路径，与 mergePersonalizedPreserved 的过滤幂等
  return { data: filterLowOnlineVideos(results), cids }
}

/**
 * 个性化缓存合并（防淘汰核心逻辑，与 mergePartitionCache 同构）
 *
 * - fresh（本轮新增量）为底，先剔除在线人数 < MIN_ONLINE_COUNT 的视频（含未拉到的 0）
 * - 旧缓存中不在 fresh 里的视频（已跌出热门榜增量）：
 *   - 在线人数 ≥ OFF_RANKING_KEEP_THRESHOLD → 保留候选，用缓存 cid 重新拉在线人数：
 *     新值 ≥ 阈值 → 保留并更新在线人数；新值 < 阈值（含 0 / 失败兜底）→ 淘汰
 *   - 在线人数 < 阈值 → 移除（防累积）
 *   - 无 cid（旧版缓存首次升级的过渡）→ 保留旧值，下一轮即有 cid 可更新
 * - cids 合并：旧值保留 + 新增量覆盖
 *
 * @param previous - 旧个性化缓存（可能为 null）
 * @param fresh - 本轮拉取的新增量（含 cids）
 * @param cookie - 用户的 B站 Cookie
 */
export async function mergePersonalizedPreserved(
  previous: PersonalizedCacheEntry | null,
  fresh: { data: VideosDataMap; cids: Record<string, number> },
  cookie: string,
): Promise<{ data: VideosDataMap; cids: Record<string, number> }> {
  const apiTimeout = 10_000
  // 新增量先剔除在线人数 < 阈值的视频（含未拉到的 0，瘦身）
  const data: VideosDataMap = filterLowOnlineVideos(fresh.data)
  const cids: Record<string, number> = { ...(previous?.cids || {}), ...fresh.cids }

  if (!previous) return { data, cids }

  // 离开增量但仍可能热门的视频（在线人数 ≥ 阈值才进入候选）
  const candidates: Array<{ bvid: string; info: VideoInfo; cid?: number }> = []
  for (const [bvid, info] of Object.entries(previous.data)) {
    if (data[bvid]) continue // 仍在增量中（fresh 已覆盖）
    if (info.count_num >= OFF_RANKING_KEEP_THRESHOLD) {
      candidates.push({ bvid, info, cid: cids[bvid] })
    }
    // < 阈值 → 移除（不写入 data，防累积）
  }

  if (candidates.length === 0) return { data, cids }

  // 重新拉取保留候选的在线人数（每 5 个一批，与增量拉取一致）
  const onlineByBvid = new Map<string, { formatted: string; raw: number }>()
  const withCid = candidates.filter((c) => typeof c.cid === 'number' && c.cid > 0)
  for (let i = 0; i < withCid.length; i += 5) {
    const batch = withCid.slice(i, i + 5).map((c) => ({ bvid: c.bvid, cid: c.cid! }))
    const { results } = await fetchOnlineCountBatch(batch, apiTimeout)
    for (const r of results) {
      onlineByBvid.set(r.bvid, r.onlineCount)
    }

    // 批间随机延迟（防风控：同接口短时间高频请求会触发 -352）
    if (i + 5 < withCid.length) {
      await batchDelay()
    }
  }

  for (const { bvid, info, cid } of candidates) {
    const freshOnline = onlineByBvid.get(bvid)
    if (freshOnline) {
      // 拉取成功：新值 ≥ 阈值 → 保留并更新；< 阈值（含 0/失败）→ 淘汰
      if (freshOnline.raw >= OFF_RANKING_KEEP_THRESHOLD) {
        data[bvid] = {
          ...info,
          online_count: freshOnline.formatted,
          count_num: freshOnline.raw,
        }
      }
    } else if (typeof cid !== 'number' || cid <= 0) {
      // 无 cid（旧版缓存）：保留旧值续期，下一轮即有 cid 可正常更新
      data[bvid] = info
    }
  }

  return { data, cids }
}
