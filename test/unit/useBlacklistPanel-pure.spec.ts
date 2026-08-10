/**
 * useBlacklistPanel 纯函数单元测试
 *
 * 测试 computeBlacklistPage 的排序 + 分页 + 页码钳制逻辑
 * （不依赖 Nuxt 运行时，沿用项目 -pure 测试惯例）
 */
import { describe, it, expect } from 'vitest'
import { computeBlacklistPage, BLACKLIST_PAGE_SIZE } from '../../app/composables/useBlacklistPanel'
import type { BlacklistItem } from '../../app/types'

const mk = (mid: string, owner: string): BlacklistItem => ({ mid, owner })

describe('computeBlacklistPage — 排序 + 分页 + 页码钳制', () => {
  it('第一页返回排序后的前 pageSize 条', () => {
    const list = [mk('3', '张三'), mk('1', '王五'), mk('2', '李四'), mk('4', '赵六')]
    const result = computeBlacklistPage(list, 1, 3)
    // 李(li) < 王(wang) < 张(zhang) < 赵(zhao)
    expect(result.sorted.map((b) => b.owner)).toEqual(['李四', '王五', '张三', '赵六'])
    expect(result.pageItems.map((b) => b.owner)).toEqual(['李四', '王五', '张三'])
    expect(result.totalPages).toBe(2)
    expect(result.clampedPage).toBe(1)
  })

  it('第二页返回剩余条目', () => {
    const list = [mk('1', '王五'), mk('2', '李四'), mk('3', '张三'), mk('4', '赵六')]
    const result = computeBlacklistPage(list, 2, 3)
    expect(result.pageItems.map((b) => b.owner)).toEqual(['赵六'])
  })

  it('页码越界时钳制到最后一页', () => {
    const list = [mk('1', 'a'), mk('2', 'b'), mk('3', 'c'), mk('4', 'd'), mk('5', 'e')]
    const result = computeBlacklistPage(list, 9, 3)
    expect(result.clampedPage).toBe(2)
    expect(result.pageItems.map((b) => b.owner)).toEqual(['d', 'e'])
  })

  it('页码为 0 或负数时钳制到第一页', () => {
    const list = [mk('1', 'a'), mk('2', 'b')]
    expect(computeBlacklistPage(list, 0, 3).clampedPage).toBe(1)
    expect(computeBlacklistPage(list, -1, 3).clampedPage).toBe(1)
  })

  it('空列表：totalPages=1、pageItems 为空、页码钳制为 1', () => {
    const result = computeBlacklistPage([], 5)
    expect(result.totalPages).toBe(1)
    expect(result.pageItems).toEqual([])
    expect(result.clampedPage).toBe(1)
  })

  it('不修改原数组', () => {
    const list = [mk('1', '王五'), mk('2', '李四')]
    computeBlacklistPage(list, 1)
    expect(list.map((b) => b.owner)).toEqual(['王五', '李四'])
  })

  it('默认每页条数为 BLACKLIST_PAGE_SIZE', () => {
    const list = Array.from({ length: BLACKLIST_PAGE_SIZE + 3 }, (_, i) => mk(String(i), `UP${i}`))
    const result = computeBlacklistPage(list, 1)
    expect(result.pageItems).toHaveLength(BLACKLIST_PAGE_SIZE)
    expect(result.totalPages).toBe(2)
  })
})
