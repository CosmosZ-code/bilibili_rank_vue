/**
 * 退避延迟算法单元测试
 *
 * 测试 calculateBackoffDelay 纯函数的边界行为。
 */
import { describe, it, expect } from 'vitest'
import {
  calculateBackoffDelay,
  DEFAULT_REFRESH_INTERVAL_MS,
} from '../../server/utils/cacheWarmerConfig'

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

  it('第 4 次失败(3) → 240s（封顶）', () => {
    expect(calculateBackoffDelay(3)).toBe(240_000)
  })

  it('超过封顶(10) → 240s', () => {
    expect(calculateBackoffDelay(10)).toBe(240_000)
  })

  it('极大值(100) 仍返回封顶值', () => {
    expect(calculateBackoffDelay(100)).toBe(240_000)
  })

  it('负数输入应抛出错误', () => {
    expect(() => calculateBackoffDelay(-1)).toThrow('consecutiveFailures 不能为负数')
  })

  it('自定义 maxDelay 为 60s 时封顶为 60s', () => {
    // 退避序列 30s→60s→120s→240s，但 maxDelay=60s，所以 3rd failure 也会被截断
    expect(calculateBackoffDelay(0, 60_000)).toBe(30_000)
    expect(calculateBackoffDelay(1, 60_000)).toBe(60_000)
    expect(calculateBackoffDelay(2, 60_000)).toBe(60_000) // 120s 被截断
    expect(calculateBackoffDelay(3, 60_000)).toBe(60_000) // 240s 被截断
  })

  it('自定义 maxDelay 为 10s 时所有延迟截断为 10s', () => {
    expect(calculateBackoffDelay(0, 10_000)).toBe(10_000)
    expect(calculateBackoffDelay(5, 10_000)).toBe(10_000)
  })

  it('退避延迟不超过 DEFAULT_REFRESH_INTERVAL_MS', () => {
    // 默认封顶就是 DEFAULT_REFRESH_INTERVAL_MS
    const delay = calculateBackoffDelay(999)
    expect(delay).toBeLessThanOrEqual(DEFAULT_REFRESH_INTERVAL_MS)
    expect(delay).toBe(240_000) // 退避序列封顶值
  })

  it('连续失败次数递增，延迟不递减', () => {
    const delays = [0, 1, 2, 3, 4].map((n) => calculateBackoffDelay(n))
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1])
    }
  })
})
