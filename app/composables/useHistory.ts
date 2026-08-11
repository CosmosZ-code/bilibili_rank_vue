/**
 * useHistory — 用户观看历史
 *
 * 管理 B站 观看历史数据的获取和展示
 */
import type { HistoryItem } from '../types'

/**
 * 历史列表最多加载的页数（游标分页，每页约 20 条）
 */
export const HISTORY_MAX_PAGES = 3

/**
 * B站历史游标接口每页条数（ps 默认值，见 bilibili-API-collect history.md）
 */
export const HISTORY_PAGE_SIZE = 20

/**
 * 是否还有下一页可加载（纯函数，便于单元测试）
 */
export function hasHistoryMorePages(hasMore: boolean, pagesLoaded: number, maxPages = HISTORY_MAX_PAGES) {
  return hasMore && pagesLoaded < maxPages
}

/**
 * 该接口无 has_more 字段（IFS 链表式分页）：本页拉满一页视为还有更多，
 * 末页不足一页（含空页）即结束
 */
export function hasHistoryMoreByPageSize(itemsLength: number, pageSize = HISTORY_PAGE_SIZE) {
  return itemsLength >= pageSize
}

export function useHistory() {
  const history = ref<HistoryItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(false)
  const nextPage = ref<{ max?: number; viewAt?: number; business?: string }>({})

  /**
   * 获取观看历史（max/viewAt/business 为上一页 cursor 的"截止点"游标）
   */
  async function fetchHistory(max?: number, viewAt?: number, business?: string) {
    isLoading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      if (max) params.set('max', String(max))
      if (viewAt) params.set('view_at', String(viewAt))
      if (business) params.set('business', business)

      const url = `/api/history${params.toString() ? '?' + params.toString() : ''}`
      const data = await $fetch<any>(url)

      // 解析 B站 API 标准响应
      if (data.code === 0 && data.data) {
        const result = data.data
        const items: HistoryItem[] = (result.list || []).map((item: any) => {
          // 直播项 bvid 为空，直播间 ID 在 history.oid
          const isLive = item.history?.business === 'live'
          return {
            title: item.title || '',
            bvid: item.bvid || item.history?.bvid || '',
            cover: item.cover || item.covers?.[0] || '',
            ownerName: item.author_name || item.owner?.name || '',
            viewAt: item.view_at || 0,
            progress: item.progress || 0,
            duration: item.duration || 0,
            isLive,
            roomId: isLive ? item.history?.oid : undefined,
          }
        })

        history.value = [...history.value, ...items]
        // 该接口无 has_more 字段：以"本页是否拉满一页"判断是否还有下一页
        hasMore.value = hasHistoryMoreByPageSize(items.length)
        nextPage.value = {
          max: result.cursor?.max,
          viewAt: result.cursor?.view_at,
          business: result.cursor?.business,
        }
      }
    } catch (e: any) {
      if (e.statusCode === 401) {
        error.value = '请先设置 B站 Cookie'
      } else {
        error.value = e.message || '获取历史记录失败'
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 加载更多历史记录（返回本次请求的 Promise，调用方可感知加载完成）
   */
  function loadMore() {
    if (hasMore.value && !isLoading.value) {
      return fetchHistory(nextPage.value.max, nextPage.value.viewAt, nextPage.value.business)
    }
  }

  return {
    // 状态
    history,
    isLoading,
    error,
    hasMore,
    // 操作
    fetchHistory,
    loadMore,
  }
}
