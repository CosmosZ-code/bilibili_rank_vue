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
import { fetchAllRankings, retryFailedVideos, retryFailedMetadata } from '../utils/rankingFetcher'
import { prefetchBiliTicket } from '../utils/bilibili'
import { MOCK_RANKING } from '../utils/mockData'
import { COMBINED_CACHE_KEY, VALID_RANKING_RIDS } from '../utils/rankingConstants'
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

  /** 独立重试单个端点 */
  async function retryEndpoint(endpoint: 'ranking' | 'popular') {
    const state = endpoint === 'ranking' ? rankingState : popularState

    // 读取当前缓存作为 existingData
    const cached = await useStorage('cache').getItem<CacheEntry<VideosDataMap>>(cacheKey)
    if (!cached?.data) return

    if (endpoint === 'ranking') {
      // ---- 排行榜：单 rid 模式逐分区重试 ----
      if (!pendingRankingRid) {
        // 无待处理 rid，重置并从第一个开始（防御性）
        pendingRankingRid = VALID_RANKING_RIDS[0]
      }

      const result = await fetchAllRankings({
        singleRid: pendingRankingRid,
        skipPopular: true,
        existingData: cached.data,
      })

      if (result && !result.rankingFailed) {
        // 当前 rid 成功
        await useStorage('cache').setItem(cacheKey, {
          data: result.data,
          timestamp: Date.now(),
        })
        state.successes++
        console.log(
          `[cache-warmer] 排行 rid=${pendingRankingRid} 独立重试成功 ` +
          `（${state.successes}/${RECOVERY_THRESHOLD}），${Object.keys(result.data).length} 条视频`,
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
          const nextRid = getNextRid(pendingRankingRid)
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
          `[cache-warmer] 排行 rid=${pendingRankingRid} 独立重试仍失败，连续 ${state.failures} 次`,
        )
        scheduleEndpointRetry('ranking')
      }
    } else {
      // ---- 热门：原有逻辑不变 ----
      const result = await fetchAllRankings({
        skipRanking: true,
        existingData: cached.data,
      })

      const failed = result?.popularFailed ?? true

      if (result && !failed) {
        await useStorage('cache').setItem(cacheKey, {
          data: result.data,
          timestamp: Date.now(),
        })
        state.successes++
        console.log(
          `[cache-warmer] 热门 独立重试成功 ` +
          `(${state.successes}/${RECOVERY_THRESHOLD})，${Object.keys(result.data).length} 条视频`,
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
   * 完整刷新：拉取全部分区排行 + 热门
   */
  async function refresh() {
    try {
      // 读取当前缓存作为 existingData（保留退避中端点的旧数据）
      const cached = await useStorage('cache').getItem<CacheEntry<VideosDataMap>>(cacheKey)

      const result = await fetchAllRankings({
        skipRanking: rankingState.inBackoff,
        skipPopular: popularState.inBackoff,
        existingData: cached?.data,
      })

      if (result !== null && Object.keys(result.data).length > 0) {
        const videoCount = Object.keys(result.data).length

        // 写入缓存
        await useStorage('cache').setItem(cacheKey, {
          data: result.data,
          timestamp: Date.now(),
        } satisfies CacheEntry<VideosDataMap>)

        // 检查各端点状态
        let allAttemptedFailed = true
        let anyAttempted = false

        // ---- 排行端点 ----
        if (!rankingState.inBackoff) {
          anyAttempted = true
          if (result.failedRid) {
            // 风控触发：进入退避，记录中断位置
            rankingState.inBackoff = true
            rankingState.failures = 1
            rankingState.successes = 0
            pendingRankingRid = result.failedRid
            console.warn(
              `[cache-warmer] 排行 rid=${result.failedRid} 触发风控，进入独立退避 ` +
              `（已保存 ${videoCount} 条视频）`,
            )
            scheduleEndpointRetry('ranking')
          } else if (result.rankingFailed) {
            // 全部 rid 失败（首个 rid 就返回空）
            rankingState.inBackoff = true
            rankingState.failures = 1
            rankingState.successes = 0
            pendingRankingRid = VALID_RANKING_RIDS[0]
            console.warn(`[cache-warmer] 排行全部失败，进入独立退避`)
            scheduleEndpointRetry('ranking')
          } else {
            allAttemptedFailed = false
          }
        }

        // ---- 热门端点（逻辑不变） ----
        if (!popularState.inBackoff) {
          anyAttempted = true
          if (result.popularFailed) {
            popularState.inBackoff = true
            popularState.failures = 1
            popularState.successes = 0
            console.warn(`[cache-warmer] 热门被风控，进入独立退避`)
            scheduleEndpointRetry('popular')
          } else {
            allAttemptedFailed = false
          }
        }

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
          // 否则 retryEndpoint 会因 pendingRankingRid 为空而重置为 rid=0，
          // 导致从错误位置重试（如 rid=3 失败后从 rid=0 重试，或同一 rid 重复）。
          if (!rankingState.inBackoff) {
            pendingRankingRid = null
          }
          const suffix = [
            rankingState.inBackoff ? '排行退避中' : '',
            popularState.inBackoff ? '热门退避中' : '',
          ].filter(Boolean).join('，')
          console.log(
            `[cache-warmer] 缓存已刷新: ${videoCount} 条视频` +
            (suffix ? `（${suffix}）` : ''),
          )
          scheduleNextRefresh(normalInterval)
        }

        // 如果有失败视频（在线人数），安排独立重试
        if (result.failedBvids.length > 0) {
          pendingRetryBvids = result.failedBvids
          console.warn(
            `[cache-warmer] ${result.failedBvids.length} 个视频在线人数获取失败，将独立重试`,
          )
          scheduleRetryFailedVideos(30_000)
        } else {
          pendingRetryBvids = []
        }

        // 如果有元数据失败（封面 + 播放量），安排元数据重试
        if (result.emptyPicBvids.length > 0 || result.zeroStatBvids.length > 0) {
          pendingEmptyPicBvids = result.emptyPicBvids
          pendingZeroStatBvids = result.zeroStatBvids
          console.warn(
            `[cache-warmer] 元数据异常: ${result.emptyPicBvids.length} 个封面为空, ${result.zeroStatBvids.length} 个播放量为0，将独立重试`,
          )
          scheduleRetryMetadata(30_000)
        } else {
          pendingEmptyPicBvids = []
          pendingZeroStatBvids = []
        }
      } else {
        // B站完全不可用：保留旧缓存，仅在缓存为空时写入 mock
        await handleFetchFailure()
      }
    } catch (err: any) {
      console.error('[cache-warmer] 刷新异常:', err.message || err)
      scheduleNextRefresh(normalInterval)
    }
  }

  /**
   * 处理 B站完全不可达的情况
   */
  async function handleFetchFailure() {
    consecutiveFailures++
    console.warn(`[cache-warmer] B站不可用（连续失败 ${consecutiveFailures} 次），使用降级策略`)

    // 检查缓存中是否已有数据
    const cached = await useStorage('cache').getItem<CacheEntry<VideosDataMap>>(cacheKey)

    if (!cached || !cached.data || Object.keys(cached.data).length === 0) {
      // 缓存为空，写入 mock 数据兜底
      await useStorage('cache').setItem(cacheKey, {
        data: MOCK_RANKING,
        timestamp: Date.now(),
      } satisfies CacheEntry<VideosDataMap>)
      console.warn('[cache-warmer] 缓存为空，已写入 mock 降级数据')
    } else {
      // 保留旧缓存（可能是真实数据），不覆盖为 mock
      console.log(`[cache-warmer] 保留现有缓存（${Object.keys(cached.data).length} 条），不覆盖`)
    }

    // 退避重试
    const delay = calculateBackoffDelay(consecutiveFailures - 1, normalInterval)
    console.log(`[cache-warmer] ${delay / 1000}s 后重试`)
    scheduleNextRefresh(delay)
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

      if (result.stillFailed.length < pendingRetryBvids.length) {
        // 部分或全部重试成功，更新缓存
        await useStorage('cache').setItem(cacheKey, {
          data: result.data,
          timestamp: Date.now(),
        } satisfies CacheEntry<VideosDataMap>)

        const recovered = pendingRetryBvids.length - result.stillFailed.length
        console.log(`[cache-warmer] 重试完成: ${recovered} 个恢复, ${result.stillFailed.length} 个仍失败`)
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
        // 有恢复，更新缓存
        await useStorage('cache').setItem(cacheKey, {
          data: result.data,
          timestamp: Date.now(),
        } satisfies CacheEntry<VideosDataMap>)

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
  }

  // 启动时预取 bili_ticket（避免首次 API 请求因 GenWebTicket 与 B站 API 间隔过近触发风控）
  setImmediate(async () => {
    console.log(`[cache-warmer] 预取 bili_ticket...`)
    await prefetchBiliTicket()
    // 预取完成后稍等 1 秒，避免 GenWebTicket 与实际 API 请求背靠背触发风控
    await new Promise((r) => setTimeout(r, 1000))
    console.log(`[cache-warmer] 开始预热排行榜缓存... (刷新间隔: ${normalInterval / 1000}s)`)
    await refresh()
  })

  // 服务器关闭时清理计时器
  nitroApp.hooks.hook('close', () => {
    cleanup()
  })
})
