/**
 * Auth 服务层
 *
 * 管理登录会话和 B站 Cookie 的加密存储/读取。
 * 基于 SQLite（server/db/）和 AES-256-GCM（server/utils/crypto.ts）。
 */
import { getDb, getRawSqlDb, saveDb } from '../db'
import { users, bilibiliCookies, refreshTokens, sessions } from '../db/schema'
import { eq, and, lt } from 'drizzle-orm'
import { encrypt, decrypt } from './crypto'
import { getNavUserInfo, type QrPollResult } from './bilibili'

// ============================================================
// 类型
// ============================================================

export interface AuthUser {
  id: number
  bilibiliUid: string
  bilibiliUname: string
  bilibiliFace: string | null
}

export interface SessionResult {
  user: AuthUser
  bilibiliCookie: string | null
}

// ============================================================
// 会话管理
// ============================================================

/**
 * 创建登录会话
 *
 * @param userId - 用户 ID
 * @param maxAgeMs - 会话有效期（毫秒），默认 30 天
 * @returns session_id (UUID)
 */
export async function createSession(
  userId: number,
  maxAgeMs: number = 30 * 24 * 3600 * 1000,
): Promise<string> {
  const db = await getDb()
  const sessionId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + maxAgeMs).toISOString()

  // 清理该用户已有的旧会话
  await db.delete(sessions).where(eq(sessions.userId, userId)).run()

  // 创建新会话
  await db.insert(sessions).values({ sessionId, userId, expiresAt }).run()
  saveDb()

  return sessionId
}

/**
 * 通过 session_id 获取用户信息和解密后的 Cookie
 *
 * @param sessionId - 会话 UUID
 * @returns 用户信息和 Cookie，或 null（会话无效/过期）
 */
export async function getSessionUser(sessionId: string): Promise<SessionResult | null> {
  const db = await getDb()

  // 1. 查会话
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.sessionId, sessionId))
    .all()

  if (!session) return null

  // 2. 检查过期
  if (new Date(session.expiresAt) < new Date()) {
    await db.delete(sessions).where(eq(sessions.sessionId, sessionId)).run()
    saveDb()
    return null
  }

  // 3. 查用户
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .all()

  if (!user) return null

  // 4. 查 Cookie（可能不存在，如仅 OAuth 登录但未扫码）
  const cookie = await getBilibiliCookie(user.id)

  return {
    user: {
      id: user.id,
      bilibiliUid: user.bilibiliUid,
      bilibiliUname: user.bilibiliUname,
      bilibiliFace: user.bilibiliFace,
    },
    bilibiliCookie: cookie,
  }
}

/**
 * 清除会话（登出）
 */
export async function removeSession(sessionId: string): Promise<void> {
  const db = await getDb()
  await db.delete(sessions).where(eq(sessions.sessionId, sessionId)).run()
  saveDb()
}

// ============================================================
// 用户管理
// ============================================================

/**
 * 创建或更新用户信息
 *
 * @returns 用户 ID
 */
export async function upsertUser(
  bilibiliUid: string,
  bilibiliUname: string,
  bilibiliFace?: string,
): Promise<number> {
  const db = await getDb()

  // 查找已有用户
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.bilibiliUid, bilibiliUid))
    .all()

  if (existing) {
    // 更新用户信息
    await db
      .update(users)
      .set({
        bilibiliUname,
        bilibiliFace: bilibiliFace || existing.bilibiliFace,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, existing.id))
      .run()
    saveDb()
    return existing.id
  }

  // 创建新用户
  const [row] = await db
    .insert(users)
    .values({ bilibiliUid, bilibiliUname, bilibiliFace: bilibiliFace || null })
    .returning()
    .all()
  saveDb()
  return row.id
}

// ============================================================
// Cookie 存储
// ============================================================

/**
 * 加密并存储 B站 Cookie
 *
 * @param userId - 用户 ID
 * @param cookie - 原始 B站 Cookie 字符串
 * @param refreshToken - B站 refresh_token（可选）
 */
export async function storeBilibiliCookie(
  userId: number,
  cookie: string,
  refreshToken?: string,
): Promise<void> {
  const db = await getDb()
  const config = useRuntimeConfig()
  const encrypted = encrypt(cookie, config.encryptKey)

  // Upsert Cookie
  const [existing] = await db
    .select()
    .from(bilibiliCookies)
    .where(eq(bilibiliCookies.userId, userId))
    .all()

  if (existing) {
    await db
      .update(bilibiliCookies)
      .set({
        cookieEncrypted: encrypted,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(bilibiliCookies.userId, userId))
      .run()
  } else {
    await db
      .insert(bilibiliCookies)
      .values({ userId, cookieEncrypted: encrypted })
      .run()
  }

  // 存储 refresh_token（如果有）
  if (refreshToken) {
    const encryptedRt = encrypt(refreshToken, config.encryptKey)
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() // 30 天

    const [existingRt] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, userId))
      .all()

    if (existingRt) {
      await db
        .update(refreshTokens)
        .set({ refreshTokenEncrypted: encryptedRt, expiresAt })
        .where(eq(refreshTokens.userId, userId))
        .run()
    } else {
      await db
        .insert(refreshTokens)
        .values({ userId, refreshTokenEncrypted: encryptedRt, expiresAt })
        .run()
    }
  }

  saveDb()
}

/**
 * 获取并解密 B站 Cookie
 *
 * @param userId - 用户 ID
 * @returns 解密后的 Cookie 字符串，或 null
 */
export async function getBilibiliCookie(userId: number): Promise<string | null> {
  const db = await getDb()

  const [row] = await db
    .select()
    .from(bilibiliCookies)
    .where(eq(bilibiliCookies.userId, userId))
    .all()

  if (!row) return null

  const config = useRuntimeConfig()
  try {
    return decrypt(row.cookieEncrypted, config.encryptKey)
  } catch {
    // 解密失败（密钥变更等），清除无效 Cookie
    await db.delete(bilibiliCookies).where(eq(bilibiliCookies.id, row.id)).run()
    saveDb()
    return null
  }
}

// ============================================================
// 完整登录流程
// ============================================================

/**
 * 处理扫码登录成功后的完整流程：
 * 1. 通过 Cookie 获取 B站用户信息
 * 2. Upsert 用户
 * 3. 存储 Cookie 和 refresh_token
 * 4. 创建 session
 *
 * @param cookie - 扫码成功获取的 B站 Cookie
 * @param refreshToken - B站 refresh_token
 * @returns session_id (UUID)
 */
export async function handleLoginSuccess(
  cookie: string,
  refreshToken?: string,
): Promise<string> {
  // 1. 获取 B站 用户信息
  const userInfo = await getNavUserInfo(cookie)

  if (!userInfo.isLogin || !userInfo.mid) {
    throw createError({
      statusCode: 401,
      statusMessage: '获取 B站 用户信息失败，Cookie 可能无效',
    })
  }

  // 2. Upsert 用户
  const userId = await upsertUser(
    String(userInfo.mid),
    userInfo.uname,
    userInfo.face,
  )

  // 3. 存储 Cookie
  await storeBilibiliCookie(userId, cookie, refreshToken)

  // 4. 创建 session
  const sessionId = await createSession(userId)

  return sessionId
}
