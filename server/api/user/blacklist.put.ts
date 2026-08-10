/**
 * PUT /api/user/blacklist
 *
 * 全量覆盖当前登录用户屏蔽的 UP 列表。Body: { items: { mid, owner }[] }
 * 先删后插保证与客户端 cookie 中的列表完全一致。
 */
import type { BlacklistItem } from '../../../app/types'
import { getDb, saveDb } from '../../db'
import { userBlacklist } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, message: '未登录' })
  }

  const body = await readBody(event)
  const items = body?.items

  if (!Array.isArray(items)) {
    throw createError({ statusCode: 400, message: 'items 需为数组' })
  }

  // 校验 + 去重（同 mid 保留最后一个）
  const unique = new Map<string, BlacklistItem>()
  for (const item of items) {
    if (typeof item?.mid !== 'string' || !item.mid.trim()) {
      throw createError({ statusCode: 400, message: 'mid 必填且为字符串' })
    }
    const mid = item.mid.trim()
    unique.set(mid, { mid, owner: String(item.owner ?? '') })
  }

  const db = await getDb()
  await db.delete(userBlacklist).where(eq(userBlacklist.userId, user.id)).run()
  for (const item of unique.values()) {
    await db.insert(userBlacklist).values({ userId: user.id, mid: item.mid, owner: item.owner }).run()
  }

  saveDb()
  return { ok: true }
})
