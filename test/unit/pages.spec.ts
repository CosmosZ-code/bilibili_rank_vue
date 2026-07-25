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
      'LiveGrid',
      'BackToTop',
    ]

    for (const component of requiredComponents) {
      expect(content).toContain(component)
    }
  })

  it('使用 useFetch 获取数据 + useScrollToTop', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toMatch(/useLazyAsyncData|useFetch/)
    expect(content).toContain('useScrollToTop')
  })

  it('设置 SEO meta 标签', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('useHead')
    expect(content).toContain('bilibili')
  })

  it('数据通过 useFetch 自动获取（SSR + CSR）', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toMatch(/useLazyAsyncData|useFetch/)
    expect(content).toContain('/api/ranking')
    expect(content).toContain('/api/live-rooms')
  })

  it('双向绑定 viewMode/searchTerm/purifyPercent/areaId', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('@update:viewMode')
    expect(content).toContain('@update:searchTerm')
    expect(content).toContain('@update:purifyPercent')
    expect(content).toContain('@update:areaId')
  })

  it('包含分页相关变量和逻辑', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('PAGE_SIZE')
    expect(content).toContain('currentPage')
    expect(content).toContain('extraItems')
    expect(content).toContain('hasMoreFromServer')
    expect(content).toContain('loadMore')
  })
})

describe('createError 使用 message 而非 statusMessage', () => {
  const serverApiFiles = [
    'server/api/auth/qr-check.get.ts',
    'server/api/favorites.get.ts',
    'server/api/history.get.ts',
    'server/api/user/preferences.get.ts',
    'server/api/user/preferences.put.ts',
  ]

  const serverUtilFiles = [
    'server/utils/auth.ts',
    'server/utils/bilibili.ts',
  ]

  const allServerFiles = [...serverApiFiles, ...serverUtilFiles]

  it('所有 createError 调用使用 message 而非 statusMessage', async () => {
    const fs = await import('node:fs/promises')

    for (const file of allServerFiles) {
      const content = await fs.readFile(resolve(rootDir, file), 'utf-8')

      // 提取所有 createError({...}) 调用
      const calls = content.match(/createError\(\{[\s\S]*?\}\)/g) || []

      for (const call of calls) {
        // 每个 createError 调用必须包含 message:（新写法）
        expect(
          call,
          `${file}: createError 必须使用 message 而非 statusMessage\n调用内容: ${call}`,
        ).toMatch(/message:/)
      }
    }
  })

  it('所有服务端文件不再包含 statusMessage', async () => {
    const fs = await import('node:fs/promises')

    for (const file of allServerFiles) {
      const content = await fs.readFile(resolve(rootDir, file), 'utf-8')
      expect(
        content,
        `${file} 不应再包含 statusMessage`,
      ).not.toContain('statusMessage')
    }
  })

  it('消费者代码使用 err.message 而非 err.statusMessage', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(
      resolve(rootDir, 'server/utils/bilibili.ts'),
      'utf-8',
    )

    // 读取 err.message 的地方（原为 err.statusMessage）
    expect(content).toContain('err.message')
    expect(content).not.toContain('err.statusMessage')
  })

  it('dateFormat 使用固定 options（toLocaleString 带 options）', async () => {
    const fs = await import('node:fs/promises')
    const indexContent = await fs.readFile(
      resolve(rootDir, 'app/pages/index.vue'),
      'utf-8',
    )

    // index.vue 中不应再出现无 options 的 toLocaleString('zh-CN')
    const bareLocaleMatches = indexContent.match(
      /toLocaleString\('zh-CN'\)(?!\s*[,;])/g,
    )
    expect(bareLocaleMatches).toBeNull()
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
