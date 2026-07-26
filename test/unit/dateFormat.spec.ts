/**
 * 日期格式化一致性测试
 *
 * 验证 toLocaleString('zh-CN', { ... }) 在固定 options 下输出确定且可预测，
 * 确保服务端（Node.js）和客户端（浏览器）渲染一致，避免 hydration mismatch。
 * 从 app/utils/date.ts 导入生产代码。
 */
import { describe, it, expect } from 'vitest'
import { formatDate, DATE_LOCALE_OPTIONS } from '../../app/utils/date'

describe('formatDate — 固定格式日期', () => {
  it('输出包含年/月/日/时/分/秒（固定格式，无地区差异）', () => {
    // 使用一个确定的日期：2026-01-15 08:30:45 UTC
    // 对于 zh-CN 时区（UTC+8），本地时间为 2026-01-15 16:30:45
    const ts = new Date('2026-01-15T08:30:45Z')
    const result = formatDate(ts)

    // 格式应为 "2026/01/15 16:30:45"（zh-CN 固定格式）
    // 验证包含所有必要部分
    expect(result).toMatch(/2026/)
    expect(result).toMatch(/01/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/16/)
    expect(result).toMatch(/30/)
    expect(result).toMatch(/45/)
    // 不包含 AM/PM（因为 hour12: false）
    expect(result).not.toMatch(/AM|PM|上午|下午/i)
  })

  it('输出格式匹配 zh-CN 预期模式：yyyy/MM/dd HH:mm:ss', () => {
    const ts = new Date('2026-07-25T12:00:00Z')
    const result = formatDate(ts)

    // zh-CN 固定格式示例: "2026/07/25 20:00:00"
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('时间戳 0（Unix epoch）正常格式化', () => {
    const result = formatDate(0)
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('极大时间戳不抛出异常', () => {
    const result = formatDate(8640000000000000) // JS 最大安全时间戳
    // 6 位年份（275760），格式仍然一致：yyyy/MM/dd HH:mm:ss
    expect(result).toMatch(/^\d{1,6}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/)
    // 不抛出异常即通过
  })

  it('负数时间戳（1970 之前）正常格式化', () => {
    const result = formatDate(-86400000) // 1969-12-31
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('相同输入多次调用输出一致（幂等性）', () => {
    const ts = 1700000000000
    const result1 = formatDate(ts)
    const result2 = formatDate(ts)
    const result3 = formatDate(ts)
    expect(result1).toBe(result2)
    expect(result2).toBe(result3)
  })

  it('常规时间戳输出长度固定为 19 字符（yyyy/MM/dd HH:mm:ss）', () => {
    const results = [
      formatDate(0),
      formatDate(1700000000000),
      formatDate(Date.now()),
    ]
    for (const r of results) {
      expect(r.length).toBe(19)
    }
  })

  it('不包含任何语言敏感的变体（如"星期几"、月份名称等）', () => {
    const result = formatDate(Date.now())
    // 不应包含中文文案（如"周一"、"1月"等，zh-CN 固定格式用数字）
    // 只允许数字、斜杠、冒号、空格
    expect(result).toMatch(/^[\d/: ]+$/)
  })
})

describe('无 options 的 toLocaleString 对比（演示问题）', () => {
  it('无 options 时输出格式不固定，含语言敏感内容 → 需要避免在 SSR 中使用', () => {
    // 不传 options 时，不同平台输出可能不同（如 "2026/7/25 20:00:00" vs "2026/7/25 下午8:00:00"）
    const ts = new Date('2026-07-25T12:00:00Z')
    const bareResult = new Date(ts).toLocaleString('zh-CN')

    // 无 options 版本在 Node.js 中通常是 "2026/7/25 20:00:00"（无前导零）
    // 但这个格式在不同 Node/ICU 版本中可能不同，这里只验证它存在
    expect(typeof bareResult).toBe('string')
    expect(bareResult.length).toBeGreaterThan(0)

    // 关键：带 options 的版本应该有前导零（月/日两位）
    const fixedResult = formatDate(ts)
    expect(fixedResult).toContain('/07/')
    expect(fixedResult).toContain('/25 ')
  })
})
