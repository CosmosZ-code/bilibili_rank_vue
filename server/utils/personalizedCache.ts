/**
 * 个性化缓存服务层
 *
 * 统一管理个性化视频缓存的 key 生成、读取、拉取与写入。
 * 消除多个 API 路由中重复的缓存逻辑（DRY）。
 */
import type { VideosDataMap } from '../../app/types'
import type { AuthUser } from './auth'
import { fetchPersonalizedOnly, mergePersonalizedPreserved } from './rankingFetcher'
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
 */
export async function setPersonalizedCache(
  userId: number,
  entry: { data: VideosDataMap; cids?: Record<string, number> },
): Promise<void> {
  await useStorage('cache').setItem(personalizedCacheKey(userId), {
    data: entry.data,
    cids: entry.cids,
    timestamp: Date.now(),
  })
}

/**
 * 获取用户个性化数据（统一缓存策略）
 *
 * - 缓存新鲜（5 分钟内）→ 直接返回缓存（零 B站 请求）
 * - 缓存过期 → 拉取 B站 并写缓存
 * - 拉取失败 → 返回旧缓存（不覆盖），无缓存则返回 null
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

  // 缓存过期 → 重新拉取
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

  // 拉取失败 → 返回旧缓存（若有）
  return cached?.data ?? null
}
