/**
 * History / Favorites API 路由结构验证
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = resolve(__dirname, '../..')
const apiDir = resolve(rootDir, 'server/api')

describe('History & Favorites API 结构', () => {
  it('history.get.ts 和 favorites.get.ts 文件存在', () => {
    expect(existsSync(resolve(apiDir, 'history.get.ts'))).toBe(true)
    expect(existsSync(resolve(apiDir, 'favorites.get.ts'))).toBe(true)
  })

  it('两个文件使用 auth 中间件注入的 event.context.bilibiliCookie', async () => {
    const fs = await import('node:fs/promises')
    const historyContent = await fs.readFile(resolve(apiDir, 'history.get.ts'), 'utf-8')
    const favoritesContent = await fs.readFile(resolve(apiDir, 'favorites.get.ts'), 'utf-8')

    // 两个 API 都从 event.context 读取 bilibiliCookie（由 auth 中间件注入）
    expect(historyContent).toContain('bilibiliCookie')
    expect(favoritesContent).toContain('bilibiliCookie')

    // 两个 API 都返回 401 错误
    expect(historyContent).toContain('401')
    expect(favoritesContent).toContain('401')
  })
})
