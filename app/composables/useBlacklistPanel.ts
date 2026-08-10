/**
 * useBlacklistPanel — 已屏蔽UP 列表分页面板逻辑（桌面下拉使用）
 *
 * 纯函数（computeBlacklistPage）导出供单元测试；
 * composable 用 ref 状态包装，供组件使用（依赖 Nuxt 自动导入）。
 * 移动端侧栏直接全量平铺（无分页），不依赖本 composable。
 */

import type { BlacklistItem } from '../types'
import { sortBlacklistByOwner } from './useBlacklist'

export const BLACKLIST_PAGE_SIZE = 10

/**
 * 纯函数：排序 + 分页 + 页码钳制（导出供单元测试）
 *
 * @param list     - 黑名单原始列表
 * @param page     - 请求页码（越界时钳制到合法范围）
 * @param pageSize - 每页条数
 * @returns 排序结果、总页数、当前页条目、钳制后的页码
 */
export function computeBlacklistPage(
  list: BlacklistItem[],
  page: number,
  pageSize = BLACKLIST_PAGE_SIZE,
): {
  sorted: BlacklistItem[]
  totalPages: number
  pageItems: BlacklistItem[]
  clampedPage: number
} {
  const sorted = sortBlacklistByOwner(list)
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const clampedPage = Math.min(Math.max(1, page), totalPages)
  const start = (clampedPage - 1) * pageSize
  return { sorted, totalPages, pageItems: sorted.slice(start, start + pageSize), clampedPage }
}

export function useBlacklistPanel(blockedUps: Ref<BlacklistItem[]>) {
  const page = ref(1)

  const state = computed(() => computeBlacklistPage(blockedUps.value, page.value))

  // 列表变化（取消屏蔽等）→ 页码越界时回退到最后一页
  watch(() => blockedUps.value.length, () => {
    if (page.value > state.value.totalPages) {
      page.value = Math.max(1, state.value.totalPages)
    }
  })

  return {
    page,
    totalPages: computed(() => state.value.totalPages),
    pageItems: computed(() => state.value.pageItems),
  }
}
