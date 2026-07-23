/**
 * Nitro 插件：数据库初始化
 *
 * 在服务器启动时初始化 SQLite 数据库表结构
 */
import { initDb } from '../db'

export default defineNitroPlugin(async () => {
  const config = useRuntimeConfig()
  await initDb(config.dbPath)
  console.log('[DB] 数据库已初始化:', config.dbPath)
})
