/**
 * B站 Cookie 续期 单元测试
 *
 * 测试 server/utils/bilibili.ts 中续期相关函数：
 * - getCookieValue: Cookie 字段提取
 * - generateCorrespondPath: RSA-OAEP 加密生成 correspondPath
 * - checkCookieRefresh / getRefreshCsrf / refreshBilibiliCookie: 四步续期流程（mock fetch）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// 全局 mock
// ============================================================
const mockFetch = vi.fn()

function setupGlobals() {
  ;(globalThis as any).createError = (opts: { statusCode: number; message: string; statusMessage?: string }) => {
    const err = new Error(opts.message) as Error & { statusCode: number; message: string }
    err.statusCode = opts.statusCode
    err.message = opts.message
    return err
  }
  vi.stubGlobal('fetch', mockFetch)
}

setupGlobals()

// 每次测试前重新导入模块（清除模块级状态）
type BilibiliModule = typeof import('../../server/utils/bilibili')
let mod: BilibiliModule

async function freshImport() {
  vi.resetModules()
  setupGlobals()
  mod = await import('../../server/utils/bilibili')
}

const COOKIE = 'SESSDATA=abc123; bili_jct=csrf456; DedeUserID=789; sid=xyz'

// ============================================================
// getCookieValue
// ============================================================
describe('getCookieValue', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await freshImport()
  })

  it('提取指定 Cookie 字段值', () => {
    expect(mod.getCookieValue(COOKIE, 'SESSDATA')).toBe('abc123')
    expect(mod.getCookieValue(COOKIE, 'bili_jct')).toBe('csrf456')
  })

  it('字段不存在时返回 null', () => {
    expect(mod.getCookieValue(COOKIE, 'nope')).toBeNull()
  })

  it('单 cookie 字符串也能解析', () => {
    expect(mod.getCookieValue('bili_jct=only', 'bili_jct')).toBe('only')
  })
})

// ============================================================
// generateCorrespondPath
// ============================================================
describe('generateCorrespondPath', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await freshImport()
  })

  it('输出为 256 字符小写 hex（1024-bit RSA-OAEP 加密 128 字节）', () => {
    const path = mod.generateCorrespondPath(1684466082562)
    expect(path).toMatch(/^[0-9a-f]{256}$/)
  })

  it('同一时间戳两次生成结果不同（OAEP 随机填充）', () => {
    const ts = 1684466082562
    expect(mod.generateCorrespondPath(ts)).not.toBe(mod.generateCorrespondPath(ts))
  })

  it('不同时间戳生成结果不同', () => {
    const a = mod.generateCorrespondPath(1684466082562)
    const b = mod.generateCorrespondPath(1684466082563)
    expect(a).not.toBe(b)
  })
})

// ============================================================
// checkCookieRefresh
// ============================================================
describe('checkCookieRefresh', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await freshImport()
  })

  it('解析 refresh 与 timestamp', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, message: '0', data: { refresh: true, timestamp: 1684466082562 } }),
      headers: { getSetCookie: () => [] },
    })
    const r = await mod.checkCookieRefresh(COOKIE)
    expect(r.refresh).toBe(true)
    expect(r.timestamp).toBe(1684466082562)
  })

  it('携带 csrf 参数与 Cookie 头', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, message: '0', data: { refresh: false, timestamp: 0 } }),
      headers: { getSetCookie: () => [] },
    })
    await mod.checkCookieRefresh(COOKIE)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('csrf=csrf456')
    expect(init.headers.Cookie).toBe(COOKIE)
  })

  it('非 0 code 时抛出错误', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: -101, message: '账号未登录', data: null }),
      headers: { getSetCookie: () => [] },
    })
    await expect(mod.checkCookieRefresh(COOKIE)).rejects.toThrow(/账号未登录/)
  })
})

// ============================================================
// getRefreshCsrf
// ============================================================
describe('getRefreshCsrf', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await freshImport()
  })

  it('从 HTML 中提取 refresh_csrf', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body><div id="1-name">b0cc8411ded2f9db2cff2edb3123acac</div></body></html>',
    })
    const csrf = await mod.getRefreshCsrf('a'.repeat(256), COOKIE)
    expect(csrf).toBe('b0cc8411ded2f9db2cff2edb3123acac')
  })

  it('HTML 中找不到刷新口令时抛出错误', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html>404</html>',
    })
    await expect(mod.getRefreshCsrf('a'.repeat(256), COOKIE)).rejects.toThrow(/未找到刷新口令/)
  })
})

// ============================================================
// refreshBilibiliCookie — 四步续期流程
// ============================================================
describe('refreshBilibiliCookie', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await freshImport()
  })

  const NEW_COOKIE_SET = [
    'SESSDATA=new-sess; Path=/; Domain=bilibili.com; HttpOnly; Secure',
    'bili_jct=new-csrf; Path=/; Domain=bilibili.com',
    'DedeUserID=789; Path=/',
    'sid=new-sid; Path=/',
  ]

  it('无需刷新时直接返回原值且不继续后续请求', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, message: '0', data: { refresh: false, timestamp: 1684466082562 } }),
      headers: { getSetCookie: () => [] },
    })
    const r = await mod.refreshBilibiliCookie(COOKIE, 'old-rt')
    expect(r.refreshed).toBe(false)
    expect(r.cookie).toBe(COOKIE)
    expect(r.refreshToken).toBe('old-rt')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('完整流程：刷新成功返回新 Cookie 与新 refresh_token', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, message: '0', data: { refresh: true, timestamp: 1684466082562 } }),
        headers: { getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<div id="1-name">refresh-csrf-xxx</div>',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, message: '0', data: { status: 0, refresh_token: 'new-rt' } }),
        headers: { getSetCookie: () => NEW_COOKIE_SET },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, message: '0' }),
        headers: { getSetCookie: () => [] },
      })

    const r = await mod.refreshBilibiliCookie(COOKIE, 'old-rt')
    expect(r.refreshed).toBe(true)
    expect(r.cookie).toBe('SESSDATA=new-sess; bili_jct=new-csrf; DedeUserID=789; sid=new-sid')
    expect(r.refreshToken).toBe('new-rt')

    // cookie/refresh 请求参数
    const [refreshUrl, refreshInit] = mockFetch.mock.calls[2]
    expect(refreshUrl).toContain('/web/cookie/refresh')
    expect(refreshInit.body.get('csrf')).toBe('csrf456')
    expect(refreshInit.body.get('refresh_csrf')).toBe('refresh-csrf-xxx')
    expect(refreshInit.body.get('source')).toBe('main_web')
    expect(refreshInit.body.get('refresh_token')).toBe('old-rt')

    // confirm/refresh 使用新 cookie 的 csrf 与旧 refresh_token
    const [confirmUrl, confirmInit] = mockFetch.mock.calls[3]
    expect(confirmUrl).toContain('/web/confirm/refresh')
    expect(confirmInit.body.get('csrf')).toBe('new-csrf')
    expect(confirmInit.body.get('refresh_token')).toBe('old-rt')
  })

  it('cookie/refresh 返回非 0 code 时抛出错误', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, message: '0', data: { refresh: true, timestamp: 1684466082562 } }),
        headers: { getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<div id="1-name">refresh-csrf-xxx</div>',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 86095, message: 'refresh_csrf 错误或 refresh_token 与 cookie 不匹配', data: null }),
        headers: { getSetCookie: () => [] },
      })

    await expect(mod.refreshBilibiliCookie(COOKIE, 'old-rt')).rejects.toThrow(/86095/)
  })

  it('confirm/refresh 失败时不影响刷新结果', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, message: '0', data: { refresh: true, timestamp: 1684466082562 } }),
        headers: { getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<div id="1-name">refresh-csrf-xxx</div>',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, message: '0', data: { refresh_token: 'new-rt' } }),
        headers: { getSetCookie: () => NEW_COOKIE_SET },
      })
      .mockRejectedValueOnce(new Error('confirm 网络错误'))

    const r = await mod.refreshBilibiliCookie(COOKIE, 'old-rt')
    expect(r.refreshed).toBe(true)
    expect(r.cookie).toContain('SESSDATA=new-sess')
    expect(r.refreshToken).toBe('new-rt')
  })
})
