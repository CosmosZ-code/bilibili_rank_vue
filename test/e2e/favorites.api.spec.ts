/**
 * API 路由完整性验证
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = resolve(__dirname, '../..')
const serverUtilsDir = resolve(rootDir, 'server/utils')
const serverApiDir = resolve(rootDir, 'server/api')

describe('服务端文件完整性', () => {
  it('所有 server/utils 文件存在', () => {
    const utils = ['bilibili.ts', 'crypto.ts', 'bannerData.ts', 'auth.ts']
    for (const util of utils) {
      expect(existsSync(resolve(serverUtilsDir, util))).toBe(true)
    }
  })

  it('所有 server/api 文件存在', () => {
    const apis = [
      'ranking.get.ts',
      'history.get.ts',
      'favorites.get.ts',
      'auth/qr.get.ts',
      'auth/qr-check.get.ts',
      'auth/user.get.ts',
      'auth/logout.post.ts',
    ]
    for (const api of apis) {
      expect(existsSync(resolve(serverApiDir, api)), `${api} is missing`).toBe(true)
    }
  })

  it('API 文件总数正确（至少 7 个端点）', async () => {
    const fs = await import('node:fs/promises')

    async function countFiles(dir: string): Promise<number> {
      let count = 0
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          count += await countFiles(resolve(dir, entry.name))
        } else if (entry.name.endsWith('.ts')) {
          count++
        }
      }
      return count
    }

    const total = await countFiles(serverApiDir)
    expect(total).toBeGreaterThanOrEqual(7)
  })
})
