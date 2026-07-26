/**
 * 视图切换 — shouldSkipRefresh 纯函数单元测试
 *
 * 验证时间戳比较逻辑：服务端缓存 timestamp 与本地记录比较，
 * 决定是否跳过数据刷新。
 */
import { describe, it, expect } from 'vitest'

/**
 * shouldSkipRefresh 纯函数（与 index.vue 保持同步）
 *
 * @param serverTimestamp - 服务端缓存时间戳（来自 /api/xxx/timestamp 端点）
 * @param localTimestamp  - 本地记录的最近一次数据时间戳
 * @returns true 表示可跳过刷新（数据未变化），false 表示需要刷新
 */
function shouldSkipRefresh(
  serverTimestamp: number,
  localTimestamp: number | undefined,
): boolean {
  return !!(
    serverTimestamp &&
    localTimestamp &&
    serverTimestamp === localTimestamp
  )
}

describe('shouldSkipRefresh — 时间戳比较逻辑', () => {
  describe('无需刷新（返回 true）', () => {
    it('时间戳相同 → 跳过刷新', () => {
      expect(shouldSkipRefresh(1000, 1000)).toBe(true)
    })

    it('极大时间戳（Date.now()）相同 → 跳过刷新', () => {
      const now = Date.now()
      expect(shouldSkipRefresh(now, now)).toBe(true)
    })

    it('极小时间戳（1）相同 → 跳过刷新', () => {
      expect(shouldSkipRefresh(1, 1)).toBe(true)
    })
  })

  describe('需要刷新（返回 false）', () => {
    it('服务端更新（更大时间戳）→ 需要刷新', () => {
      expect(shouldSkipRefresh(2000, 1000)).toBe(false)
    })

    it('服务端更旧（异常情况）→ 需要刷新', () => {
      expect(shouldSkipRefresh(500, 1000)).toBe(false)
    })

    it('服务端缓存为空（timestamp=0）→ 需要刷新', () => {
      expect(shouldSkipRefresh(0, 1000)).toBe(false)
    })

    it('首次访问无本地记录（localTimestamp=0）→ 需要刷新', () => {
      expect(shouldSkipRefresh(1000, 0)).toBe(false)
    })

    it('双方均为空（timestamp=0, localTimestamp=0）→ 需要刷新', () => {
      expect(shouldSkipRefresh(0, 0)).toBe(false)
    })

    it('本地记录为 undefined（新分区首次访问）→ 需要刷新', () => {
      expect(shouldSkipRefresh(1000, undefined)).toBe(false)
    })

    it('服务端 timestamp 为 NaN → 需要刷新', () => {
      expect(shouldSkipRefresh(NaN, 1000)).toBe(false)
    })
  })
})
