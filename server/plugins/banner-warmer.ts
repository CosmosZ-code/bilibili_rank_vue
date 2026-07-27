/**
 * Banner 缓存预热插件
 *
 * - 启动时扫描本地 Banner 目录并写入缓存
 * - 每 7 天从 GitHub 同步新 Banner → 更新缓存
 * - 缓存永不过期/清除，只在新数据到来时覆盖
 *
 * 对标 server/plugins/cache-warmer.ts 的架构：
 *   - 写方：banner-warmer → useStorage('cache')['banners']
 *   - 读方：banners.get.ts → 纯读，从不触发数据拉取
 */
import { join } from 'node:path'
import { loadAllBanners } from '../utils/bannerData'
import { syncBannersFromGitHub } from '../utils/bannerSyncer'

const BANNER_CACHE_KEY = 'banners'
const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

export default defineNitroPlugin((nitroApp) => {
  // Volume 挂载路径（与 Dockerfile 和 entrypoint 保持一致）
  const volumeAssetsDir = join(process.cwd(), 'data', 'banners')

  let syncTimer: ReturnType<typeof setTimeout> | null = null

  // ============================================================
  // 缓存预热：扫描本地目录 → 写入 Nitro 缓存
  // ============================================================
  async function warmCache(): Promise<void> {
    try {
      const banners = await loadAllBanners(volumeAssetsDir)
      await useStorage('cache').setItem(BANNER_CACHE_KEY, {
        data: banners,
        timestamp: Date.now(),
      })
      const localCount = banners.filter((b) => !b.name.includes(' ')).length // 非 fallback 的数量
      console.log(`[banner-warmer] 缓存已预热: ${localCount} 套本地 + ${banners.length - localCount} 套兜底`)
    } catch (err) {
      console.error('[banner-warmer] 缓存预热失败:', (err as Error).message)
    }
  }

  // ============================================================
  // 同步 + 更新：从 GitHub 拉取 → 重新扫描 → 更新缓存
  // ============================================================
  async function syncAndUpdate(): Promise<void> {
    try {
      const synced = await syncBannersFromGitHub(volumeAssetsDir)
      if (synced.length > 0) {
        console.log(`[banner-warmer] 同步完成，${synced.length} 套新 Banner 已下载，更新缓存`)
        await warmCache()
      }
    } catch (err) {
      console.warn('[banner-warmer] 同步失败，保留现有缓存:', (err as Error).message)
    }
    scheduleNextSync()
  }

  function scheduleNextSync(): void {
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(syncAndUpdate, SYNC_INTERVAL_MS)
  }

  function cleanup(): void {
    if (syncTimer) {
      clearTimeout(syncTimer)
      syncTimer = null
    }
  }

  // ============================================================
  // 启动
  // ============================================================
  setImmediate(async () => {
    await warmCache()
    // 首次同步推迟到下一个 7 天周期（避免部署时集中请求 GitHub API）
    scheduleNextSync()
  })

  // 服务器关闭时清理计时器
  nitroApp.hooks.hook('close', () => {
    cleanup()
  })
})
