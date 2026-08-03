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

/** spi 接口 mock — buvid3/buvid4 设备指纹（bilibiliRequest 每次都会附加） */
const spiMock = {
  code: 0, message: '0',
  data: { b_3: 'B3-TEST-001', b_4: 'B4-TEST-001' },
}

function setupGlobals() {
  ;(globalThis as any).$fetch = mock$Fetch
  ;(globalThis as any).createError = (opts: { statusCode: number; message: string; statusMessage?: string }) => {
    const err = new Error(opts.message) as Error & { statusCode: number; message: string }
    err.statusCode = opts.statusCode
    err.message = opts.message
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

  it('成功返回二维码 URL、qrcode_key 和 cookies', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 0, message: '0',
        data: { url: 'https://passport.bilibili.com/...?qrcode_key=abc', qrcode_key: 'abc123def456' },
      }),
      headers: { getSetCookie: () => ['buvid3=xxx; Path=/; Domain=.bilibili.com', 'b_nut=123; Path=/'] },
    })

    const r = await mod.generateQrCode()
    expect(r.url).toContain('qrcode_key=abc')
    expect(r.qrcode_key).toBe('abc123def456')
    expect(r.cookies).toBe('buvid3=xxx; b_nut=123')
  })

  it('生成二维码时无 Set-Cookie 返回空字符串', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 0, message: '0',
        data: { url: 'https://passport.bilibili.com/...?qrcode_key=abc', qrcode_key: 'abc123def456' },
      }),
      headers: { getSetCookie: () => [] },
    })

    const r = await mod.generateQrCode()
    expect(r.cookies).toBe('')
  })

  it('B站返回非0 code 时抛出错误', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: -412, message: '请求过于频繁', data: null }),
      headers: { getSetCookie: () => [] },
    })
    await expect(mod.generateQrCode()).rejects.toThrow(/请求过于频繁/)
  })

  it('HTTP 非 200 时抛出错误', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 502,
      json: async () => ({}),
      headers: { getSetCookie: () => [] },
    })
    await expect(mod.generateQrCode()).rejects.toThrow(/HTTP 502/)
  })

  it('请求超时时抛出错误', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'))
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

  it('传入 cookies 时在请求头中带上 Cookie', async () => {
    mockFetch.mockResolvedValueOnce(makeResp(86101, '未扫码'))
    await mod.pollQrCode('k', 'buvid3=xxx; b_nut=123')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toBeDefined()
    expect((init.headers as Record<string, string>)['Cookie']).toBe('buvid3=xxx; b_nut=123')
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
    mock$Fetch.mockResolvedValueOnce({ code: -1, message: '', data: {} }) // fetchBiliTicket（测试环境不真实请求）
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
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
    mock$Fetch.mockResolvedValueOnce({ code: -1, message: '', data: {} }) // fetchBiliTicket
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce(wbiMock)
    mock$Fetch.mockResolvedValueOnce({ code: -101, message: '账号未登录', data: {} })

    // getNavUserInfo 捕获 code=-101 并返回未登录状态
    const r = await mod.getNavUserInfo('invalid')
    expect(r.isLogin).toBe(false)
    expect(r.mid).toBe(0)
  })

  it('网络错误时抛出异常', async () => {
    mock$Fetch.mockResolvedValueOnce({ code: -1, message: '', data: {} }) // fetchBiliTicket
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce(wbiMock)
    mock$Fetch.mockRejectedValueOnce(new Error('Network error'))

    await expect(mod.getNavUserInfo('test')).rejects.toThrow('Network error')
  })
})

// ============================================================
// bilibiliRequest — bili_ticket 集成
// ============================================================
describe('bilibiliRequest — bili_ticket 集成', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await freshImport()
  })

  const wbiMock = {
    code: 0, message: '0',
    data: {
      wbi_img: {
        img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
        sub_url: 'https://i0.hdslb.com/bfs/wbi/a5d6e7f83b4c2d1a9e8f7c6b5a4d3e2f.png',
      },
    },
  }

  // ticketMock 包含 nav 数据，会同步缓存 WBI keys → 减少一次 $fetch 调用
  const ticketMock = {
    code: 0, message: 'OK',
    data: {
      ticket: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test_ticket.signature',
      nav: { img: 'https://i0.hdslb.com/bfs/wbi/abc123.png', sub: 'https://i0.hdslb.com/bfs/wbi/def456.png' },
    },
  }

  it('成功获取 bili_ticket 并附加到请求 Cookie', async () => {
    // ticketMock 含 nav → WBI keys 同步缓存 → 仅 3 次 $fetch（ticket + buvid + API）
    mock$Fetch.mockResolvedValueOnce(ticketMock) // fetchBiliTicket
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce({ code: 0, message: '0', data: { test: 'ok' } }) // API

    await mod.bilibiliRequest('/test')

    // 第 3 次调用是实际 API 请求（索引 2）
    const calls = mock$Fetch.mock.calls as [string, RequestInit][]
    expect(calls.length).toBe(3)
    const apiCall = calls[2]
    const cookieHeader = (apiCall[1].headers as Record<string, string>)['Cookie']
    expect(cookieHeader).toContain('bili_ticket=')
  })

  it('skipTicket=true 时不附加 bili_ticket', async () => {
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids（skipTicket 不影响 buvid）
    mock$Fetch.mockResolvedValueOnce(wbiMock) // fetchWbiKeys
    mock$Fetch.mockResolvedValueOnce({ code: 0, message: '0', data: {} }) // API

    await mod.bilibiliRequest('/test', { skipTicket: true })

    // 只有 3 次 $fetch 调用（跳过 ticket）
    expect(mock$Fetch).toHaveBeenCalledTimes(3)

    const apiCall = (mock$Fetch.mock.calls as [string, RequestInit][])[2]
    const cookie = (apiCall[1].headers as Record<string, string>)['Cookie'] || ''
    expect(cookie).not.toContain('bili_ticket')
  })

  it('GenWebTicket 失败时静默降级，不影响业务请求', async () => {
    // GenWebTicket 失败 → ticket='' → WBI 未缓存 → 需单独请求 WBI
    mock$Fetch.mockResolvedValueOnce({ code: -1, message: 'error', data: {} }) // fetchBiliTicket
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce(wbiMock) // fetchWbiKeys
    mock$Fetch.mockResolvedValueOnce({ code: 0, message: '0', data: { ok: true } }) // API

    const r = await mod.bilibiliRequest('/test')

    expect(r.code).toBe(0)
    expect(r.data).toEqual({ ok: true })
    expect(mock$Fetch).toHaveBeenCalledTimes(4) // ticket + buvid + WBI + API
  })

  it('GenWebTicket 网络异常时静默降级', async () => {
    mock$Fetch.mockRejectedValueOnce(new Error('timeout')) // GenWebTicket 失败
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce(wbiMock) // fetchWbiKeys
    mock$Fetch.mockResolvedValueOnce({ code: 0, message: '0', data: { ok: true } }) // API

    const r = await mod.bilibiliRequest('/test')

    expect(r.code).toBe(0)
    expect(r.data).toEqual({ ok: true })
  })

  it('ticket 缓存命中时不重复请求 GenWebTicket', async () => {
    // 第一次：ticketMock 含 nav → WBI 也被缓存
    mock$Fetch.mockResolvedValueOnce(ticketMock) // fetchBiliTicket
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce({ code: 0, message: '0', data: { first: true } }) // API

    await mod.bilibiliRequest('/test')
    expect(mock$Fetch).toHaveBeenCalledTimes(3)

    // 第二次：ticket、buvid、WBI 都命中缓存 → 仅 1 次 $fetch（API）
    mock$Fetch.mockClear()
    mock$Fetch.mockResolvedValueOnce({ code: 0, message: '0', data: { second: true } }) // API

    await mod.bilibiliRequest('/test')
    expect(mock$Fetch).toHaveBeenCalledTimes(1) // 只有 API 调用
  })

  it('已有的 Cookie 与 bili_ticket 正确合并', async () => {
    mock$Fetch.mockResolvedValueOnce(ticketMock) // fetchBiliTicket（含 nav → WBI 缓存）
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce({ code: 0, message: '0', data: {} }) // API

    await mod.bilibiliRequest('/test', { cookie: 'SESSDATA=abc; bili_jct=xyz' })

    const apiCall = (mock$Fetch.mock.calls as [string, RequestInit][])[2]
    const cookie = (apiCall[1].headers as Record<string, string>)['Cookie']
    expect(cookie).toContain('SESSDATA=abc')
    expect(cookie).toContain('bili_ticket=')
  })

  it('buvid3/buvid4/b_nut 附加到请求 Cookie（设备指纹）', async () => {
    mock$Fetch.mockResolvedValueOnce(ticketMock) // fetchBiliTicket
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce({ code: 0, message: '0', data: {} }) // API

    await mod.bilibiliRequest('/test')

    const apiCall = (mock$Fetch.mock.calls as [string, RequestInit][])[2]
    const cookie = (apiCall[1].headers as Record<string, string>)['Cookie']
    expect(cookie).toContain('buvid3=B3-TEST-001')
    expect(cookie).toContain('buvid4=B4-TEST-001')
    expect(cookie).toMatch(/b_nut=\d+/)
  })

  it('spi 失败时静默降级，不影响业务请求', async () => {
    mock$Fetch.mockResolvedValueOnce(ticketMock) // fetchBiliTicket
    mock$Fetch.mockResolvedValueOnce({ code: -1, message: '', data: {} }) // fetchBuvids 失败
    mock$Fetch.mockResolvedValueOnce({ code: 0, message: '0', data: { ok: true } }) // API

    const r = await mod.bilibiliRequest('/test')

    expect(r.code).toBe(0)
    expect(r.data).toEqual({ ok: true })
  })
})

// ============================================================
// bilibiliRequest — -352 风控日志
// ============================================================
describe('bilibiliRequest — -352 风控日志', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await freshImport()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  const wbiMock = {
    code: 0, message: '0',
    data: {
      wbi_img: {
        img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
        sub_url: 'https://i0.hdslb.com/bfs/wbi/a5d6e7f83b4c2d1a9e8f7c6b5a4d3e2f.png',
      },
    },
  }

  // 辅助函数：检查 console.warn 调用中是否包含某字符串
  function warnContains(substring: string): boolean {
    const calls = (console.warn as ReturnType<typeof vi.fn>).mock.calls.flat()
    return calls.some((c: unknown) => String(c).includes(substring))
  }

  it('-352 带 v_voucher 时输出包含 v_voucher 的日志', async () => {
    mock$Fetch.mockResolvedValueOnce({ code: -1, message: '', data: {} }) // fetchBiliTicket
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce(wbiMock) // fetchWbiKeys
    mock$Fetch.mockResolvedValueOnce({
      code: -352, message: '风控校验失败',
      data: { v_voucher: 'voucher_abc-123-def' },
    })

    // bilibiliRequest 遇到非 0 code 会 throw
    await expect(
      mod.bilibiliRequest('/x/web-interface/popular'),
    ).rejects.toThrow(/B站API错误 \[-352\]/)

    expect(warnContains('v_voucher=voucher_abc-123-def')).toBe(true)
  })

  it('-352 无 v_voucher 时输出检查提示日志', async () => {
    mock$Fetch.mockResolvedValueOnce({ code: -1, message: '', data: {} }) // fetchBiliTicket
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce(wbiMock) // fetchWbiKeys
    mock$Fetch.mockResolvedValueOnce({ code: -352, message: '风控校验失败', data: {} })

    await expect(
      mod.bilibiliRequest('/x/web-interface/popular'),
    ).rejects.toThrow(/B站API错误 \[-352\]/)

    expect(warnContains('无 v_voucher')).toBe(true)
    expect(warnContains('UA / WBI 签名 / bili_ticket')).toBe(true)
  })

  it('非 -352 错误不输出风控日志', async () => {
    mock$Fetch.mockResolvedValueOnce({ code: -1, message: '', data: {} }) // fetchBiliTicket
    mock$Fetch.mockResolvedValueOnce(spiMock) // fetchBuvids
    mock$Fetch.mockResolvedValueOnce(wbiMock) // fetchWbiKeys
    mock$Fetch.mockResolvedValueOnce({ code: -400, message: '请求错误', data: {} })

    await expect(
      mod.bilibiliRequest('/test'),
    ).rejects.toThrow(/B站API错误 \[-400\]/)

    // 风控相关日志不应出现
    expect(warnContains('风控')).toBe(false)
    expect(warnContains('v_voucher')).toBe(false)
  })
})
