/**
 * 视频排行列表管理器
 *
 * 用 Map 管理已加载的全部视频，displayedCount 控制显示条数。
 * 过滤变化时旧数据保持可见，新数据到达后原子替换——无骨架屏闪烁。
 * 个性化刷新时增量合并到 Map，按热度重新排序。
 *
 * 导出纯函数供单元测试（useVideoList-pure.spec.ts）：
 * - compareByOnlineCount     — 排序比较器（匹配服务端）
 * - mergeAndSortVideos        — 合并去重并按在线人数排序
 * - buildVideoQuery           — 构建 API 查询参数
 * - hasMoreVideos             — 判断是否还有更多数据
 * - buildPersonalizedSignature — 个性化视频签名（通知去重）
 */

import type { RankingResponse, VideoWithBvid } from '../types'

// ============================================================
// 纯函数（导出供测试）
// ============================================================

/**
 * 客户端排序比较器，与服务端 sortAndFilterRanking 保持一致：
 * 主 key：count_num 降序
 * 次 key：bvid 升序（保证确定性）
 *
 * ⚠️ 注意：需与 server/utils/rankingFetcher.ts 的 sortAndFilterRanking
 * 保持同步（跨 server/app 边界不共享，由 rankingFilter.spec 和
 * useVideoList-pure.spec 双边测试保护）。
 */
export function compareByOnlineCount(a: VideoWithBvid, b: VideoWithBvid): number {
  const diff = b.count_num - a.count_num // count_num 降序
  if (diff !== 0) return diff
  return a.bvid.localeCompare(b.bvid) // bvid 升序，保证跨页稳定
}

/**
 * 合并 existing 和 added 视频列表，按 bvid 去重（保留已有），
 * 然后按在线人数降序 + bvid 升序排列。
 */
export function mergeAndSortVideos(
  existing: VideoWithBvid[],
  added: VideoWithBvid[],
): VideoWithBvid[] {
  const existingBvids = new Set(existing.map((v) => v.bvid))
  const uniqueNew = added.filter((v) => !existingBvids.has(v.bvid))
  return [...existing, ...uniqueNew].sort(compareByOnlineCount)
}

/**
 * 构建 /api/ranking 查询参数。
 *
 * 空 search 不传参数（后端跳过搜索过滤）。
 */
export function buildVideoQuery(
  page: number,
  searchTerm: string,
  purifyPercent: number,
  sortBy: string = 'count',
  pageSize: number = 30,
): Record<string, string | number | undefined> {
  const query: Record<string, string | number | undefined> = {
    page,
    pageSize,
    sortBy,
    purifyPercent,
  }
  if (searchTerm) query.search = searchTerm
  return query
}

/**
 * 判断服务器是否还有更多数据。
 */
export function hasMoreVideos(total: number, displayed: number): boolean {
  return total > displayed
}

/**
 * 生成个性化视频的 bvid 签名，用于通知去重。
 * 按 bvid 有序拼接，相同集合得到相同签名。
 */
export function buildPersonalizedSignature(items: VideoWithBvid[]): string {
  return items
    .map((v) => v.bvid)
    .sort()
    .join('|')
}

/** 上次通知的个性化签名（模块级，同一会话内去重） */
let lastNotifiedSignature = ''

/**
 * 生成个性化追加的 Toast 通知消息。
 *
 * @param count - 追加数量
 * @param titles - 追加的视频标题（可能超过 3 个）
 */
export function buildPersonalizedToastMessage(count: number, titles: string[]): string {
  const displayTitles = titles.slice(0, 3)
  let message = `个性化已追加 ${count} 条视频：${displayTitles.join('、')}`
  if (count > 3) message += ` 等${count}条`
  return message
}

// ============================================================
// Composable（Vue 响应式状态管理）
// ============================================================

export function useVideoList(options?: { getBlacklist?: () => string | undefined }) {
  // ---- 数据状态 ----
  const videosMap = ref<Map<string, VideoWithBvid>>(new Map())
  const displayedCount = ref(0)
  const totalCount = ref(0)
  const timestamp = ref(0)

  // ---- 加载状态 ----
  const initialLoading = ref(true)
  const initialError = ref<string | null>(null)
  const isRefreshing = ref(false)

  // ---- 防抖 ----
  let debounceTimer: ReturnType<typeof setTimeout>
  let requestVersion = 0

  // ---- 计算属性 ----
  /** 显示列表：取 Map 中全部值，排序后切片 */
  const displayedVideos = computed(() => {
    const allVideos = [...videosMap.value.values()].sort(compareByOnlineCount)
    return allVideos.slice(0, displayedCount.value)
  })

  /** 是否还有更多数据 */
  const hasMore = computed(() => hasMoreVideos(totalCount.value, displayedCount.value))

  // ---- 内部：执行一次 API 请求并更新状态 ----
  async function executeRefresh(
    queryBuilder: () => Record<string, any>,
    options?: { replace?: boolean },
  ) {
    const version = ++requestVersion
    isRefreshing.value = true

    try {
      const query = queryBuilder()
      const res = await $fetch<RankingResponse>('/api/ranking', { query })

      // 丢弃过期的请求响应（竞态保护）
      if (version !== requestVersion) return

      const replace = options?.replace ?? true
      if (replace) {
        // 过滤变化 / 首页加载：完全替换
        videosMap.value = new Map(res.items.map((v) => [v.bvid, v]))
        displayedCount.value = res.items.length
      }
      totalCount.value = res.total
      timestamp.value = res.timestamp

      // 注：个性化追加通知由 refreshPersonalized 统一处理（此处静默合并）
    } catch (e) {
      if (version === requestVersion && initialLoading.value) {
        initialError.value = (e as any)?.message || '加载失败'
      }
      // 过滤刷新失败 → 静默，保留旧数据
    }

    if (version === requestVersion) {
      isRefreshing.value = false
    }
  }

  // ---- 首次加载 ----
  async function loadInitial(queryBuilder: () => Record<string, any>) {
    initialLoading.value = true
    initialError.value = null
    try {
      await executeRefresh(queryBuilder, { replace: true })
      // 加载完成后自动刷新个性化（零用户操作，仅此一处触发）
      // 服务端 5 分钟缓存兜底：缓存新鲜时零 B站 请求，不会触发风控
      refreshPersonalized()
    } finally {
      if (initialLoading.value) {
        initialLoading.value = false
      }
    }
  }

  // ---- 过滤变化（带 300ms 防抖）----
  function refreshFilter(queryBuilder: () => Record<string, any>) {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      executeRefresh(queryBuilder, { replace: true })
    }, 300)
  }

  // ---- 即时刷新（视图切换 / 回顶，不防抖）----
  function forceRefresh(queryBuilder: () => Record<string, any>) {
    clearTimeout(debounceTimer)
    executeRefresh(queryBuilder, { replace: true })
    // 顺带刷新个性化（服务端 5 分钟缓存兜底：缓存新鲜时零 B站 请求，
    // 过期才拉取，不会因回顶/切视图频繁触发而打 B站）
    refreshPersonalized()
  }

  // ---- 加载更多 ----
  let isLoadingMore = false

  async function loadMore(queryBuilder: () => Record<string, any>) {
    if (isLoadingMore) return
    isLoadingMore = true
    try {
      const query = queryBuilder()
      const res = await $fetch<RankingResponse>('/api/ranking', { query })
      // 追加大新页视频到 Map
      for (const item of res.items) {
        videosMap.value.set(item.bvid, item)
      }
      displayedCount.value += res.items.length
    } finally {
      isLoadingMore = false
    }
  }

  // ---- 个性化刷新（增量合并）----
  async function refreshPersonalized() {
    try {
      const query = options?.getBlacklist
        ? { blacklist: options.getBlacklist() }
        : undefined
      const res = await $fetch<{ added: VideoWithBvid[] }>(
        '/api/ranking/personalized-refresh',
        { method: 'POST', query },
      )
      if (!res.added || res.added.length === 0) return

      // 合并总是执行（bvid 去重幂等）：
      // 个性化缓存过期后 GET /api/ranking 不再合并，若此处跳过合并，
      // 已从 Map 中被替换掉的个性化视频将无法恢复
      const allVideos = [...videosMap.value.values()]
      const existingBvids = new Set(allVideos.map((v) => v.bvid))
      const actuallyAdded = res.added.filter((v) => !existingBvids.has(v.bvid))

      const merged = mergeAndSortVideos(allVideos, res.added)
      videosMap.value = new Map(merged.map((v) => [v.bvid, v]))
      // 确保至少显示第一页
      displayedCount.value = Math.max(displayedCount.value, 30)

      // 仅通知去重：全部已存在或增量未变（返回相同集合）时不重复弹 toast
      if (actuallyAdded.length === 0) return
      const signature = buildPersonalizedSignature(res.added)
      if (signature === lastNotifiedSignature) return
      lastNotifiedSignature = signature

      // 通知（数量 = 实际新增数；标题按在线人数降序，最热门的排最前）
      const sortedAdded = actuallyAdded.slice().sort(compareByOnlineCount)
      const titles = sortedAdded.map((v) => v.title)
      const { showToast } = useToast()
      showToast(buildPersonalizedToastMessage(actuallyAdded.length, titles), 'info')
    } catch {
      // 静默（网络错误等不影响主流程）
    }
  }

  return {
    // 状态
    displayedVideos,
    initialLoading,
    initialError,
    isRefreshing,
    hasMore,
    totalCount,
    timestamp,
    // 方法
    loadInitial,
    refreshFilter,
    forceRefresh,
    loadMore,
    refreshPersonalized,
  }
}
