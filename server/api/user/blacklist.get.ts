/**
 * GET /api/user/blacklist
 *
 * 返回当前登录用户屏蔽的 UP 列表。无记录时返回空数组。
 */
import type { BlacklistItem } from '../../../app/types'
import { getDb } from '../../db'
import { userBlacklist } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, message: '未登录' })
  }

  const db = await getDb()
  const rows = await db
    .select()
    .from(userBlacklist)
    .where(eq(userBlacklist.userId, user.id))
    .all()

  const items: BlacklistItem[] = rows.map((r) => ({ mid: r.mid, owner: r.owner }))

  return { items }
})
