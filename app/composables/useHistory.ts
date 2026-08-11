/**
 * useHistory — 用户观看历史
 *
 * 管理 B站 观看历史数据的获取和展示
 */
import type { HistoryItem } from '../types'

export function useHistory() {
  const history = ref<HistoryItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(false)
  const nextPage = ref<{ max?: number; viewAt?: number }>({})

  /**
   * 获取观看历史
   */
  async function fetchHistory(max?: number, viewAt?: number) {
    isLoading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      if (max) params.set('max', String(max))
      if (viewAt) params.set('view_at', String(viewAt))

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
        hasMore.value = result.has_more || false
        nextPage.value = {
          max: result.cursor?.max,
          viewAt: result.cursor?.view_at,
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
   * 加载更多历史记录
   */
  function loadMore() {
    if (hasMore.value && !isLoading.value) {
      fetchHistory(nextPage.value.max, nextPage.value.viewAt)
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
