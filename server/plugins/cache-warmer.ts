/**
 * 排行榜缓存预热 + 定时刷新
 *
 * 服务器启动后立即拉取一次排行榜数据写入缓存，
 * 之后按配置间隔自动刷新，确保用户请求始终命中缓存。
 *
 * 特性：
 * - 自适应退避：连续失败时缩短重试间隔（30s→60s→120s→240s封顶），成功后恢复
 * - 保留旧缓存：B站不可达时保留已有真实数据，仅在缓存为空时才写入 mock
 * - 失败视频重试：部分视频在线人数获取失败时，在完整刷新周期之间单独重试
 *
 * 刷新间隔通过环境变量 NUXT_CACHE_WARMER_REFRESH_INTERVAL_MS 配置（默认 4 分钟）。
 * 不依赖 Nitro cron Task 系统，在 dev / production / Docker 中行为一致。
 */
import {
  fetchAllRankingLists,
  fetchOnlineCountForVideos,
  mergePartitionCache,
  selectOnlineTargets,
  filterStaleOnlineTargets,
  buildVideoInfoFromList,
  retryFailedVideos,
  retryFailedMetadata,
  type PartitionCacheEntry,
} from '../utils/rankingFetcher'
import { fetchAllLiveRooms, writeLiveRoomsCache, LIVE_CACHE_KEY } from '../utils/liveRoomFetcher'
import { prefetchBiliTicket, prefetchBuvids, type RankingVideo } from '../utils/bilibili'
import {
  COMBINED_CACHE_KEY,
  POPULAR_CACHE_KEY,
  VALID_RANKING_RIDS,
  ONLINE_TTL,
  ONLINE_FETCH_LIMIT,
  rankingCacheKey,
} from '../utils/rankingConstants'
import {
  resolveRefreshInterval,
  calculateBackoffDelay,
  DEFAULT_REFRESH_INTERVAL_MS,
} from '../utils/cacheWarmerConfig'
import type { CacheEntry, VideosDataMap } from '../../app/types'

export default defineNitroPlugin((nitroApp) => {
  const cacheKey = COMBINED_CACHE_KEY
  const config = useRuntimeConfig()
  const normalInterval = resolveRefreshInterval(
    String(config.cacheWarmer?.refreshIntervalMs ?? ''),
    DEFAULT_REFRESH_INTERVAL_MS,
  )

  // 在线人数选择策略常量
  const RANKING_TOP_TOTAL = 200 // 排行弹幕量 TOP 总数（分区均衡分配）
  // 分区均衡 TOP：仅非全站分区参与（全站与各分区高度重叠，避免浪费名额）
  const NON_TOP_RIDS = VALID_RANKING_RIDS.filter((r) => r !== '0')
  // 每分区列表上限 100 条（B站接口约束，与 rid 无关），topPerRid = 200/15 = 13 条/分区
  const topPerRid = Math.floor(RANKING_TOP_TOTAL / NON_TOP_RIDS.length) // 200/15 = 13 条/分区
  // 轮转索引（模块级状态，逐轮递增；轮转批次由「500 - 基础目标需请求数」动态补齐）
  let onlineRotationIndex = 0

  // 连续失败计数器（成功时重置）
  let consecutiveFailures = 0
  // 当前调度计时器（用于 clearTimeout）
  let scheduleTimer: ReturnType<typeof setTimeout> | null = null

  // ---- 独立端点退避 ----
  const RECOVERY_THRESHOLD = 3 // 连续成功 3 次后恢复

  interface EndpointBackoff {
    inBackoff: boolean
    failures: number   // 连续失败次数（退避延迟计算）
    successes: number  // 连续成功次数（恢复判定）
    timer: ReturnType<typeof setTimeout> | null
  }

  const rankingState: EndpointBackoff = { inBackoff: false, failures: 0, successes: 0, timer: null }
  const popularState: EndpointBackoff = { inBackoff: false, failures: 0, successes: 0, timer: null }

  // 排行榜分区队列：当前待重试的 rid（null 表示无待处理或从头开始）
  let pendingRankingRid: string | null = null

  /** 获取 rid 在 VALID_RANKING_RIDS 中的下一个 rid，若无则返回 null */
  function getNextRid(currentRid: string): string | null {
    const idx = VALID_RANKING_RIDS.indexOf(currentRid as any)
    if (idx < 0 || idx >= VALID_RANKING_RIDS.length - 1) return null
    return VALID_RANKING_RIDS[idx + 1]
  }

  function getEndpointName(ep: string) {
    return ep === 'ranking' ? '排行' : '热门'
  }

  /** 安排单个端点退避重试 */
  function scheduleEndpointRetry(endpoint: 'ranking' | 'popular') {
    const state = endpoint === 'ranking' ? rankingState : popularState
    if (state.timer) clearTimeout(state.timer)
    const delay = calculateBackoffDelay(state.failures - 1, normalInterval)
    console.log(`[cache-warmer] ${getEndpointName(endpoint)} ${delay / 1000}s 后独立重试`)
    state.timer = setTimeout(() => retryEndpoint(endpoint), delay)
  }

  /** 读取分区缓存 */
  async function getPartitionCache(rid: string): Promise<PartitionCacheEntry | null> {
    return useStorage('cache').getItem<PartitionCacheEntry>(rankingCacheKey(rid))
  }

  /** 列表数据 → VideosDataMap（count_num=0，元数据来自列表 API） */
  function buildMapFromVideos(videos: RankingVideo[]): VideosDataMap {
    const map: VideosDataMap = {}
    for (const video of videos) {
      map[video.bvid] = buildVideoInfoFromList(video)
    }
    return map
  }

  /** 列表数据 → cids 映射（bvid → cid，在线人数接口必需） */
  function buildCidsFromVideos(videos: RankingVideo[]): Record<string, number> {
    const cids: Record<string, number> = {}
    for (const video of videos) {
      cids[video.bvid] = video.cid
    }
    return cids
  }

  /**
   * 合并写分区缓存：新列表为底（覆盖，不累积）+
   * 保留旧在线人数（≥ 阈值） + 覆盖本轮新拉到 + 更新 cids
   */
  async function writePartitionCache(
    rid: string,
    newList: VideosDataMap,
    newOnline: VideosDataMap,
    newCids?: Record<string, number>,
  ): Promise<void> {
    const oldCache = await getPartitionCache(rid)
    const entry = mergePartitionCache(newList, oldCache, newOnline)
    // cids 合并：旧值保留 + 新列表覆盖
    if (newCids) {
      entry.cids = { ...(oldCache?.cids || {}), ...newCids }
    }
    await useStorage('cache').setItem(rankingCacheKey(rid), entry)
  }

  /**
   * 重建合并视图 ranking:all：热门 + 所有分区缓存合并
   * （排行数据覆盖热门同 bvid；onlineAt 一并合并，供新鲜度判断）
   */
  async function rebuildCombinedCache(): Promise<void> {
    const merged: VideosDataMap = {}
    const onlineAt: Record<string, number> = {}

    const popular = await useStorage('cache').getItem<PartitionCacheEntry>(POPULAR_CACHE_KEY)
    if (popular?.data) {
      Object.assign(merged, popular.data)
      Object.assign(onlineAt, popular.onlineAt || {})
    }

    for (const rid of VALID_RANKING_RIDS) {
      const partition = await getPartitionCache(rid)
      if (partition?.data) {
        Object.assign(merged, partition.data)
        Object.assign(onlineAt, partition.onlineAt || {})
      }
    }

    await useStorage('cache').setItem(cacheKey, {
      data: merged,
      timestamp: Date.now(),
      onlineAt,
    } satisfies PartitionCacheEntry)
  }

  /**
   * 从本轮在线人数数据中筛选属于指定列表的条目（跨 rid 重叠视频会更新多个分区）
   */
  function filterOnlineByList(
    onlineData: VideosDataMap,
    list: VideosDataMap,
  ): VideosDataMap {
    const result: VideosDataMap = {}
    for (const [bvid, info] of Object.entries(onlineData)) {
      if (list[bvid]) result[bvid] = info
    }
    return result
  }

  /**
   * 将恢复的数据回写所有包含对应 bvid 的分区缓存 + 热门缓存
   *
   * 防止 rebuildCombinedCache 重建合并视图时覆盖独立重试恢复的值。
   */
  async function syncRecoveredToPartitions(data: VideosDataMap, bvids: string[]) {
    if (bvids.length === 0) return
    const now = Date.now()

    for (const rid of VALID_RANKING_RIDS) {
      const cached = await getPartitionCache(rid)
      if (!cached) continue
      let updated = false
      for (const bvid of bvids) {
        if (cached.data[bvid] && data[bvid]) {
          cached.data[bvid] = { ...cached.data[bvid], ...data[bvid] }
          cached.onlineAt[bvid] = now
          updated = true
        }
      }
      if (updated) {
        await useStorage('cache').setItem(rankingCacheKey(rid), cached)
      }
    }

    const popular = await useStorage('cache').getItem<PartitionCacheEntry>(POPULAR_CACHE_KEY)
    if (popular) {
      let updated = false
      for (const bvid of bvids) {
        if (popular.data[bvid] && data[bvid]) {
          popular.data[bvid] = { ...popular.data[bvid], ...data[bvid] }
          popular.onlineAt[bvid] = now
          updated = true
        }
      }
      if (updated) {
        await useStorage('cache').setItem(POPULAR_CACHE_KEY, popular)
      }
    }
  }

  /** 独立重试单个端点 */
  async function retryEndpoint(endpoint: 'ranking' | 'popular') {
    const state = endpoint === 'ranking' ? rankingState : popularState

    if (endpoint === 'ranking') {
      // ---- 排行榜：单 rid 模式逐分区重试 ----
      if (!pendingRankingRid) {
        // 无待处理 rid，重置并从第一个开始（防御性）
        pendingRankingRid = VALID_RANKING_RIDS[0]
      }

      const rid = pendingRankingRid
      const lists = await fetchAllRankingLists({ singleRid: rid, skipPopular: true })
      const rankingList = lists.perRid[rid] || []

      if (rankingList.length > 0) {
        // 单 rid 视频数少（<100），全部拉在线人数
        const { data: onlineData } = await fetchOnlineCountForVideos(rankingList)
        // onlineData 含该 rid 全部视频（失败者 count_num=0），作为新列表底
        const oldCache = await getPartitionCache(rid)
        const entry = mergePartitionCache(onlineData, oldCache, {})
        entry.cids = { ...(oldCache?.cids || {}), ...buildCidsFromVideos(rankingList) }
        await useStorage('cache').setItem(rankingCacheKey(rid), entry)
        await rebuildCombinedCache()

        state.successes++
        console.log(
          `[cache-warmer] 排行 rid=${rid} 独立重试成功 ` +
          `（${state.successes}/${RECOVERY_THRESHOLD}），${Object.keys(entry.data).length} 条视频`,
        )

        if (state.successes >= RECOVERY_THRESHOLD) {
          // 恢复：退出退避，清空队列，重新加入定时刷新
          state.inBackoff = false
          state.failures = 0
          state.successes = 0
          pendingRankingRid = null
          console.log(`[cache-warmer] 排行已恢复，重新加入定时刷新`)
        } else {
          // 前进到下一个 rid
          const nextRid = getNextRid(rid)
          if (nextRid) {
            pendingRankingRid = nextRid
            state.timer = setTimeout(() => retryEndpoint('ranking'), 60_000)
            console.log(`[cache-warmer] 排行前进到 rid=${nextRid}，60s 后继续`)
          } else {
            // 所有 rid 处理完毕
            state.inBackoff = false
            state.failures = 0
            state.successes = 0
            pendingRankingRid = null
            console.log(`[cache-warmer] 排行所有分区处理完毕，恢复定时刷新`)
          }
        }
      } else {
        // 仍失败
        state.successes = 0
        state.failures++
        console.warn(
          `[cache-warmer] 排行 rid=${rid} 独立重试仍失败，连续 ${state.failures} 次`,
        )
        scheduleEndpointRetry('ranking')
      }
    } else {
      // ---- 热门：独立重试 ----
      const lists = await fetchAllRankingLists({ skipRanking: true })

      if (lists.popular.length > 0) {
        // 热门全部拉在线人数（<200 条）
        const { data: onlineData } = await fetchOnlineCountForVideos(lists.popular)
        const oldCache = await useStorage('cache').getItem<PartitionCacheEntry>(POPULAR_CACHE_KEY)
        const entry = mergePartitionCache(onlineData, oldCache, {})
        entry.cids = { ...(oldCache?.cids || {}), ...buildCidsFromVideos(lists.popular) }
        await useStorage('cache').setItem(POPULAR_CACHE_KEY, entry)
        await rebuildCombinedCache()

        state.successes++
        console.log(
          `[cache-warmer] 热门 独立重试成功 ` +
          `(${state.successes}/${RECOVERY_THRESHOLD})，${Object.keys(entry.data).length} 条视频`,
        )

        if (state.successes >= RECOVERY_THRESHOLD) {
          state.inBackoff = false
          state.failures = 0
          state.successes = 0
          console.log(`[cache-warmer] 热门 已恢复，重新加入定时刷新`)
        } else {
          state.timer = setTimeout(() => retryEndpoint('popular'), 60_000)
        }
      } else {
        state.successes = 0
        state.failures++
        console.warn(`[cache-warmer] 热门 独立重试仍失败，连续 ${state.failures} 次`)
        scheduleEndpointRetry('popular')
      }
    }
  }

  // ---- 原有变量（失败视频/元数据重试）----
  // 待重试的失败视频 BVid 列表
  let pendingRetryBvids: string[] = []
  // 元数据重试（封面空/播放量为0）
  let pendingEmptyPicBvids: string[] = []
  let pendingZeroStatBvids: string[] = []
  // 失败视频重试计时器
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  // 元数据重试计时器
  let metadataRetryTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 安排下一次完整刷新
   */
  function scheduleNextRefresh(delayMs: number) {
    if (scheduleTimer) clearTimeout(scheduleTimer)
    scheduleTimer = setTimeout(refresh, delayMs)
  }

  /**
   * 安排失败视频重试
   */
  function scheduleRetryFailedVideos(delayMs: number) {
    if (retryTimer) clearTimeout(retryTimer)
    if (pendingRetryBvids.length === 0) return
    retryTimer = setTimeout(retryFailed, delayMs)
  }

  /**
   * 安排元数据重试（封面 + 播放量/弹幕数）
   */
  function scheduleRetryMetadata(delayMs: number) {
    if (metadataRetryTimer) clearTimeout(metadataRetryTimer)
    if (pendingEmptyPicBvids.length === 0 && pendingZeroStatBvids.length === 0) return
    metadataRetryTimer = setTimeout(retryMetadata, delayMs)
  }

  /**
   * 完整刷新：拉取全部分区排行 + 热门（弹幕量预筛选 + 轮转 + 在线人数新鲜度缓存）
   *
   * 失败保留粒度：成功 rid 覆盖写分区缓存；失败 rid 保留旧值。
   * 退避时：用缓存已有数据构建候选池，继续刷新在线人数（列表冻结但数据保持新鲜）。
   */
  async function refresh() {
    try {
      // 1. 拉取列表（排行 + 热门，自带 stat.danmaku）
      const lists = await fetchAllRankingLists({
        skipRanking: rankingState.inBackoff,
        skipPopular: popularState.inBackoff,
      })

      // 2. 构建在线人数目标（热门 + 分区均衡 TOP → 过滤 → 轮转动态补齐到 500）
      const now = Date.now()

      // 增量过滤缓存（TTL 内复用旧值，只拉新增/过期）
      const combinedCache = await useStorage('cache').getItem<PartitionCacheEntry>(cacheKey)

      // perRid 视频列表（保留分区归属，供分区均衡 TOP 使用）
      // 正常：本轮拉取的列表（含 cid）
      // 退避：从分区缓存构建（用 cids + danmaku_count_num 作为弹幕量）
      const perRidVideos: Record<string, RankingVideo[]> = {}
      if (!rankingState.inBackoff) {
        for (const [rid, videos] of Object.entries(lists.perRid)) {
          perRidVideos[rid] = videos
        }
      } else {
        for (const rid of VALID_RANKING_RIDS) {
          const partition = await getPartitionCache(rid)
          if (!partition?.data) continue
          perRidVideos[rid] = Object.entries(partition.data).map(([bvid, info]) => ({
            bvid,
            cid: partition.cids?.[bvid] ?? 0,
            title: info.title,
            pic: info.pic,
            owner: { name: info.owner, mid: Number(info.mid) || 0 },
            stat: { view: info.play_count_num, danmaku: info.danmaku_count_num },
          }))
        }
      }

      // 全局候选（跨 rid 去重，全站 rid=0 与分区重叠）
      const rankingCandidates = new Map<string, RankingVideo>()
      for (const videos of Object.values(perRidVideos)) {
        for (const video of videos) {
          rankingCandidates.set(video.bvid, video)
        }
      }
      const rankingList = [...rankingCandidates.values()]

      // 2a. 分区均衡 TOP：15 个非全站分区，每分区弹幕量降序取前 topPerRid 条
      // （全站 rid=0 不参与——与各分区高度重叠，避免浪费名额；全站视频走轮转/热门）
      const partitionTopBvids = new Set<string>()
      const partitionedTop: RankingVideo[] = []
      for (const rid of NON_TOP_RIDS) {
        const videos = perRidVideos[rid] || []
        const sorted = [...videos].sort(
          (a, b) => (b.stat?.danmaku || 0) - (a.stat?.danmaku || 0),
        )
        for (const v of sorted.slice(0, topPerRid)) {
          if (!partitionTopBvids.has(v.bvid)) {
            partitionTopBvids.add(v.bvid)
            partitionedTop.push(v)
          }
        }
      }

      // 基础目标：热门全部 + 分区 TOP
      const baseTargets: RankingVideo[] = [...lists.popular, ...partitionedTop]
      const staleBase = filterStaleOnlineTargets(baseTargets, combinedCache, ONLINE_TTL, now)

      // 2b. 轮转动态补齐：预算 = 500 - 基础目标实际需请求数
      // 轮转候选 = 全局候选 - 分区 TOP（避免重复）
      const rotationBudget = Math.max(0, ONLINE_FETCH_LIMIT - staleBase.length)
      let targets = staleBase
      const rotationCandidates = rankingList.filter((v) => !partitionTopBvids.has(v.bvid))

      if (rotationBudget > 0 && rotationCandidates.length > 0) {
        // 轮转批次与 TTL 匹配：批次 = ceil(候选 / (TTL ÷ 刷新间隔))
        // 轮转周期 = TTL 周期 → 回绕时批次恰好过期 → 每轮稳定请求 ≈ 批次
        // （批次过大（如 500 vs 候选 1331）→ 2.7 轮覆盖完 → 回绕批次全 TTL 内被过滤 → 请求骤降）
        const rotationCycleRounds = Math.max(1, Math.round(ONLINE_TTL / normalInterval))
        const rotationBatch = Math.max(
          1,
          Math.min(
            rotationBudget,
            Math.ceil(rotationCandidates.length / rotationCycleRounds),
          ),
        )

        const { rotated } = selectOnlineTargets(rotationCandidates, {
          topCount: 0, // 复用：top 为空，rotated 从全部候选环形取
          rotationBatch,
          rotationIndex: onlineRotationIndex,
        })
        // 轮转目标同样过滤 TTL（防重复请求已拉过的视频）
        const staleRotated = filterStaleOnlineTargets(
          rotated,
          combinedCache,
          ONLINE_TTL,
          now,
        )
        targets = [...targets, ...staleRotated]

        // 选择后立即前进轮转索引（即使后续刷新失败，下一轮也轮转不同批次）
        onlineRotationIndex++
      }

      // 3. 拉在线人数（限制在风控上限内）
      const limitedTargets = targets.slice(0, ONLINE_FETCH_LIMIT)
      let onlineData: VideosDataMap = {}
      let allFailedBvids: string[] = []
      let allEmptyPicBvids: string[] = []
      let allZeroStatBvids: string[] = []

      if (limitedTargets.length > 0) {
        const result = await fetchOnlineCountForVideos(limitedTargets)
        onlineData = result.data
        allFailedBvids = result.failedBvids

        // 收集元数据异常（封面/播放量为 0）
        for (const video of limitedTargets) {
          const info = onlineData[video.bvid]
          if (!info) continue
          if (!info.pic || !info.pic.startsWith('https://')) allEmptyPicBvids.push(video.bvid)
          if (info.play_count_num === 0) allZeroStatBvids.push(video.bvid)
        }
      }

      // 4. 合并写分区缓存（成功 rid 覆盖；失败 rid 保留旧值）
      let rankingFailed = false

      if (!rankingState.inBackoff) {
        // 成功拉到的 rid：写分区缓存
        for (const [rid, videos] of Object.entries(lists.perRid)) {
          // 构建该分区完整列表（count_num=0）+ 命中本轮在线人数 + cids
          const newList = buildMapFromVideos(videos)
          const newOnline = filterOnlineByList(onlineData, newList)
          await writePartitionCache(rid, newList, newOnline, buildCidsFromVideos(videos))
        }

        if (lists.failedRid) {
          // 风控触发：进入退避（失败的 rid 及其后未尝试的分区保留旧值）
          rankingState.inBackoff = true
          rankingState.failures = 1
          rankingState.successes = 0
          pendingRankingRid = lists.failedRid
          console.warn(
            `[cache-warmer] 排行 rid=${lists.failedRid} 触发风控，进入独立退避 ` +
            `（已更新 ${Object.keys(lists.perRid).length} 个分区）`,
          )
          scheduleEndpointRetry('ranking')
        } else if (lists.rankingFailed) {
          // 全部 rid 失败（首个 rid 就返回空）
          rankingFailed = true
          rankingState.inBackoff = true
          rankingState.failures = 1
          rankingState.successes = 0
          pendingRankingRid = VALID_RANKING_RIDS[0]
          console.warn(`[cache-warmer] 排行全部失败，进入独立退避`)
          scheduleEndpointRetry('ranking')
        }
      }

      // 5. 热门合并写（失败保留旧值）
      if (!popularState.inBackoff) {
        if (lists.popular.length > 0) {
          const popularList = buildMapFromVideos(lists.popular)
          const popularOnline = filterOnlineByList(onlineData, popularList)
          const oldCache = await useStorage('cache').getItem<PartitionCacheEntry>(POPULAR_CACHE_KEY)
          const entry = mergePartitionCache(popularList, oldCache, popularOnline)
          entry.cids = { ...(oldCache?.cids || {}), ...buildCidsFromVideos(lists.popular) }
          await useStorage('cache').setItem(POPULAR_CACHE_KEY, entry)
        } else if (lists.popularFailed) {
          popularState.inBackoff = true
          popularState.failures = 1
          popularState.successes = 0
          console.warn(`[cache-warmer] 热门被风控，进入独立退避`)
          scheduleEndpointRetry('popular')
        }
      }

      // 6. 重建合并视图（含失败分区保留的旧值）
      await rebuildCombinedCache()
      const combined = await useStorage('cache').getItem<CacheEntry<VideosDataMap>>(cacheKey)
      const videoCount = combined?.data ? Object.keys(combined.data).length : 0

      // 7. 端点状态汇总 + 调度
      const anyAttempted = !rankingState.inBackoff || !popularState.inBackoff
      const allAttemptedFailed =
        (!rankingState.inBackoff && rankingFailed) ||
        (!popularState.inBackoff && lists.popularFailed)

      if (anyAttempted && allAttemptedFailed) {
        // 全部尝试的端点都失败
        consecutiveFailures++
        const delay = calculateBackoffDelay(consecutiveFailures - 1, normalInterval)
        console.warn(`[cache-warmer] 全部端点失败，${delay / 1000}s 后退避重试`)
        scheduleNextRefresh(delay)
      } else {
        consecutiveFailures = 0
        // 全量刷新成功，清空分区队列
        // 注意：排行正在独立退避时不能清空 pendingRankingRid，
        // 否则 retryEndpoint 会因 pendingRankingRid 为空而重置为 rid=0
        if (!rankingState.inBackoff) {
          pendingRankingRid = null
        }
        const suffix = [
          rankingState.inBackoff ? '排行退避中' : '',
          popularState.inBackoff ? '热门退避中' : '',
        ].filter(Boolean).join('，')
        console.log(
          `[cache-warmer] 缓存已刷新: ${videoCount} 条视频` +
          `，在线人数请求 ${limitedTargets.length} 条` +
          `（轮转索引 ${onlineRotationIndex}）` +
          (suffix ? `（${suffix}）` : ''),
        )
        scheduleNextRefresh(normalInterval)
      }

      // 8. 失败视频 / 元数据重试安排
      if (allFailedBvids.length > 0) {
        pendingRetryBvids = allFailedBvids
        console.warn(
          `[cache-warmer] ${allFailedBvids.length} 个视频在线人数获取失败，将独立重试`,
        )
        scheduleRetryFailedVideos(30_000)
      } else {
        pendingRetryBvids = []
      }

      if (allEmptyPicBvids.length > 0 || allZeroStatBvids.length > 0) {
        pendingEmptyPicBvids = allEmptyPicBvids
        pendingZeroStatBvids = allZeroStatBvids
        console.warn(
          `[cache-warmer] 元数据异常: ${allEmptyPicBvids.length} 个封面为空, ${allZeroStatBvids.length} 个播放量为0，将独立重试`,
        )
        scheduleRetryMetadata(30_000)
      } else {
        pendingEmptyPicBvids = []
        pendingZeroStatBvids = []
      }
    } catch (err: any) {
      console.error('[cache-warmer] 刷新异常:', err.message || err, err.stack)
      scheduleNextRefresh(normalInterval)
    }
  }

  /**
   * 重试失败视频的在线人数
   */
  async function retryFailed() {
    if (pendingRetryBvids.length === 0) return

    try {
      // 读取当前缓存
      const cached = await useStorage('cache').getItem<CacheEntry<VideosDataMap>>(cacheKey)
      if (!cached || !cached.data) {
        pendingRetryBvids = []
        return
      }

      console.log(`[cache-warmer] 重试 ${pendingRetryBvids.length} 个失败视频的在线人数...`)

      const result = await retryFailedVideos(pendingRetryBvids, cached.data)

      const recoveredBvids = pendingRetryBvids.filter(
        (b) => !result.stillFailed.includes(b),
      )

      if (recoveredBvids.length > 0) {
        // 更新合并视图（保留 onlineAt，恢复的 bvid 刷新时间戳）
        await useStorage('cache').setItem(cacheKey, {
          data: result.data,
          timestamp: Date.now(),
          onlineAt: {
            ...(cached as PartitionCacheEntry).onlineAt,
            ...Object.fromEntries(recoveredBvids.map((b) => [b, Date.now()])),
          },
        } satisfies PartitionCacheEntry)

        // 回写分区缓存（防 rebuild 覆盖）
        await syncRecoveredToPartitions(result.data, recoveredBvids)

        console.log(
          `[cache-warmer] 重试完成: ${recoveredBvids.length} 个恢复, ${result.stillFailed.length} 个仍失败`,
        )
      }

      pendingRetryBvids = result.stillFailed

      // 如果还有失败视频，继续重试
      if (pendingRetryBvids.length > 0) {
        scheduleRetryFailedVideos(30_000)
      }
    } catch (err: any) {
      console.error('[cache-warmer] 重试失败视频异常:', err.message || err)
      // 保持待重试列表，等待下次完整刷新
    }
  }

  /**
   * 重试失败视频的元数据（封面 + 播放量/弹幕数）
   */
  async function retryMetadata() {
    if (pendingEmptyPicBvids.length === 0 && pendingZeroStatBvids.length === 0) return

    try {
      // 读取当前缓存
      const cached = await useStorage('cache').getItem<CacheEntry<VideosDataMap>>(cacheKey)
      if (!cached || !cached.data) {
        pendingEmptyPicBvids = []
        pendingZeroStatBvids = []
        return
      }

      const total = pendingEmptyPicBvids.length + pendingZeroStatBvids.length
      console.log(`[cache-warmer] 重试 ${total} 个视频的元数据...`)

      const result = await retryFailedMetadata(
        pendingEmptyPicBvids,
        pendingZeroStatBvids,
        cached.data,
      )

      const recoveredPic = pendingEmptyPicBvids.length - result.stillEmptyPic.length
      const recoveredStat = pendingZeroStatBvids.length - result.stillZeroStat.length

      if (recoveredPic > 0 || recoveredStat > 0) {
        const recoveredBvids = [
          ...pendingEmptyPicBvids.filter((b) => !result.stillEmptyPic.includes(b)),
          ...pendingZeroStatBvids.filter((b) => !result.stillZeroStat.includes(b)),
        ]

        // 有恢复，更新合并视图（保留 onlineAt）+ 回写分区缓存（防 rebuild 覆盖）
        await useStorage('cache').setItem(cacheKey, {
          data: result.data,
          timestamp: Date.now(),
          onlineAt: {
            ...(cached as PartitionCacheEntry).onlineAt,
            ...Object.fromEntries(recoveredBvids.map((b) => [b, Date.now()])),
          },
        } satisfies PartitionCacheEntry)

        await syncRecoveredToPartitions(result.data, recoveredBvids)

        console.log(
          `[cache-warmer] 元数据重试完成: ${recoveredPic} 个封面恢复, ${recoveredStat} 个播放量恢复, ` +
            `${result.stillEmptyPic.length} 个封面仍为空, ${result.stillZeroStat.length} 个播放量仍为0`,
        )
      }

      pendingEmptyPicBvids = result.stillEmptyPic
      pendingZeroStatBvids = result.stillZeroStat

      // 如果还有失败，继续重试
      if (pendingEmptyPicBvids.length > 0 || pendingZeroStatBvids.length > 0) {
        scheduleRetryMetadata(30_000)
      }
    } catch (err: any) {
      console.error('[cache-warmer] 重试元数据异常:', err.message || err)
    }
  }

  // ============================================================
  // 直播缓存预热（独立计时器，复用 normalInterval 和退避算法）
  // ============================================================
  let liveTimer: ReturnType<typeof setTimeout> | null = null
  let liveConsecutiveFailures = 0

  /**
   * 直播缓存完整刷新：调用 fetchAllLiveRooms 聚合全站+分区，写入缓存
   *
   * 失败处理：保留旧缓存（若空则写 mock 降级），按退避算法重试
   */
  async function refreshLive() {
    try {
      const t0 = Date.now()
      const result = await fetchAllLiveRooms()

      if (result === null) {
        // B站完全不可用：保留旧缓存，仅在空时降级
        liveConsecutiveFailures++
        const delay = calculateBackoffDelay(liveConsecutiveFailures - 1, normalInterval)
        const cached = await useStorage('cache').getItem<{ data: any[]; timestamp: number }>(LIVE_CACHE_KEY)
        if (!cached?.data || cached.data.length === 0) {
          console.warn('[cache-warmer:live] B站不可用且缓存为空，等待重试')
        } else {
          console.warn(`[cache-warmer:live] B站不可用，保留现有缓存（${cached.data.length} 条）`)
        }
        console.warn(`[cache-warmer:live] 拉取失败，${delay / 1000}s 后重试`)
        scheduleNextLiveRefresh(delay)
        return
      }

      // 成功：写入全站 + 各分区缓存
      await writeLiveRoomsCache(result)
      liveConsecutiveFailures = 0

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      const totalAreas = result.successAreas + result.failedAreas.length
      console.log(
        `[cache-warmer:live] 缓存已刷新: 全站 ${result.combined.length} 条，` +
        `${result.successAreas}/${totalAreas} 个分区成功 (${elapsed}s)` +
        (result.failedAreas.length > 0
          ? `，失败: ${result.failedAreas.map((a) => a.name).join('、')}`
          : ''),
      )
      scheduleNextLiveRefresh(normalInterval)
    } catch (err: any) {
      console.error('[cache-warmer:live] 刷新异常:', err.message || err)
      scheduleNextLiveRefresh(normalInterval)
    }
  }

  function scheduleNextLiveRefresh(delayMs: number) {
    if (liveTimer) clearTimeout(liveTimer)
    liveTimer = setTimeout(refreshLive, delayMs)
  }

  /**
   * 清理所有计时器
   */
  function cleanup() {
    if (scheduleTimer) {
      clearTimeout(scheduleTimer)
      scheduleTimer = null
    }
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (metadataRetryTimer) {
      clearTimeout(metadataRetryTimer)
      metadataRetryTimer = null
    }
    if (rankingState.timer) {
      clearTimeout(rankingState.timer)
      rankingState.timer = null
    }
    if (popularState.timer) {
      clearTimeout(popularState.timer)
      popularState.timer = null
    }
    if (liveTimer) {
      clearTimeout(liveTimer)
      liveTimer = null
    }
  }

  // 启动时预取 buvid 设备指纹 + bili_ticket（避免首次 API 请求与
  // spi / GenWebTicket 调用背靠背触发风控）
  setImmediate(async () => {
    console.log(`[cache-warmer] 预取 buvid 设备指纹...`)
    await prefetchBuvids()
    // 与 ticket 请求错开，避免背靠背
    await new Promise((r) => setTimeout(r, 500))
    console.log(`[cache-warmer] 预取 bili_ticket...`)
    await prefetchBiliTicket()
    // 预取完成后稍等 1 秒，避免 GenWebTicket 与实际 API 请求背靠背触发风控
    await new Promise((r) => setTimeout(r, 1000))
    console.log(`[cache-warmer] 开始预热排行榜缓存... (刷新间隔: ${normalInterval / 1000}s)`)
    await refresh()

    // 直播预热：延后 2s，避免与视频侧 API 请求背靠背触发风控
    await new Promise((r) => setTimeout(r, 2000))
    console.log(`[cache-warmer:live] 开始预热直播缓存... (刷新间隔: ${normalInterval / 1000}s)`)
    await refreshLive()
  })

  // 服务器关闭时清理计时器
  nitroApp.hooks.hook('close', () => {
    cleanup()
  })
})
