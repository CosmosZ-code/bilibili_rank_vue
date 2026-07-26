/**
 * cacheWarmerConfig 单元测试
 *
 * 测试 resolveRefreshInterval 和 calculateBackoffDelay 纯函数的边界行为。
 */
import { describe, it, expect } from 'vitest'
import {
  resolveRefreshInterval,
  calculateBackoffDelay,
  DEFAULT_REFRESH_INTERVAL_MS,
} from '../../server/utils/cacheWarmerConfig'

const DEFAULT = DEFAULT_REFRESH_INTERVAL_MS // 6 * 60 * 1000 = 360000

describe('resolveRefreshInterval', () => {
  it('undefined 返回默认值', () => {
    expect(resolveRefreshInterval(undefined, DEFAULT)).toBe(DEFAULT)
  })

  it('合法正整数字符串返回解析值', () => {
    expect(resolveRefreshInterval('60000', DEFAULT)).toBe(60000)
  })

  it('"0" 返回默认值', () => {
    expect(resolveRefreshInterval('0', DEFAULT)).toBe(DEFAULT)
  })

  it('负值返回默认值', () => {
    expect(resolveRefreshInterval('-1000', DEFAULT)).toBe(DEFAULT)
  })

  it('非数字字符串返回默认值', () => {
    expect(resolveRefreshInterval('abc', DEFAULT)).toBe(DEFAULT)
  })

  it('空字符串返回默认值', () => {
    expect(resolveRefreshInterval('', DEFAULT)).toBe(DEFAULT)
  })

  it('Infinity 字符串返回默认值', () => {
    expect(resolveRefreshInterval('Infinity', DEFAULT)).toBe(DEFAULT)
  })

  it('浮点数返回解析值（毫秒精度足够）', () => {
    expect(resolveRefreshInterval('120000.5', DEFAULT)).toBe(120000.5)
  })

  it('十分钟间隔', () => {
    expect(resolveRefreshInterval('600000', DEFAULT)).toBe(600000)
  })
})

describe('calculateBackoffDelay — 退避延迟计算', () => {
  it('首次失败(0) → 30s', () => {
    expect(calculateBackoffDelay(0)).toBe(30_000)
  })

  it('第 2 次失败(1) → 60s', () => {
    expect(calculateBackoffDelay(1)).toBe(60_000)
  })

  it('第 3 次失败(2) → 120s', () => {
    expect(calculateBackoffDelay(2)).toBe(120_000)
  })

  it('第 4 次失败(3) → 240s', () => {
    expect(calculateBackoffDelay(3)).toBe(240_000)
  })

  it('第 5 次失败(4) → 480s（封顶）', () => {
    expect(calculateBackoffDelay(4)).toBe(480_000)
  })

  it('超过封顶(10) → 480s', () => {
    expect(calculateBackoffDelay(10)).toBe(480_000)
  })

  it('极大值(100) 仍返回封顶值', () => {
    expect(calculateBackoffDelay(100)).toBe(480_000)
  })

  it('退避延迟封顶值等于序列最大值 480s', () => {
    const delay = calculateBackoffDelay(999)
    expect(delay).toBe(480_000)
  })

  it('连续失败次数递增，延迟不递减', () => {
    const delays = [0, 1, 2, 3, 4, 5].map((n) => calculateBackoffDelay(n))
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1])
    }
  })

  it('负数输入应抛出错误', () => {
    expect(() => calculateBackoffDelay(-1)).toThrow('consecutiveFailures 不能为负数')
  })

  it('自定义 maxDelay 为 60s 时封顶为 60s', () => {
    // 退避序列 30s→60s→120s→240s→480s，但 maxDelay=60s
    expect(calculateBackoffDelay(0, 60_000)).toBe(30_000)
    expect(calculateBackoffDelay(1, 60_000)).toBe(60_000)
    expect(calculateBackoffDelay(2, 60_000)).toBe(60_000) // 120s 被截断
    expect(calculateBackoffDelay(3, 60_000)).toBe(60_000) // 240s 被截断
  })

  it('自定义 maxDelay 为 10s 时所有延迟截断为 10s', () => {
    expect(calculateBackoffDelay(0, 10_000)).toBe(10_000)
    expect(calculateBackoffDelay(5, 10_000)).toBe(10_000)
  })
})
