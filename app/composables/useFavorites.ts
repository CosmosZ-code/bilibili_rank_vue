/**
 * useFavorites — 用户收藏夹
 *
 * 管理 B站 收藏夹数据的获取和展示
 */
import type { FavoriteFolder, FavoriteItem } from '../types'

export function useFavorites() {
  const folders = ref<FavoriteFolder[]>([])
  const items = ref<FavoriteItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /**
   * 获取收藏夹列表
   */
  async function fetchFolders() {
    isLoading.value = true
    error.value = null

    try {
      const data = await $fetch<any>('/api/favorites')

      if (data.code === 0 && data.data) {
        const list: FavoriteFolder[] = (data.data.list || []).map((item: any) => ({
          id: item.id,
          title: item.title,
          cover: item.cover,
          media_count: item.media_count,
        }))
        folders.value = list
      }
    } catch (e: any) {
      if (e.statusCode === 401) {
        error.value = '请先设置 B站 Cookie'
      } else {
        error.value = e.message || '获取收藏夹失败'
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 获取指定收藏夹的视频列表
   */
  async function fetchFolderItems(mediaId: number, page: number = 1) {
    isLoading.value = true
    error.value = null

    try {
      const params = new URLSearchParams({
        media_id: String(mediaId),
        pn: String(page),
      })
      const data = await $fetch<any>(`/api/favorites?${params.toString()}`)

      if (data.code === 0 && data.data) {
        const medias: FavoriteItem[] = (data.data.medias || []).map((item: any) => ({
          title: item.title,
          bvid: item.bvid,
          cover: item.cover,
          upperName: item.upper?.name || '',
        }))
        items.value = medias
      }
    } catch (e: any) {
      if (e.statusCode === 401) {
        error.value = '请先设置 B站 Cookie'
      } else {
        error.value = e.message || '获取收藏视频失败'
      }
    } finally {
      isLoading.value = false
    }
  }

  return {
    // 状态
    folders,
    items,
    isLoading,
    error,
    // 操作
    fetchFolders,
    fetchFolderItems,
  }
}
