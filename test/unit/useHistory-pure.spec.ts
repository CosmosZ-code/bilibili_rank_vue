/**
 * useHistory 纯函数单元测试
 *
 * 测试 hasHistoryMorePages（页数上限，最多 HISTORY_MAX_PAGES 页）与
 * hasHistoryMoreByPageSize（B站历史接口无 has_more 字段，以"是否拉满一页"判定）
 * （不依赖 Nuxt 运行时，沿用项目 -pure 测试惯例）
 */
import { describe, it, expect } from 'vitest'
import {
  hasHistoryMorePages,
  hasHistoryMoreByPageSize,
  HISTORY_MAX_PAGES,
  HISTORY_PAGE_SIZE,
} from '../../app/composables/useHistory'

describe('hasHistoryMorePages — 历史分页上限判定', () => {
  it('服务端还有更多且未超过上限时返回 true', () => {
    expect(hasHistoryMorePages(true, 1)).toBe(true)
    expect(hasHistoryMorePages(true, HISTORY_MAX_PAGES - 1)).toBe(true)
  })

  it('服务端没有更多时返回 false', () => {
    expect(hasHistoryMorePages(false, 1)).toBe(false)
    expect(hasHistoryMorePages(false, HISTORY_MAX_PAGES)).toBe(false)
  })

  it('达到上限页数后不再加载（最多 HISTORY_MAX_PAGES 页）', () => {
    expect(hasHistoryMorePages(true, HISTORY_MAX_PAGES)).toBe(false)
    expect(hasHistoryMorePages(true, HISTORY_MAX_PAGES + 1)).toBe(false)
  })

  it('支持自定义 maxPages', () => {
    expect(hasHistoryMorePages(true, 1, 2)).toBe(true)
    expect(hasHistoryMorePages(true, 2, 2)).toBe(false)
  })

  it('默认上限为 HISTORY_MAX_PAGES', () => {
    expect(HISTORY_MAX_PAGES).toBe(3)
    expect(hasHistoryMorePages(true, HISTORY_MAX_PAGES)).toBe(false)
  })
})

describe('hasHistoryMoreByPageSize — 无 has_more 字段的游标分页判定', () => {
  it('拉满一页（默认 20 条）视为还有下一页', () => {
    expect(hasHistoryMoreByPageSize(HISTORY_PAGE_SIZE)).toBe(true)
    expect(hasHistoryMoreByPageSize(25)).toBe(true)
  })

  it('末页不足一页视为结束', () => {
    expect(hasHistoryMoreByPageSize(HISTORY_PAGE_SIZE - 1)).toBe(false)
    expect(hasHistoryMoreByPageSize(1)).toBe(false)
  })

  it('空页（翻到底）返回 false 自纠正', () => {
    expect(hasHistoryMoreByPageSize(0)).toBe(false)
  })

  it('支持自定义 pageSize', () => {
    expect(hasHistoryMoreByPageSize(3, 3)).toBe(true)
    expect(hasHistoryMoreByPageSize(2, 3)).toBe(false)
  })

  it('默认页大小为 HISTORY_PAGE_SIZE', () => {
    expect(HISTORY_PAGE_SIZE).toBe(20)
  })
})
