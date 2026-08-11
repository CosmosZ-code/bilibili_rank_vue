/**
 * 个性化缓存服务层
 *
 * 统一管理个性化视频缓存的 key 生成、读取、拉取与写入。
 * 消除多个 API 路由中重复的缓存逻辑（DRY）。
 */
import type { VideosDataMap } from '../../app/types'
import type { AuthUser } from './auth'
import {
  fetchPersonalizedOnly,
  mergePersonalizedPreserved,
  filterLowOnlineVideos,
} from './rankingFetcher'
import type { PersonalizedCacheEntry } from './rankingFetcher'

/** 缓存 key 前缀 */
export const PERSONALIZED_CACHE_PREFIX = 'personalized:'

/** 缓存新鲜期：5 分钟（过期才重新拉取，每用户每 5 分钟最多 1 次 B站 调用，防风控） */
export const PERSONALIZED_CACHE_TTL = 5 * 60 * 1000

/** 生成用户个性化缓存 key */
export function personalizedCacheKey(userId: number): string {
  return `${PERSONALIZED_CACHE_PREFIX}${userId}`
}

/**
 * 读取用户个性化缓存（可能过期）
 */
export async function getPersonalizedCache(
  userId: number,
): Promise<PersonalizedCacheEntry | null> {
  return useStorage('cache').getItem<PersonalizedCacheEntry>(personalizedCacheKey(userId))
}

/**
 * 写入用户个性化缓存（timestamp 刷新 = TTL 续期）
 *
 * 写入前统一剔除在线人数 < MIN_ONLINE_COUNT 的视频（写入边界兜底，
 * 保证缓存永不包含低在线数据，无论数据来自哪条拉取路径）。
 */
export async function setPersonalizedCache(
  userId: number,
  entry: { data: VideosDataMap; cids?: Record<string, number> },
): Promise<void> {
  await useStorage('cache').setItem(personalizedCacheKey(userId), {
    data: filterLowOnlineVideos(entry.data),
    cids: entry.cids,
    timestamp: Date.now(),
  })
}

/** 在途拉取去重：同用户并发请求复用同一 Promise（防重复请求 B站）
 *  场景：登录后客户端 refreshPersonalized 与 loadInitial 触发竞态、同账号多标签页并发 */
const inflightPersonalized = new Map<number, Promise<VideosDataMap | null>>()

/**
 * 获取用户个性化数据（统一缓存策略）
 *
 * - 缓存新鲜（5 分钟内）→ 直接返回缓存（零 B站 请求）
 * - 缓存过期 → 拉取 B站 并写缓存
 * - 拉取失败 → 返回 null，不回退过期数据（与 GET /api/ranking 的 TTL
 *   合并条件保持一致——否则客户端 POST 合并的过期卡片会被后续 replace 的
 *   GET 响应刷掉，出现「闪现后消失」；同时避免长期失败导致过期数据污染榜单）
 * - 同用户并发调用 → 复用同一在途 Promise，不重复请求
 */
export async function getOrFetchPersonalized(
  user: AuthUser,
  cookie: string,
): Promise<VideosDataMap | null> {
  const cached = await getPersonalizedCache(user.id)

  // 缓存新鲜 → 零 B站 请求
  if (cached?.data && Date.now() - cached.timestamp < PERSONALIZED_CACHE_TTL) {
    return cached.data
  }

  // 已有同用户拉取在途 → 复用，不发起新请求
  const inflight = inflightPersonalized.get(user.id)
  if (inflight) return inflight

  // 缓存过期 → 重新拉取（注册在途，完成后清理）
  const task = (async (): Promise<VideosDataMap | null> => {
    try {
      const fresh = await fetchPersonalizedOnly(cookie)
      if (fresh) {
        // 合并保留：跌出热门榜但在线人数 ≥ 阈值的视频不被覆盖淘汰，
        // 用缓存 cid 续拉在线人数并刷新 TTL，直到人数 < 阈值
        const merged = await mergePersonalizedPreserved(cached, fresh, cookie)
        await setPersonalizedCache(user.id, merged)
        return merged.data
      }
    } catch {
      // 拉取失败静默，不覆盖旧缓存
    }

    // 拉取失败或结果为空 → 不回退旧缓存（返回 null）：
    // 旧缓存已过期，POST 若回退展示，客户端合并的卡片会被后续 replace 的
    // GET 响应刷掉（GET 按 TTL 跳过过期缓存）；长期失败还会长期展示过期数据。
    // 过期后每次调用都会重试拉取，成功后自动替换为新鲜数据。
    return null
  })()
  inflightPersonalized.set(user.id, task)
  try {
    return await task
  } finally {
    inflightPersonalized.delete(user.id)
  }
}
