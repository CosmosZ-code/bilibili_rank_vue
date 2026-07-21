/**
 * 页面结构验证测试
 *
 * 验证页面文件和布局文件存在且结构正确
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = resolve(__dirname, '../..')

describe('页面和布局文件完整性', () => {
  it('layouts/default.vue 存在', () => {
    expect(existsSync(resolve(rootDir, 'app/layouts/default.vue'))).toBe(true)
  })

  it('pages/index.vue 存在', () => {
    expect(existsSync(resolve(rootDir, 'app/pages/index.vue'))).toBe(true)
  })

  it('app.vue 存在', () => {
    expect(existsSync(resolve(rootDir, 'app/app.vue'))).toBe(true)
  })
})

describe('index.vue 页面内容验证', () => {
  it('使用 ClientOnly 包裹 Banner', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('ClientOnly')
    expect(content).toContain('BannerContainer')
    expect(content).toContain('fallback') // SSR 回落内容
  })

  it('包含所有核心组件引用', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')

    const requiredComponents = [
      'BannerContainer',
      'RankingControls',
      'VideoGrid',
      'BackToTop',
    ]

    for (const component of requiredComponents) {
      expect(content).toContain(component)
    }
  })

  it('使用 useAsyncData 获取数据 + useScrollToTop', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('useAsyncData')
    expect(content).toContain('useScrollToTop')
  })

  it('设置 SEO meta 标签', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('useHead')
    expect(content).toContain('bilibili')
  })

  it('数据通过 useAsyncData 自动获取（SSR + CSR）', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('useAsyncData')
    expect(content).toContain('/api/ranking')
  })

  it('双向绑定 sortBy/searchTerm/purifyPercent', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('@update:sortBy')
    expect(content).toContain('@update:searchTerm')
    expect(content).toContain('@update:purifyPercent')
  })
})

describe('app.vue 内容验证', () => {
  it('包含 NuxtLayout 和 NuxtPage', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/app.vue'), 'utf-8')
    expect(content).toContain('NuxtLayout')
    expect(content).toContain('NuxtPage')
  })
})
