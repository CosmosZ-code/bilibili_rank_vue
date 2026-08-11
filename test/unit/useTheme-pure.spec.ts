/**
 * useTheme 纯函数单元测试
 *
 * 测试 nextTheme / normalizeThemeMode / resolveTheme 的主题切换逻辑
 * （不依赖 Nuxt 运行时，沿用项目 -pure 测试惯例）
 */
import { describe, it, expect } from 'vitest'
import {
  nextTheme,
  normalizeThemeMode,
  resolveTheme,
  readCookieFromRawHeaders,
} from '../../app/composables/useTheme'

describe('nextTheme — 三态循环顺序', () => {
  it('日间 → 夜间', () => {
    expect(nextTheme('light')).toBe('dark')
  })

  it('夜间 → 跟随系统', () => {
    expect(nextTheme('dark')).toBe('auto')
  })

  it('跟随系统 → 日间（完整循环）', () => {
    expect(nextTheme('auto')).toBe('light')
  })

  it('连续点击三次回到初始模式', () => {
    expect(nextTheme(nextTheme(nextTheme('light')))).toBe('light')
    expect(nextTheme(nextTheme(nextTheme('dark')))).toBe('dark')
    expect(nextTheme(nextTheme(nextTheme('auto')))).toBe('auto')
  })
})

describe('normalizeThemeMode — 非法值回退 auto', () => {
  it('合法值原样保留', () => {
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('dark')
    expect(normalizeThemeMode('auto')).toBe('auto')
  })

  it('非法字符串回退 auto（cookie 被篡改时的兜底）', () => {
    expect(normalizeThemeMode('blue')).toBe('auto')
    expect(normalizeThemeMode('')).toBe('auto')
  })

  it('null / undefined 回退 auto（未设置时的默认）', () => {
    expect(normalizeThemeMode(null)).toBe('auto')
    expect(normalizeThemeMode(undefined)).toBe('auto')
  })
})

describe('resolveTheme — 实际生效主题解析', () => {
  it('显式日间/夜间直接返回，不依赖系统偏好', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('auto + 系统偏好暗色 → 夜间', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
  })

  it('auto + 系统偏好亮色 → 日间', () => {
    expect(resolveTheme('auto', false)).toBe('light')
  })

  it('auto + 无法获取系统偏好（SSR 场景，prefersDark 为 null）→ 日间', () => {
    expect(resolveTheme('auto', null)).toBe('light')
  })
})

describe('readCookieFromRawHeaders — 从 Node req rawHeaders 解析 cookie', () => {
  const raw = ['Host', 'localhost:3000', 'Cookie', 'theme_mode=dark; purify_percent=10']

  it('解析到指定 cookie', () => {
    expect(readCookieFromRawHeaders({ rawHeaders: raw }, 'theme_mode')).toBe('dark')
  })

  it('多 cookie 中只取目标 cookie', () => {
    expect(readCookieFromRawHeaders({ rawHeaders: raw }, 'purify_percent')).toBe('10')
  })

  it('cookie 不存在返回 null', () => {
    expect(readCookieFromRawHeaders({ rawHeaders: raw }, 'not_exists')).toBe(null)
  })

  it('无 Cookie 头返回 null', () => {
    expect(readCookieFromRawHeaders({ rawHeaders: ['Host', 'localhost:3000'] }, 'theme_mode')).toBe(null)
  })

  it('空/缺失 rawHeaders 返回 null（unenv 或运行时异常时安全兜底）', () => {
    expect(readCookieFromRawHeaders(null, 'theme_mode')).toBe(null)
    expect(readCookieFromRawHeaders(undefined, 'theme_mode')).toBe(null)
    expect(readCookieFromRawHeaders({}, 'theme_mode')).toBe(null)
    expect(readCookieFromRawHeaders({ rawHeaders: ['Cookie'] }, 'theme_mode')).toBe(null)
  })

  it('Cookie 头大小写不敏感', () => {
    expect(readCookieFromRawHeaders({ rawHeaders: ['Host', 'h', 'cOoKiE', 'theme_mode=light'] }, 'theme_mode')).toBe('light')
  })

  it('URL 编码值正确解码（useCookie 写入时 encodeURIComponent）', () => {
    const encoded = encodeURIComponent('dark')
    expect(readCookieFromRawHeaders({ rawHeaders: ['Cookie', `theme_mode=${encoded}`] }, 'theme_mode')).toBe('dark')
  })

  it('cookie 名中的正则特殊字符被转义', () => {
    expect(readCookieFromRawHeaders({ rawHeaders: ['Cookie', 'a.b=1; c[2]=3'] }, 'c[2]')).toBe('3')
  })
})
