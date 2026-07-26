/**
 * isPastScrollThreshold 纯函数单元测试
 *
 * 从 useScrollToTop composable 导入，测试滚动阈值判断的边界行为。
 */
import { describe, it, expect } from 'vitest'
import { isPastScrollThreshold } from '../../app/composables/useScrollToTop'

describe('isPastScrollThreshold — 滚动阈值判断', () => {
  const DEFAULT_THRESHOLD = 300

  it('scrollY > 阈值时返回 true（显示按钮）', () => {
    expect(isPastScrollThreshold(500, DEFAULT_THRESHOLD)).toBe(true)
    expect(isPastScrollThreshold(301, DEFAULT_THRESHOLD)).toBe(true)
  })

  it('scrollY <= 阈值时返回 false（隐藏按钮）', () => {
    expect(isPastScrollThreshold(300, DEFAULT_THRESHOLD)).toBe(false)
    expect(isPastScrollThreshold(150, DEFAULT_THRESHOLD)).toBe(false)
    expect(isPastScrollThreshold(0, DEFAULT_THRESHOLD)).toBe(false)
  })

  it('自定义阈值正常工作', () => {
    const threshold = 500
    expect(isPastScrollThreshold(501, threshold)).toBe(true)
    expect(isPastScrollThreshold(500, threshold)).toBe(false)
    expect(isPastScrollThreshold(100, threshold)).toBe(false)
  })

  it('scrollY 为 NaN 时返回 false', () => {
    expect(isPastScrollThreshold(NaN, DEFAULT_THRESHOLD)).toBe(false)
  })

  it('scrollY 为 Infinity 时返回 true', () => {
    expect(isPastScrollThreshold(Infinity, DEFAULT_THRESHOLD)).toBe(true)
  })

  it('scrollY 为负值时返回 false', () => {
    expect(isPastScrollThreshold(-100, DEFAULT_THRESHOLD)).toBe(false)
  })

  it('阈值为 0 时 scrollY > 0 返回 true', () => {
    expect(isPastScrollThreshold(1, 0)).toBe(true)
    expect(isPastScrollThreshold(0, 0)).toBe(false)
  })

  it('极大阈值下 scrollY 不通过', () => {
    expect(isPastScrollThreshold(1000, 10000)).toBe(false)
  })
})
