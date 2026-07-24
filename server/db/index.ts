/**
 * 数据库连接管理
 *
 * 基于 sql.js (WASM SQLite) + Drizzle ORM
 * - 开发/生产：从磁盘文件加载，每次写入后自动保存
 * - 测试：纯内存数据库
 */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { drizzle, type SqlJsDatabase as DrizzleDatabase } from 'drizzle-orm/sql-js'
import * as schema from './schema'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// ============================================================
// 类型导出
// ============================================================
export type Database = ReturnType<typeof drizzle<typeof schema>>
export { schema }

// ============================================================
// 模块级单例
// ============================================================
let _db: Database | null = null
let _sqlDb: SqlJsDatabase | null = null
let _dbPath: string | null = null
let _isMemoryOnly = false

// ============================================================
// WASM 定位
// ============================================================

/**
 * 查找 sql-wasm.wasm 文件路径
 *
 * sql.js 依赖一个独立的 .wasm 文件。在不同运行环境中位置不同：
 * - 开发模式：node_modules/sql.js/dist/
 * - 生产构建：Nitro serverAssets 复制到 assets/sql-wasm/
 */
function findWasmPath(): string {
  const candidates = [
    // 开发模式
    resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
    // 生产构建（Nitro serverAssets）
    resolve(process.cwd(), 'assets/sql-wasm/sql-wasm.wasm'),
    // .output 目录
    resolve(process.cwd(), '.output/server/assets/sql-wasm/sql-wasm.wasm'),
  ]

  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  // 回退：Emscripten 的默认搜索路径
  return 'sql-wasm.wasm'
}

// ============================================================
// 初始化
// ============================================================

/**
 * 获取或创建数据库实例（单例）
 *
 * @param dbPath - SQLite 数据库文件路径。如果为空则使用纯内存数据库
 */
export async function getDb(dbPath?: string): Promise<Database> {
  if (_db) return _db

  const SQL = await initSqlJs({
    locateFile: (_file: string) => findWasmPath(),
  })

  if (dbPath) {
    _dbPath = dbPath
    // 确保目录存在
    const dir = dirname(dbPath)
    if (dir && dir !== '.' && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // 从文件加载或创建新数据库
    if (existsSync(dbPath)) {
      const fileBuffer = readFileSync(dbPath)
      _sqlDb = new SQL.Database(fileBuffer)
    } else {
      _sqlDb = new SQL.Database()
    }
  } else {
    // 纯内存模式（测试用）
    _isMemoryOnly = true
    _sqlDb = new SQL.Database()
  }

  _db = drizzle(_sqlDb, { schema })
  return _db
}

/**
 * 将数据库持久化到磁盘
 *
 * 在每次写操作后调用。仅在非内存模式有效。
 */
export function saveDb(): void {
  if (_isMemoryOnly || !_sqlDb || !_dbPath) return

  const data = _sqlDb.export()
  const buffer = Buffer.from(data)
  writeFileSync(_dbPath, buffer)
}

/**
 * 获取原始 sql.js Database 实例（用于高级操作）
 */
export function getRawSqlDb(): SqlJsDatabase | null {
  return _sqlDb
}

/**
 * 重置数据库实例（仅用于测试）
 */
export function resetDb(): void {
  _sqlDb?.close()
  _db = null
  _sqlDb = null
  _dbPath = null
  _isMemoryOnly = false
}

// ============================================================
// 数据库初始化（创建表）
// ============================================================

/**
 * 初始化数据库表结构
 *
 * 在所有数据操作之前调用。使用 IF NOT EXISTS 确保幂等。
 */
export async function initDb(dbPath?: string): Promise<Database> {
  const db = await getDb(dbPath)
  const sqlDb = getRawSqlDb()!

  // 启用外键约束（sql.js 默认关闭）
  sqlDb.run('PRAGMA foreign_keys = ON')

  // 创建所有表（IF NOT EXISTS 保证幂等）
  // 注意：drizzle-orm 的 db.run() 不支持原始 SQL，使用底层 sql.js 实例
  sqlDb.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bilibili_uid TEXT NOT NULL UNIQUE,
    bilibili_uname TEXT NOT NULL,
    bilibili_face TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS bilibili_cookies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cookie_encrypted TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_encrypted TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    purify_percent INTEGER NOT NULL DEFAULT 10
  )`)

  saveDb()
  return db
}
