/**
 * Auth 服务层 单元测试
 *
 * 测试 session 管理、用户 upsert、Cookie 加密存储、完整登录流程
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'

// ============================================================
// Mock Nuxt auto-imports
// ============================================================
const mockEncryptKey = 'test-encrypt-key-32bytes-xxxxx'

vi.stubGlobal('useRuntimeConfig', () => ({
  encryptKey: mockEncryptKey,
}))

vi.stubGlobal('createError', (opts: { statusCode: number; statusMessage: string }) => {
  const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
  err.statusCode = opts.statusCode
  err.statusMessage = opts.statusMessage
  return err
})

// ============================================================
// Mock getNavUserInfo (避免网络调用)
// ============================================================
const mockGetNavUserInfo = vi.fn()

vi.mock('../../server/utils/bilibili', () => ({
  getNavUserInfo: (...args: any[]) => mockGetNavUserInfo(...args),
}))

// ============================================================
// 延迟导入（mock 就绪后）
// ============================================================
const auth = await import('../../server/utils/auth')
const {
  createSession,
  getSessionUser,
  removeSession,
  upsertUser,
  storeBilibiliCookie,
  getBilibiliCookie,
  handleLoginSuccess,
} = auth

import { getDb, resetDb, initDb } from '../../server/db'

beforeAll(async () => {
  await initDb() // 内存数据库
})

afterAll(() => {
  resetDb()
})

beforeEach(async () => {
  vi.clearAllMocks()
  // 清空所有表
  const db = await getDb()
  const { users, bilibiliCookies, refreshTokens, sessions } = await import('../../server/db/schema')
  db.delete(sessions).run()
  db.delete(bilibiliCookies).run()
  db.delete(refreshTokens).run()
  db.delete(users).run()
})

// ============================================================
// 测试
// ============================================================

describe('upsertUser', () => {
  it('创建新用户', async () => {
    const id = await upsertUser('12345', 'TestUser', 'https://face.jpg')
    expect(id).toBeGreaterThan(0)

    const db = await getDb()
    const { users } = await import('../../server/db/schema')
    const all = db.select().from(users).all()
    expect(all).toHaveLength(1)
    expect(all[0].bilibiliUid).toBe('12345')
    expect(all[0].bilibiliUname).toBe('TestUser')
    expect(all[0].bilibiliFace).toBe('https://face.jpg')
  })

  it('重复 uid 时更新用户名', async () => {
    const id1 = await upsertUser('999', 'OldName')
    const id2 = await upsertUser('999', 'NewName', 'https://new_face.jpg')

    // 应返回相同 ID
    expect(id2).toBe(id1)

    const db = await getDb()
    const { users } = await import('../../server/db/schema')
    const all = db.select().from(users).all()
    expect(all).toHaveLength(1)
    expect(all[0].bilibiliUname).toBe('NewName')
    expect(all[0].bilibiliFace).toBe('https://new_face.jpg')
  })
})

describe('storeBilibiliCookie / getBilibiliCookie', () => {
  it('加密存储并解密读取', async () => {
    const id = await upsertUser('user1', 'CookieUser')
    const originalCookie = 'SESSDATA=abc; bili_jct=xyz; DedeUserID=123'

    await storeBilibiliCookie(id, originalCookie, 'refresh_abc')

    const decrypted = await getBilibiliCookie(id)
    expect(decrypted).toBe(originalCookie)
  })

  it('重复存储时更新 Cookie', async () => {
    const id = await upsertUser('user2', 'UpdateUser')

    await storeBilibiliCookie(id, 'old_cookie')
    await storeBilibiliCookie(id, 'new_cookie')

    const cookie = await getBilibiliCookie(id)
    expect(cookie).toBe('new_cookie')
  })

  it('用户没有 Cookie 时返回 null', async () => {
    const id = await upsertUser('user3', 'NoCookie')
    const cookie = await getBilibiliCookie(id)
    expect(cookie).toBeNull()
  })

  it('加密后的数据存储与原文不同', async () => {
    const id = await upsertUser('user4', 'EncTest')
    const original = 'test_cookie_value'

    await storeBilibiliCookie(id, original)

    // 验证 DB 中存储的是密文
    const db = await getDb()
    const { bilibiliCookies } = await import('../../server/db/schema')
    const [row] = db.select().from(bilibiliCookies).all()
    expect(row!.cookieEncrypted).not.toBe(original)
    expect(row!.cookieEncrypted.length).toBeGreaterThan(original.length)

    // 解密后应与原文一致
    const decrypted = await getBilibiliCookie(id)
    expect(decrypted).toBe(original)
  })
})

describe('createSession / getSessionUser / removeSession', () => {
  it('创建会话并获取用户信息', async () => {
    const id = await upsertUser('session_uid', 'SessionUser')
    await storeBilibiliCookie(id, 'SESSDATA=test_cookie')

    const sid = await createSession(id)

    const result = await getSessionUser(sid)
    expect(result).not.toBeNull()
    expect(result!.user.bilibiliUid).toBe('session_uid')
    expect(result!.user.bilibiliUname).toBe('SessionUser')
    expect(result!.bilibiliCookie).toBe('SESSDATA=test_cookie')
  })

  it('无效 session_id 返回 null', async () => {
    const result = await getSessionUser('non-existent-session')
    expect(result).toBeNull()
  })

  it('清除会话后查询返回 null', async () => {
    const id = await upsertUser('logout_uid', 'LogoutUser')
    const sid = await createSession(id)

    await removeSession(sid)

    const result = await getSessionUser(sid)
    expect(result).toBeNull()
  })

  it('用户无 Cookie 时返回 bilibiliCookie=null', async () => {
    const id = await upsertUser('no_cookie_uid', 'NoCookieUser')
    // 不存储 Cookie
    const sid = await createSession(id)

    const result = await getSessionUser(sid)
    expect(result).not.toBeNull()
    expect(result!.user.bilibiliUid).toBe('no_cookie_uid')
    expect(result!.bilibiliCookie).toBeNull()
  })
})

describe('handleLoginSuccess', () => {
  it('完整登录流程：获取用户信息 → upsert → 存储Cookie → 创建session', async () => {
    // Mock getNavUserInfo 返回值
    mockGetNavUserInfo.mockResolvedValueOnce({
      isLogin: true,
      mid: 12345678,
      uname: 'B站用户',
      face: 'https://i0.hdslb.com/bfs/face/user.jpg',
    })

    const sid = await handleLoginSuccess('SESSDATA=login_cookie; bili_jct=login_jct', 'refresh_rt')

    expect(sid).toBeTruthy()
    expect(mockGetNavUserInfo).toHaveBeenCalledWith('SESSDATA=login_cookie; bili_jct=login_jct')

    // 验证 session 可查询
    const result = await getSessionUser(sid)
    expect(result).not.toBeNull()
    expect(result!.user.bilibiliUid).toBe('12345678')
    expect(result!.user.bilibiliUname).toBe('B站用户')
    expect(result!.bilibiliCookie).toBe('SESSDATA=login_cookie; bili_jct=login_jct')
  })

  it('B站用户信息获取失败时抛出 401', async () => {
    mockGetNavUserInfo.mockResolvedValueOnce({
      isLogin: false,
      mid: 0,
      uname: '',
      face: '',
    })

    await expect(handleLoginSuccess('invalid_cookie')).rejects.toThrow(/Cookie 可能无效/)
  })

  it('重复登录同一用户时更新 Cookie', async () => {
    // 第一次登录
    mockGetNavUserInfo.mockResolvedValueOnce({
      isLogin: true,
      mid: 11111,
      uname: 'FirstLogin',
      face: '',
    })

    const sid1 = await handleLoginSuccess('cookie_v1')

    // 第二次登录同一用户
    mockGetNavUserInfo.mockResolvedValueOnce({
      isLogin: true,
      mid: 11111,
      uname: 'UpdatedName', // 用户名可能变化
      face: 'https://new_face.jpg',
    })

    const sid2 = await handleLoginSuccess('cookie_v2')

    // 新 session 应能查到最新数据
    const result = await getSessionUser(sid2)
    expect(result!.user.bilibiliUname).toBe('UpdatedName')
    expect(result!.bilibiliCookie).toBe('cookie_v2')
  })
})
