/**
 * API Guard 核心逻辑 — 单元测试
 *
 * 测试 checkOrigin 纯函数的所有分支，不依赖 Nuxt 运行时。
 */
import { describe, it, expect } from 'vitest'
import {
  checkOrigin,
  parseAllowedOrigins,
  extractOriginFromReferer,
} from '../../server/utils/apiGuard'

const ALLOWED_ORIGINS = ['https://bilibili.zhyv.net']

// ════════════════════════════════════════════════════════════════
// checkOrigin
// ════════════════════════════════════════════════════════════════

describe('checkOrigin', () => {
  // ── 用例 1：SSR 内部调用 ──
  it('SSR 内部调用 — 无 Origin/Referer 放行', () => {
    expect(checkOrigin({}, '/api/ranking', ALLOWED_ORIGINS)).toEqual({
      allowed: true,
    })
  })

  // ── 用例 2：同源浏览器 ──
  it('同源浏览器 — Origin 匹配白名单放行', () => {
    expect(
      checkOrigin(
        { origin: 'https://bilibili.zhyv.net' },
        '/api/ranking',
        ALLOWED_ORIGINS,
      ),
    ).toEqual({ allowed: true })
  })

  // ── 用例 3：跨域攻击 ──
  it('跨域攻击 — Origin 不匹配且 Referer 不匹配 → 403', () => {
    const result = checkOrigin(
      {
        origin: 'https://evil.com',
        referer: 'https://evil.com/scrape.html',
      },
      '/api/ranking',
      ALLOWED_ORIGINS,
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('origin not allowed')
  })

  // ── 用例 4：Health check 路径绕过 ──
  it('/api/health 无头放行（Docker health check）', () => {
    expect(checkOrigin({}, '/api/health', ALLOWED_ORIGINS)).toEqual({
      allowed: true,
    })
  })

  it('/api/health 即使跨域 Origin 也放行', () => {
    expect(
      checkOrigin(
        { origin: 'https://evil.com' },
        '/api/health',
        ALLOWED_ORIGINS,
      ),
    ).toEqual({ allowed: true })
  })

  // ── 补充用例：Referer 降级兜底 ──
  it('无 Origin 但 Referer 匹配白名单 → 放行', () => {
    expect(
      checkOrigin(
        { referer: 'https://bilibili.zhyv.net/' },
        '/api/ranking',
        ALLOWED_ORIGINS,
      ),
    ).toEqual({ allowed: true })
  })

  it('无 Origin 但 Referer 子路径也匹配', () => {
    expect(
      checkOrigin(
        { referer: 'https://bilibili.zhyv.net/some/page?q=1' },
        '/api/ranking',
        ALLOWED_ORIGINS,
      ),
    ).toEqual({ allowed: true })
  })

  it('无 Origin 且 Referer 不匹配 → 403', () => {
    const result = checkOrigin(
      { referer: 'https://other-site.com/page' },
      '/api/ranking',
      ALLOWED_ORIGINS,
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('origin not allowed')
  })

  // ── 补充用例：多域名白名单 ──
  it('多域名白名单 — 匹配第二个', () => {
    const origins = ['https://a.com', 'https://b.com', 'https://c.com']
    expect(
      checkOrigin({ origin: 'https://b.com' }, '/api/banners', origins),
    ).toEqual({ allowed: true })
  })

  // ── 补充用例：非 API 路径跳过 ──
  it('非 /api/ 路径直接放行', () => {
    expect(checkOrigin({}, '/', ALLOWED_ORIGINS)).toEqual({
      allowed: true,
    })
  })

  it('静态资源路径放行', () => {
    expect(
      checkOrigin({}, '/_nuxt/some-chunk.js', ALLOWED_ORIGINS),
    ).toEqual({ allowed: true })
  })

  // ── 补充用例：白名单为空的安全兜底 ──
  it('白名单为空时放行（避免配置缺失断网）', () => {
    expect(
      checkOrigin({ origin: 'https://evil.com' }, '/api/ranking', []),
    ).toEqual({ allowed: true })
  })

  // ── 补充用例：自定义 skipPaths ──
  it('自定义 skipPaths', () => {
    expect(
      checkOrigin({}, '/api/custom', ALLOWED_ORIGINS, new Set(['/api/custom'])),
    ).toEqual({ allowed: true })
  })

  // ── 边缘用例：Origin 大小写 ──
  it('Origin 大小写不同应拒绝（严格匹配）', () => {
    const result = checkOrigin(
      { origin: 'HTTPS://BILIBILI.ZHYV.NET' },
      '/api/ranking',
      ALLOWED_ORIGINS,
    )
    expect(result.allowed).toBe(false)
  })

  // ── 边缘用例：Origin 带 trailing slash ──
  it('Origin 带 trailing slash 应拒绝', () => {
    const result = checkOrigin(
      { origin: 'https://bilibili.zhyv.net/' },
      '/api/ranking',
      ALLOWED_ORIGINS,
    )
    expect(result.allowed).toBe(false)
  })

  // ── 边缘用例：同域名但不同端口 ──
  it('同域名但不同端口应拒绝', () => {
    const result = checkOrigin(
      { origin: 'https://bilibili.zhyv.net:8443' },
      '/api/ranking',
      ALLOWED_ORIGINS,
    )
    expect(result.allowed).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════
// parseAllowedOrigins
// ════════════════════════════════════════════════════════════════

describe('parseAllowedOrigins', () => {
  it('单个域名', () => {
    expect(parseAllowedOrigins('https://example.com')).toEqual([
      'https://example.com',
    ])
  })

  it('多个逗号分隔域名', () => {
    expect(parseAllowedOrigins('https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ])
  })

  it('忽略空白和空段', () => {
    expect(
      parseAllowedOrigins('  https://a.com , , https://b.com , '),
    ).toEqual(['https://a.com', 'https://b.com'])
  })

  it('空字符串返回空数组', () => {
    expect(parseAllowedOrigins('')).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════
// extractOriginFromReferer
// ════════════════════════════════════════════════════════════════

describe('extractOriginFromReferer', () => {
  it('提取完整 URL 的 origin', () => {
    expect(extractOriginFromReferer('https://example.com/page?q=1')).toBe(
      'https://example.com',
    )
  })

  it('根路径', () => {
    expect(extractOriginFromReferer('https://example.com/')).toBe(
      'https://example.com',
    )
  })

  it('带端口', () => {
    expect(extractOriginFromReferer('https://example.com:3000/path')).toBe(
      'https://example.com:3000',
    )
  })

  it('非法 URL 返回 null', () => {
    expect(extractOriginFromReferer('not-a-url')).toBeNull()
  })

  it('空字符串返回 null', () => {
    expect(extractOriginFromReferer('')).toBeNull()
  })
})
