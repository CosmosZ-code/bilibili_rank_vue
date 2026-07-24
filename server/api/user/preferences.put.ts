/**
 * PUT /api/user/preferences
 *
 * 保存当前登录用户的偏好设置。Body: { purifyPercent: number }
 */
import { getDb, saveDb } from '../../db'
import { userPreferences } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: '未登录' })
  }

  const body = await readBody(event)
  const val = Number(body?.purifyPercent)

  if (isNaN(val) || val < 0 || val > 100) {
    throw createError({ statusCode: 400, statusMessage: 'purifyPercent 需为 0-100 的数字' })
  }

  const db = await getDb()
  const [existing] = await db
    .select().from(userPreferences)
    .where(eq(userPreferences.userId, user.id)).all()

  if (existing) {
    await db.update(userPreferences).set({ purifyPercent: val })
      .where(eq(userPreferences.userId, user.id)).run()
  } else {
    await db.insert(userPreferences).values({ userId: user.id, purifyPercent: val }).run()
  }

  saveDb()
  return { ok: true }
})
