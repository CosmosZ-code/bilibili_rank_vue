/**
 * GET /api/user/preferences
 *
 * 返回当前登录用户的偏好设置。无记录时返回 purifyPercent: null。
 */
import { getDb } from '../../db'
import { userPreferences } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, message: '未登录' })
  }

  const db = await getDb()
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .all()

  // 无记录时返回 null，前端据此判断是"还没存过"还是"存的是 0"
  if (!row) return { purifyPercent: null }

  return { purifyPercent: row.purifyPercent }
})
