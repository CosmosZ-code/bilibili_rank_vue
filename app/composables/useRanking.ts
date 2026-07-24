/**
 * useRanking — 排行榜数据管理
 *
 * 管理视频列表的获取、排序、搜索过滤、纯净度过滤
 * 对应原 index.html 内嵌 <script> 中的 videosData / currentSort / searchTerm / purifyPercent
 */
import type { VideoInfo, VideosDataMap, SortBy } from '../types'

export function useRanking() {
  // 原始视频数据（BV 号 → VideoInfo）
  const videosData = ref<VideosDataMap>({})

  // 排序方式
  const sortBy = ref<SortBy>('count')

  // 搜索关键词
  const searchTerm = ref('')

  // 纯净度百分比（默认 20%）
  const purifyPercent = ref(20)

  // 加载状态
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 数据更新时间
  const updateTime = ref('')

  // 是否已加载过数据
  const isLoaded = ref(false)

  /**
   * 获取排行榜数据
   */
  async function fetchRanking() {
    isLoading.value = true
    error.value = null

    try {
      const data = await $fetch<VideosDataMap>('/api/ranking', {
        onResponse({ response }) {
          // 从响应头获取缓存状态
          const lastModified = response.headers.get('last-modified')
          if (lastModified) {
            updateTime.value = new Date(lastModified).toLocaleString('zh-CN', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit',
              hour12: false,
            })
          }
        },
      })

      // 更新数据
      videosData.value = data

      // 记录更新时间
      if (!updateTime.value) {
        updateTime.value = new Date().toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false,
        })
      }

      isLoaded.value = true
    } catch (e: any) {
      error.value = e.message || '加载失败'
      console.error('获取排行榜数据失败:', e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 排序 + 过滤后的视频数组（按 count_num 降序）
   */
  const filteredVideos = computed<VideoInfo[]>(() => {
    // 转换为数组
    let list: (VideoInfo & { bvid: string })[] = Object.entries(videosData.value).map(
      ([bvid, info]) => ({
        bvid,
        ...info,
      }),
    )

    // 排序：按 online_count 原始数值降序
    if (sortBy.value === 'count') {
      list.sort((a, b) => b.count_num - a.count_num)
    }

    // 文本搜索过滤
    if (searchTerm.value.trim()) {
      const term = searchTerm.value.toLowerCase()
      list = list.filter(
        (video) =>
          video.title.toLowerCase().includes(term) ||
          video.owner.toLowerCase().includes(term),
      )
    }

    // 纯净度过滤
    // 规则：弹幕数 > 10000 或 弹幕数 * 66 >= 播放量 * purifyPercent / 100
    if (purifyPercent.value > 0) {
      list = list.filter((video) => {
        if (video.danmaku_count_num > 10000) return true
        return (
          video.danmaku_count_num * 66 >=
          (video.play_count_num * purifyPercent.value) / 100
        )
      })
    }

    return list
  })

  return {
    // 状态
    videosData,
    sortBy,
    searchTerm,
    purifyPercent,
    isLoading,
    error,
    updateTime,
    isLoaded,
    // 计算
    filteredVideos,
    // 操作
    fetchRanking,
  }
}
