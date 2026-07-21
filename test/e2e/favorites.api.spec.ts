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
    const utils = ['bilibili.ts', 'crypto.ts', 'bannerData.ts']
    for (const util of utils) {
      expect(existsSync(resolve(serverUtilsDir, util))).toBe(true)
    }
  })

  it('所有 server/api 文件存在', () => {
    const apis = ['ranking.get.ts', 'history.get.ts', 'favorites.get.ts', 'cookie.post.ts']
    for (const api of apis) {
      expect(existsSync(resolve(serverApiDir, api))).toBe(true)
    }
  })

  it('API 文件总数正确（4 个端点）', async () => {
    const fs = await import('node:fs/promises')
    const files = await fs.readdir(serverApiDir)
    const tsFiles = files.filter((f: string) => f.endsWith('.ts'))
    // 至少 4 个 API 文件
    expect(tsFiles.length).toBeGreaterThanOrEqual(4)
  })
})
