/**
 * history 格式化纯函数单元测试
 *
 * 测试 app/utils/history.ts 的时长/进度/观看时间格式化逻辑
 * （HistoryDropdown 与 MobileSidebar 共用，不依赖 Nuxt 运行时）
 */
import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatViewTime,
  progressPercent,
  effectiveProgress,
} from '../../app/utils/history'

describe('formatDuration — 秒 → 时长文本', () => {
  it('不足一小时：mm:ss', () => {
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(9)).toBe('00:09')
  })

  it('超过一小时：H:mm:ss', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
  })

  it('0、负数或空值返回空字符串', () => {
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(-5)).toBe('')
  })
})

describe('effectiveProgress / progressPercent — 观看进度', () => {
  it('progress=0 视为已看完，回退为总时长', () => {
    expect(effectiveProgress({ progress: 0, duration: 120 })).toBe(120)
    expect(effectiveProgress({ progress: 30, duration: 120 })).toBe(30)
  })

  it('progressPercent 计算百分比并钳制到 100', () => {
    expect(progressPercent({ progress: 30, duration: 120 })).toBe(25)
    expect(progressPercent({ progress: 120, duration: 120 })).toBe(100)
    expect(progressPercent({ progress: 150, duration: 120 })).toBe(100)
    expect(progressPercent({ progress: 0, duration: 0 })).toBe(0)
  })
})

describe('formatViewTime — 观看时间相对化', () => {
  it('今天 → "今天 HH:mm"', () => {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    expect(formatViewTime(Math.floor(now.getTime() / 1000))).toBe(`今天 ${time}`)
  })

  it('昨天 → "昨天 HH:mm"', () => {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    y.setHours(10, 30, 0, 0)
    expect(formatViewTime(Math.floor(y.getTime() / 1000))).toBe('昨天 10:30')
  })

  it('今年 → "MM-DD HH:mm"', () => {
    const d = new Date()
    d.setMonth(4, 15)
    d.setHours(8, 5, 0, 0)
    expect(formatViewTime(Math.floor(d.getTime() / 1000))).toBe('05-15 08:05')
  })

  it('往年 → "YYYY-MM-DD HH:mm"', () => {
    const now = new Date()
    const year = now.getFullYear() - 1
    const d = new Date(year, 11, 31, 23, 59, 0)
    expect(formatViewTime(Math.floor(d.getTime() / 1000))).toBe(`${year}-12-31 23:59`)
  })

  it('0 或空返回空字符串', () => {
    expect(formatViewTime(0)).toBe('')
  })
})
