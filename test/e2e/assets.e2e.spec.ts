/**
 * 静态资源验证
 *
 * 验证关键静态资源文件已从原项目迁移
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = resolve(__dirname, '../..')
const publicDir = resolve(rootDir, 'public')
const assetsDir = resolve(publicDir, 'assets')

describe('静态资源迁移验证', () => {
  it('favicon.ico 已迁移', () => {
    expect(existsSync(resolve(publicDir, 'favicon.ico'))).toBe(true)
  })

  it('logo.png 已迁移', () => {
    expect(existsSync(resolve(publicDir, 'logo.png'))).toBe(true)
  })

  it('icons8.png 已迁移', () => {
    expect(existsSync(resolve(publicDir, 'icons8.png'))).toBe(true)
  })

  it('Banner assets 目录已迁移', () => {
    const expectedDirs = [
      '2023-10-01', '2023-10-26', '2023-11-17', '2023-12-12',
      '2024-02-01', '2024-06-06', '2024-06-26', '2024-09-26',
      '2024-12-26', '2025-04-05', '2025-06-15',
    ]

    for (const dir of expectedDirs) {
      expect(existsSync(resolve(assetsDir, dir))).toBe(true)
    }
  })

  it('每个 Banner 目录包含图片资源', () => {
    // data.json 由 grab.js 脚本生成（不在 git 中），测试只验证目录和图片存在
    const dirs = [
      '2023-10-01', '2023-10-26', '2023-11-17', '2023-12-12',
      '2024-02-01', '2024-06-06', '2024-06-26', '2024-09-26',
      '2024-12-26', '2025-04-05', '2025-06-15',
    ]

    for (const dir of dirs) {
      const dirPath = resolve(assetsDir, dir)
      const fs = require('node:fs')
      const files = fs.readdirSync(dirPath)
      // 每个目录至少有一些 .webp 或 .png 图片
      const hasImages = files.some(
        (f: string) => f.endsWith('.webp') || f.endsWith('.png') || f.endsWith('.jpg'),
      )
      expect(hasImages).toBe(true)
    }
  })
})
