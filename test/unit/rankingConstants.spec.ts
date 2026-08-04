/**
 * rankingConstants 单元测试
 *
 * 测试 rankingCacheKey 及 VALID_RANKING_RIDS 常量。
 */
import { describe, it, expect } from 'vitest'
import {
  VALID_RANKING_RIDS,
  COMBINED_CACHE_KEY,
  rankingCacheKey,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT_BY,
} from '../../server/utils/rankingConstants'

describe('rankingCacheKey', () => {
  it("返回正确的缓存键格式 ranking:{rid}", () => {
    expect(rankingCacheKey('0')).toBe('ranking:0')
    expect(rankingCacheKey('1')).toBe('ranking:1')
    expect(rankingCacheKey('188')).toBe('ranking:188')
  })
})

describe('VALID_RANKING_RIDS', () => {
  it('不包含排除的 5 个分区', () => {
    const excluded = ['11', '13', '23', '167', '177']
    for (const rid of excluded) {
      expect(VALID_RANKING_RIDS).not.toContain(rid)
    }
  })

  it('长度为 16', () => {
    expect(VALID_RANKING_RIDS).toHaveLength(16)
  })

  it('无重复值', () => {
    const unique = new Set(VALID_RANKING_RIDS)
    expect(unique.size).toBe(VALID_RANKING_RIDS.length)
  })

  it('包含默认 rid 0', () => {
    expect(VALID_RANKING_RIDS).toContain('0')
  })
})

describe('COMBINED_CACHE_KEY', () => {
  it("值为 'ranking:all'", () => {
    expect(COMBINED_CACHE_KEY).toBe('ranking:all')
  })
})

describe('DEFAULT_PAGE_SIZE', () => {
  it('默认值为 30', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(30)
  })

  it('为正整数', () => {
    expect(DEFAULT_PAGE_SIZE).toBeGreaterThan(0)
    expect(Number.isInteger(DEFAULT_PAGE_SIZE)).toBe(true)
  })
})

describe('DEFAULT_SORT_BY', () => {
  it("默认值为 'count'", () => {
    expect(DEFAULT_SORT_BY).toBe('count')
  })
})
