/**
 * B站登录 API 函数 单元测试
 *
 * 测试 generateQrCode / pollQrCode / getNavUserInfo
 * Mock B站 API 响应，验证各状态分支
 *
 * 注意：Nuxt 自动导入的 $fetch / createError 在纯 Node 测试环境中不存在，
 * 需要通过 globalThis 注入 mock 后再动态导入被测模块。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// 全局 mock
// ============================================================
const mock$Fetch = vi.fn()
const mockFetch = vi.fn()

function setupGlobals() {
  ;(globalThis as any).$fetch = mock$Fetch
  ;(globalThis as any).createError = (opts: { statusCode: number; statusMessage: string }) => {
    const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
    err.statusCode = opts.statusCode
    err.statusMessage = opts.statusMessage
    return err
  }
  vi.stubGlobal('fetch', mockFetch)
}

setupGlobals()

// ============================================================
// 每次测试前重新导入模块（清除 wbiKeysCache 等模块级状态）
// ============================================================
type BilibiliModule = typeof import('../../server/utils/bilibili')
let mod: BilibiliModule

async function freshImport() {
  vi.resetModules()
  setupGlobals()
  mod = await import('../../server/utils/bilibili')
}

// ============================================================
// generateQrCode
// ============================================================
describe('generateQrCode', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await freshImport()
  })

  it('成功返回二维码 URL 和 qrcode_key', async () => {
    mock$Fetch.mockResolvedValueOnce({
      code: 0, message: '0',
      data: { url: 'https://passport.bilibili.com/...?qrcode_key=abc', qrcode_key: 'abc123def456' },
    })

    const r = await mod.generateQrCode()
    expect(r.url).toContain('qrcode_key=abc')
    expect(r.qrcode_key).toBe('abc123def456')
  })

  it('B站返回非0 code 时抛出错误', async () => {
    mock$Fetch.mockResolvedValueOnce({ code: -412, message: '请求过于频繁', data: null })
    await expect(mod.generateQrCode()).rejects.toThrow(/请求过于频繁/)
  })

  it('请求超时时抛出错误', async () => {
    mock$Fetch.mockRejectedValueOnce(new Error('timeout'))
    await expect(mod.generateQrCode()).rejects.toThrow('timeout')
  })
})

// ============================================================
// pollQrCode
// ============================================================
describe('pollQrCode', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await freshImport()
  })

  const makeResp = (dataCode: number, dataMsg: string, opts?: { refreshToken?: string; cookies?: string[] }) => ({
    ok: true,
    json: async () => ({
      code: 0, message: '0',
      data: { code: dataCode, message: dataMsg, refresh_token: opts?.refreshToken },
    }),
    headers: { getSetCookie: () => opts?.cookies || [] },
  })

  it('未扫码 → pending', async () => {
    mockFetch.mockResolvedValueOnce(makeResp(86101, '未扫码'))
    const r = await mod.pollQrCode('k')
    expect(r.status).toBe('pending')
  })

  it('已扫码未确认 → scanned', async () => {
    mockFetch.mockResolvedValueOnce(makeResp(86090, '二维码已扫码未确认'))
    const r = await mod.pollQrCode('k')
    expect(r.status).toBe('scanned')
  })

  it('二维码失效 → expired', async () => {
    mockFetch.mockResolvedValueOnce(makeResp(86038, '二维码已失效'))
    const r = await mod.pollQrCode('k')
    expect(r.status).toBe('expired')
  })

  it('登录成功 → cookie + refresh_token', async () => {
    mockFetch.mockResolvedValueOnce(makeResp(0, '', {
      refreshToken: 'rt_123',
      cookies: [
        'SESSDATA=sd; Path=/; Domain=.bilibili.com',
        'bili_jct=jct; Path=/',
        'DedeUserID=12345678; Path=/',
        'DedeUserID__ckMd5=abc; Path=/',
      ],
    }))

    const r = await mod.pollQrCode('k')
    expect(r.status).toBe('success')
    expect(r.cookie).toContain('SESSDATA=sd')
    expect(r.cookie).toContain('bili_jct=jct')
    expect(r.refreshToken).toBe('rt_123')
  })

  it('登录成功但 Set-Cookie 为空（兜底）', async () => {
    mockFetch.mockResolvedValueOnce(makeResp(0, '', { refreshToken: 'rt' }))
    const r = await mod.pollQrCode('k')
    expect(r.status).toBe('success')
    expect(r.cookie).toBeUndefined()
    expect(r.refreshToken).toBe('rt')
  })

  it('HTTP 非 200 → 抛错', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}), headers: { getSetCookie: () => [] } })
    await expect(mod.pollQrCode('k')).rejects.toThrow(/HTTP 500/)
  })
})

// ============================================================
// getNavUserInfo
// ============================================================
describe('getNavUserInfo', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await freshImport()
  })

  // fetchWbiKeys 返回的 mock 数据
  const wbiMock = {
    code: 0, message: '0',
    data: {
      wbi_img: {
        img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
        sub_url: 'https://i0.hdslb.com/bfs/wbi/a5d6e7f83b4c2d1a9e8f7c6b5a4d3e2f.png',
      },
    },
  }

  it('成功返回用户信息', async () => {
    mock$Fetch.mockResolvedValueOnce(wbiMock) // fetchWbiKeys
    mock$Fetch.mockResolvedValueOnce({
      code: 0, message: '0',
      data: { isLogin: true, mid: 12345678, uname: 'TestUser', face: 'https://face.jpg' },
    })

    const r = await mod.getNavUserInfo('cookie')
    expect(r.mid).toBe(12345678)
    expect(r.uname).toBe('TestUser')
    expect(r.isLogin).toBe(true)
  })

  it('未登录时返回 isLogin=false（nav 接口 code=-101）', async () => {
    mock$Fetch.mockResolvedValueOnce(wbiMock)
    mock$Fetch.mockResolvedValueOnce({ code: -101, message: '账号未登录', data: {} })

    // getNavUserInfo 捕获 code=-101 并返回未登录状态
    const r = await mod.getNavUserInfo('invalid')
    expect(r.isLogin).toBe(false)
    expect(r.mid).toBe(0)
  })

  it('网络错误时抛出异常', async () => {
    mock$Fetch.mockResolvedValueOnce(wbiMock)
    mock$Fetch.mockRejectedValueOnce(new Error('Network error'))

    await expect(mod.getNavUserInfo('test')).rejects.toThrow('Network error')
  })
})
