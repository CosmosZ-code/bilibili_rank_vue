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

  it('数据仅通过客户端获取（server: false 阻止 SSR 数据加载），直播数据延迟加载', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toMatch(/useLazyAsyncData|useFetch/)
    expect(content).toContain('/api/ranking')
    expect(content).toContain('/api/live-rooms')
    expect(content).toContain('server: false')
    expect(content).toContain('liveDataEnabled')  // Step 2: 直播延迟加载
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
    expect(content).toContain('useVideoList')
    expect(content).toContain('loadMore')
    expect(content).toContain('vlHasMore')
  })

  it('登录成功（未登录 → 已登录）时立即触发 refreshPersonalized', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')

    // useVideoList 解构中包含 refreshPersonalized
    expect(content).toContain('refreshPersonalized,')

    // watch 登录状态：过渡到已登录时调用 refreshPersonalized
    expect(content).toMatch(/watch\(authUser, \(u, prev\)/)
    expect(content).toContain('!prev?.bilibiliUid')
    expect(content).toContain('refreshPersonalized()')
  })

  it('视图切换包含时间戳校验逻辑', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')

    // 纯函数 + 时间戳追踪
    expect(content).toContain('shouldSkipRefresh')
    expect(content).toContain('lastLiveTimestamp')
    expect(content).toContain('lastAreaTimestamps')

    // 共享刷新函数
    expect(content).toContain('refreshVideoData')
    expect(content).toContain('refreshLiveData')

    // 版本号防重复刷新
    expect(content).toContain('liveRefreshVersion')

    // 视图切换中的 timestamp 端点调用
    expect(content).toContain('/api/live-rooms/timestamp')

    // forceRefresh 用于即时刷新（替代 refreshNuxtData）
    expect(content).toContain('forceRefresh')
    expect(content).toContain("refreshNuxtData('live-ranking')")

    // watch(areaId) 独立处理分区切换
    expect(content).toContain('watch(areaId')

    // useLazyAsyncData watch 不再包含 areaId
    const liveRankingWatch = content.match(
      /useLazyAsyncData\(\s*'live-ranking'[\s\S]*?watch:\s*\[([^\]]*)\]/,
    )
    if (liveRankingWatch) {
      // watch 数组中应只包含 liveSearchTerm
      expect(liveRankingWatch[1]).toContain('liveSearchTerm')
      expect(liveRankingWatch[1]).not.toContain('areaId')
      expect(liveRankingWatch[1]).not.toContain('liveDataEnabled')
    } else {
      // 多行写法也检查
      const watchContent = content.substring(
        content.indexOf("useLazyAsyncData('live-ranking'"),
        content.indexOf('live-ranking') + 500,
      )
      expect(watchContent).toContain('liveSearchTerm')
      expect(watchContent).not.toContain("'areaId'")
    }
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

describe('API 路由只读缓存（不触发实时拉取）', () => {
  it('live-rooms.get.ts 包含 STALE 分支（else if (cached)）', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'server/api/live-rooms.get.ts'), 'utf-8')
    // 三分支：if (cached && fresh) → else if (cached) → else EMPTY
    expect(content).toContain('else if (cached)')
  })

  it('live-rooms.get.ts 不调用 getLiveRoomsData（不应触发全量拉取）', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'server/api/live-rooms.get.ts'), 'utf-8')
    expect(content).not.toContain('getLiveRoomsData')
  })

  it('live-rooms.get.ts 不导入 mock 数据', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'server/api/live-rooms.get.ts'), 'utf-8')
    expect(content).not.toContain('MOCK_LIVE_ROOMS_MAP')
  })

  it('ranking.get.ts 包含 STALE 分支（else if (cached)）', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'server/api/ranking.get.ts'), 'utf-8')
    // 三分支：if (cached && fresh) → else if (cached) → else EMPTY
    expect(content).toContain('else if (cached)')
  })

  it('ranking.get.ts 不调用 fetchAllRankings（不应触发全量拉取）', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'server/api/ranking.get.ts'), 'utf-8')
    expect(content).not.toContain('fetchAllRankings')
  })

  it('ranking.get.ts 不导入 mock 数据', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'server/api/ranking.get.ts'), 'utf-8')
    expect(content).not.toContain('MOCK_RANKING')
  })

  it('cache-warmer.ts 不导入 mock 数据', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'server/plugins/cache-warmer.ts'), 'utf-8')
    expect(content).not.toContain('MOCK_RANKING')
    expect(content).not.toContain('MOCK_LIVE_ROOMS_MAP')
  })
})

describe('前端空数据加载态 + 自动重试', () => {
  it('包含 effectiveLoading 计算属性', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('effectiveVideoLoading')
    expect(content).toContain('effectiveLiveLoading')
  })

  it('包含 dataPending 空数据检测', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('liveDataPending')
  })

  it('包含空数据自动重试逻辑', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(rootDir, 'app/pages/index.vue'), 'utf-8')
    expect(content).toContain('liveDataPending')
    expect(content).toContain("refreshNuxtData('live-ranking')")
  })
})
