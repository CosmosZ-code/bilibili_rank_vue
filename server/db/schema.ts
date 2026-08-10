/**
 * 数据库 Schema 定义
 *
 * 使用 Drizzle ORM + sql.js (WASM SQLite)
 * 5 张表：users / bilibili_cookies / refresh_tokens / user_preferences / user_blacklist / sessions
 */
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ============================================================
// users — B站用户身份
// ============================================================
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** B站 UID (mid) */
  bilibiliUid: text('bilibili_uid').notNull().unique(),
  /** B站用户名 */
  bilibiliUname: text('bilibili_uname').notNull(),
  /** B站头像 URL */
  bilibiliFace: text('bilibili_face'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

// ============================================================
// bilibili_cookies — 加密的 B站 Cookie
// ============================================================
export const bilibiliCookies = sqliteTable('bilibili_cookies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** AES-256-GCM 加密的完整 Cookie 字符串 */
  cookieEncrypted: text('cookie_encrypted').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

// ============================================================
// refresh_tokens — Cookie 刷新令牌
// ============================================================
export const refreshTokens = sqliteTable('refresh_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** AES-256-GCM 加密的 refresh_token */
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  /** 过期时间 (ISO 8601) */
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

// ============================================================
// user_preferences — 用户偏好设置
// ============================================================
export const userPreferences = sqliteTable('user_preferences', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  purifyPercent: integer('purify_percent').notNull().default(10),
})

// ============================================================
// user_blacklist — 用户屏蔽的 UP 列表
// ============================================================
export const userBlacklist = sqliteTable(
  'user_blacklist',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** UP主 mid */
    mid: text('mid').notNull(),
    /** UP主名称（冗余存储，展示用） */
    owner: text('owner').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mid] })],
)

// ============================================================
// sessions — 本地登录会话
// ============================================================
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 会话 UUID */
  sessionId: text('session_id').notNull().unique(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 过期时间 (ISO 8601) */
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})
