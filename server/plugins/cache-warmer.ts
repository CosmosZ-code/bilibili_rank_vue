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
import { fetchRankingData, retryFailedVideos, retryFailedMetadata } from '../utils/rankingFetcher'
import { MOCK_RANKING } from '../utils/mockData'
import {
  resolveRefreshInterval,
  calculateBackoffDelay,
  DEFAULT_REFRESH_INTERVAL_MS,
} from '../utils/cacheWarmerConfig'
import type { CacheEntry, VideosDataMap } from '../../app/types'

export default defineNitroPlugin((nitroApp) => {
  const cacheKey = 'ranking:latest'
  const config = useRuntimeConfig()
  const normalInterval = resolveRefreshInterval(
    String(config.cacheWarmer?.refreshIntervalMs ?? ''),
    DEFAULT_REFRESH_INTERVAL_MS,
  )

  // 连续失败计数器（成功时重置）
  let consecutiveFailures = 0
  // 当前调度计时器（用于 clearTimeout）
  let scheduleTimer: ReturnType<typeof setTimeout> | null = null
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
   * 完整刷新：拉取排行榜 + 热门 + 在线人数
   */
  async function refresh() {
    try {
      const result = await fetchRankingData()

      if (result !== null && Object.keys(result.data).length > 0) {
        // 成功：写入真实数据，重置失败计数
        await useStorage('cache').setItem(cacheKey, {
          data: result.data,
          timestamp: Date.now(),
        } satisfies CacheEntry<VideosDataMap>)

        consecutiveFailures = 0
        console.log(`[cache-warmer] 缓存已刷新: ${Object.keys(result.data).length} 条视频`)

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

        // 正常间隔
        scheduleNextRefresh(normalInterval)
      } else {
        // B站完全不可用：保留旧缓存，仅在缓存为空时写入 mock
        await handleFetchFailure()
      }
    } catch (err: any) {
      console.error('[cache-warmer] 刷新异常:', err.message || err)
      // 异常情况（代码错误等）：保持旧缓存，按正常间隔重试
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
  }

  // 启动时立即预热
  setImmediate(async () => {
    console.log(`[cache-warmer] 开始预热排行榜缓存... (刷新间隔: ${normalInterval / 1000}s)`)
    await refresh()
  })

  // 服务器关闭时清理计时器
  nitroApp.hooks.hook('close', () => {
    cleanup()
  })
})
