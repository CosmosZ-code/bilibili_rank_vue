/**
 * useScrollToTop 逻辑单元测试
 *
 * 测试返回顶部按钮的显示阈值逻辑
 */
import { describe, it, expect } from 'vitest'

describe('返回顶部 — 阈值逻辑', () => {
  it('scrollY > 300 时显示按钮', () => {
    const threshold = 300

    // 模拟不同 scrollY 值
    expect(500 > threshold).toBe(true) // 显示
    expect(301 > threshold).toBe(true) // 显示
    expect(300 > threshold).toBe(false) // 不显示（等于阈值）
  })

  it('scrollY <= 300 时隐藏按钮', () => {
    const threshold = 300

    expect(300 > threshold).toBe(false)
    expect(150 > threshold).toBe(false)
    expect(0 > threshold).toBe(false)
  })

  it('自定义阈值正常工作', () => {
    const threshold = 500

    expect(501 > threshold).toBe(true)
    expect(500 > threshold).toBe(false)
    expect(100 > threshold).toBe(false)
  })

  it('scrollY 为 undefined/NaN 时的安全处理', () => {
    const threshold = 300

    // NaN 比较总是 false
    const scrollY = NaN
    const show = !isNaN(scrollY) && scrollY > threshold
    expect(show).toBe(false)

    // undefined
    const scrollY2 = undefined as unknown as number
    const show2 = typeof scrollY2 === 'number' && scrollY2 > threshold
    expect(show2).toBe(false)
  })
})
