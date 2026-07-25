/**
 * rankingConstants 单元测试
 *
 * 测试 rankingCacheKey、isValidRid 及 VALID_RANKING_RIDS 常量。
 */
import { describe, it, expect } from 'vitest'
import {
  VALID_RANKING_RIDS,
  DEFAULT_RID,
  COMBINED_CACHE_KEY,
  rankingCacheKey,
  isValidRid,
} from '../../server/utils/rankingConstants'

describe('rankingCacheKey', () => {
  it("返回正确的缓存键格式 ranking:{rid}", () => {
    expect(rankingCacheKey('0')).toBe('ranking:0')
    expect(rankingCacheKey('1')).toBe('ranking:1')
    expect(rankingCacheKey('188')).toBe('ranking:188')
  })
})

describe('isValidRid', () => {
  it('合法 rid 返回 true', () => {
    expect(isValidRid('0')).toBe(true)
    expect(isValidRid('1')).toBe(true)
    expect(isValidRid('36')).toBe(true)
    expect(isValidRid('234')).toBe(true)
  })

  it('排除的 5 个分区返回 false（番剧/国创/电影/电视剧/纪录片）', () => {
    expect(isValidRid('11')).toBe(false)  // 电视剧
    expect(isValidRid('13')).toBe(false)  // 番剧
    expect(isValidRid('23')).toBe(false)  // 电影
    expect(isValidRid('167')).toBe(false) // 国创
    expect(isValidRid('177')).toBe(false) // 纪录片
  })

  it('不存在的 rid 返回 false', () => {
    expect(isValidRid('999')).toBe(false)
    expect(isValidRid('abc')).toBe(false)
    expect(isValidRid('-1')).toBe(false)
  })

  it('非字符串类型返回 false', () => {
    expect(isValidRid(undefined)).toBe(false)
    expect(isValidRid(null)).toBe(false)
    expect(isValidRid(0)).toBe(false)
    expect(isValidRid([])).toBe(false)
  })

  it('空字符串返回 false', () => {
    expect(isValidRid('')).toBe(false)
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

describe('DEFAULT_RID', () => {
  it("默认值为 '0'", () => {
    expect(DEFAULT_RID).toBe('0')
  })
})

describe('COMBINED_CACHE_KEY', () => {
  it("值为 'ranking:all'", () => {
    expect(COMBINED_CACHE_KEY).toBe('ranking:all')
  })
})
