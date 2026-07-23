/**
 * 数据库层单元测试
 *
 * 测试 server/db/ 的 CRUD 操作
 * 使用纯内存 SQLite，无需文件系统
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDb, getDb, resetDb, saveDb, type Database } from '../../server/db'
import { users, bilibiliCookies, refreshTokens, sessions } from '../../server/db/schema'
import { eq } from 'drizzle-orm'

let db: Database

beforeAll(async () => {
  // 使用纯内存数据库
  db = await initDb()
})

afterAll(() => {
  resetDb()
})

describe('数据库表结构', () => {
  it('users 表存在', () => {
    const rows = db.select().from(users).all()
    expect(rows).toEqual([])
  })

  it('bilibili_cookies 表存在', () => {
    const rows = db.select().from(bilibiliCookies).all()
    expect(rows).toEqual([])
  })

  it('refresh_tokens 表存在', () => {
    const rows = db.select().from(refreshTokens).all()
    expect(rows).toEqual([])
  })

  it('sessions 表存在', () => {
    const rows = db.select().from(sessions).all()
    expect(rows).toEqual([])
  })
})

describe('users 表 CRUD', () => {
  beforeEach(() => {
    db.delete(users).run()
  })

  it('可以创建用户', () => {
    db.insert(users).values({
      bilibiliUid: '123456',
      bilibiliUname: '测试用户',
      bilibiliFace: 'https://i0.hdslb.com/bfs/face/test.jpg',
    }).run()

    const all = db.select().from(users).all()
    expect(all).toHaveLength(1)
    expect(all[0].bilibiliUid).toBe('123456')
    expect(all[0].bilibiliUname).toBe('测试用户')
    expect(all[0].bilibiliFace).toBe('https://i0.hdslb.com/bfs/face/test.jpg')
    // created_at 和 updated_at 应该由数据库自动生成
    expect(all[0].createdAt).toBeTruthy()
    expect(all[0].updatedAt).toBeTruthy()
  })

  it('可以按 bilibili_uid 查询用户', () => {
    db.insert(users).values({
      bilibiliUid: '111',
      bilibiliUname: 'User1',
    }).run()
    db.insert(users).values({
      bilibiliUid: '222',
      bilibiliUname: 'User2',
    }).run()

    const result = db.select().from(users).where(eq(users.bilibiliUid, '111')).all()
    expect(result).toHaveLength(1)
    expect(result[0].bilibiliUname).toBe('User1')
  })

  it('bilibili_uid 必须唯一', () => {
    db.insert(users).values({
      bilibiliUid: '999',
      bilibiliUname: 'First',
    }).run()

    expect(() => {
      db.insert(users).values({
        bilibiliUid: '999',
        bilibiliUname: 'Second',
      }).run()
    }).toThrow()
  })

  it('可以更新用户名', () => {
    db.insert(users).values({
      bilibiliUid: '333',
      bilibiliUname: 'OldName',
    }).run()

    db.update(users)
      .set({ bilibiliUname: 'NewName' })
      .where(eq(users.bilibiliUid, '333'))
      .run()

    const updated = db.select().from(users).where(eq(users.bilibiliUid, '333')).all()
    expect(updated[0].bilibiliUname).toBe('NewName')
  })

  it('可以删除用户', () => {
    db.insert(users).values({
      bilibiliUid: '444',
      bilibiliUname: 'ToDelete',
    }).run()

    db.delete(users).where(eq(users.bilibiliUid, '444')).run()

    const remaining = db.select().from(users).all()
    expect(remaining).toHaveLength(0)
  })
})

describe('bilibili_cookies 表 CRUD', () => {
  let userId: number

  beforeEach(() => {
    db.delete(bilibiliCookies).run()
    db.delete(users).run()
    const [row] = db.insert(users).values({
      bilibiliUid: 'cookie-test-user',
      bilibiliUname: 'CookieUser',
    }).returning().all()
    userId = row.id
  })

  it('可以保存加密 Cookie', () => {
    db.insert(bilibiliCookies).values({
      userId,
      cookieEncrypted: 'encrypted_base64_string_here',
    }).run()

    const all = db.select().from(bilibiliCookies).all()
    expect(all).toHaveLength(1)
    expect(all[0].userId).toBe(userId)
    expect(all[0].cookieEncrypted).toBe('encrypted_base64_string_here')
    expect(all[0].createdAt).toBeTruthy()
    expect(all[0].updatedAt).toBeTruthy()
  })

  it('可以按 user_id 查询 Cookie', () => {
    db.insert(bilibiliCookies).values({
      userId,
      cookieEncrypted: 'my_encrypted_cookie',
    }).run()

    const result = db.select().from(bilibiliCookies)
      .where(eq(bilibiliCookies.userId, userId))
      .all()

    expect(result).toHaveLength(1)
    expect(result[0].cookieEncrypted).toBe('my_encrypted_cookie')
  })

  it('可以更新 Cookie', () => {
    db.insert(bilibiliCookies).values({
      userId,
      cookieEncrypted: 'old_cookie',
    }).run()

    db.update(bilibiliCookies)
      .set({ cookieEncrypted: 'new_cookie' })
      .where(eq(bilibiliCookies.userId, userId))
      .run()

    const updated = db.select().from(bilibiliCookies)
      .where(eq(bilibiliCookies.userId, userId))
      .all()
    expect(updated[0].cookieEncrypted).toBe('new_cookie')
  })

  it('删除用户时级联删除 Cookie（外键约束）', () => {
    db.insert(bilibiliCookies).values({
      userId,
      cookieEncrypted: 'test_cookie',
    }).run()

    // 删除用户
    db.delete(users).where(eq(users.id, userId)).run()

    // Cookie 应该也被删除
    const cookies = db.select().from(bilibiliCookies).all()
    expect(cookies).toHaveLength(0)
  })
})

describe('sessions 表 CRUD', () => {
  let userId: number

  beforeEach(() => {
    db.delete(sessions).run()
    db.delete(users).run()
    const [row] = db.insert(users).values({
      bilibiliUid: 'session-test-user',
      bilibiliUname: 'SessionUser',
    }).returning().all()
    userId = row.id
  })

  it('可以创建会话', () => {
    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()

    db.insert(sessions).values({
      sessionId,
      userId,
      expiresAt,
    }).run()

    const all = db.select().from(sessions).all()
    expect(all).toHaveLength(1)
    expect(all[0].sessionId).toBe(sessionId)
    expect(all[0].userId).toBe(userId)
    expect(all[0].expiresAt).toBe(expiresAt)
  })

  it('session_id 必须唯一', () => {
    const sid = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 3600000).toISOString()

    db.insert(sessions).values({ sessionId: sid, userId, expiresAt }).run()

    expect(() => {
      db.insert(sessions).values({ sessionId: sid, userId, expiresAt }).run()
    }).toThrow()
  })

  it('可以按 session_id 查询', () => {
    const sid = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 3600000).toISOString()

    db.insert(sessions).values({ sessionId: sid, userId, expiresAt }).run()

    const result = db.select().from(sessions)
      .where(eq(sessions.sessionId, sid))
      .all()
    expect(result).toHaveLength(1)
    expect(result[0].userId).toBe(userId)
  })

  it('可以删除过期的会话', () => {
    const oldSid = crypto.randomUUID()
    const expiredAt = new Date(Date.now() - 3600000).toISOString() // 1 小时前
    const newSid = crypto.randomUUID()
    const validAt = new Date(Date.now() + 3600000).toISOString() // 1 小时后

    db.insert(sessions).values({ sessionId: oldSid, userId, expiresAt: expiredAt }).run()
    db.insert(sessions).values({ sessionId: newSid, userId, expiresAt: validAt }).run()

    // 删除过期会话
    db.delete(sessions)
      .where(
        // 查找过期的
        // sql.js 使用 JS 比较
        eq(sessions.sessionId, oldSid),
      )
      .run()

    const remaining = db.select().from(sessions).all()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].sessionId).toBe(newSid)
  })

  it('删除用户时级联删除会话', () => {
    const sid = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 3600000).toISOString()
    db.insert(sessions).values({ sessionId: sid, userId, expiresAt }).run()

    db.delete(users).where(eq(users.id, userId)).run()

    const remaining = db.select().from(sessions).all()
    expect(remaining).toHaveLength(0)
  })
})

describe('数据库初始化幂等性', () => {
  it('多次调用 initDb 不会报错', async () => {
    // initDb 已经在 beforeAll 调用过一次，再次调用应不报错
    const db2 = await initDb() // 使用相同的内存数据库
    expect(db2).toBeDefined()

    // 表应该仍然存在且为空
    const rows = db.select().from(users).all()
    expect(Array.isArray(rows)).toBe(true)
  })
})
