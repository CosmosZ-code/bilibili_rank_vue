/**
 * E2E 测试：排行榜过滤变化时不闪烁
 *
 * 使用 page.route() mock API 响应，避免依赖真实 B站 数据。
 * 验证修改净化值和搜索词后，页面不会出现骨架屏闪烁。
 */

import { describe, it, expect } from 'vitest'
import { setup, createPage } from '@nuxt/test-utils/e2e'

// Mock 视频数据
function makeMockItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    bvid: `BV1${String(i).padStart(8, '0')}`,
    title: `测试视频-${i + 1}`,
    owner: `UP主${i + 1}`,
    mid: `${10000 + i}`,
    pic: 'https://i0.hdslb.com/bfs/archive/mock.jpg',
    online_count: `${100 - i}万+`,
    count_num: (count - i) * 10000,
    play_count_num: 1000000,
    danmaku_count_num: 50000,
    play_count: '100万',
    danmaku_count: '5万',
  }))
}

describe('排行榜过滤无闪烁', async () => {
  await setup({ browser: true, server: true })

  it('首次加载后骨架屏消失，视频卡片正常显示', async () => {
    const page = await createPage('/')

    // Mock 排行榜 API
    await page.route('**/api/ranking**', (route) => {
      const items = makeMockItems(30)
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          total: 30,
          page: 1,
          pageSize: 30,
          hasMore: false,
          timestamp: Date.now(),
        }),
      })
    })

    // 等待视频卡片出现
    await page.waitForSelector('.video-card', { timeout: 15000 })
    // 等待骨架屏消失
    await page.waitForFunction(
      () => document.querySelectorAll('.skeleton-box').length === 0,
      { timeout: 10000 },
    )

    const cards = await page.$$('.video-card')
    expect(cards.length).toBeGreaterThan(0)

    await page.close()
  })

  it('修改净化值时骨架屏不重现', async () => {
    const page = await createPage('/')

    // Mock 排行榜 API
    await page.route('**/api/ranking**', (route) => {
      const items = makeMockItems(30)
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          total: 30,
          page: 1,
          pageSize: 30,
          hasMore: false,
          timestamp: Date.now(),
        }),
      })
    })

    await page.waitForSelector('.video-card', { timeout: 15000 })
    await page.waitForFunction(
      () => document.querySelectorAll('.skeleton-box').length === 0,
      { timeout: 10000 },
    )

    // 修改净化值滑块
    const slider = await page.$('#percent-range')
    if (!slider) {
      await page.close()
      return
    }

    await slider.evaluate((el) => {
      const input = el as HTMLInputElement
      input.value = '50'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // 等待 debounce + mock 响应完成
    await page.waitForTimeout(2000)

    // 骨架屏不应重现
    const skeletons = await page.$$('.skeleton-box')
    expect(skeletons.length).toBe(0)

    await page.close()
  })

  it('修改搜索词时骨架屏不重现', async () => {
    const page = await createPage('/')

    // Mock 排行榜 API
    await page.route('**/api/ranking**', (route) => {
      const url = new URL(route.request().url())
      const search = url.searchParams.get('search') || ''
      const items = makeMockItems(search ? 5 : 30).map((v) => ({
        ...v,
        title: search ? `${search}-${v.title}` : v.title,
      }))
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          total: items.length,
          page: 1,
          pageSize: 30,
          hasMore: false,
          timestamp: Date.now(),
        }),
      })
    })

    await page.waitForSelector('.video-card', { timeout: 15000 })
    await page.waitForFunction(
      () => document.querySelectorAll('.skeleton-box').length === 0,
      { timeout: 10000 },
    )

    // 输入搜索词
    const searchInput = await page.$('.search-box')
    if (!searchInput) {
      await page.close()
      return
    }

    await searchInput.type('测试', { delay: 50 })

    // 等待 debounce + mock 响应完成
    await page.waitForTimeout(2000)

    // 骨架屏不应重现
    const skeletons = await page.$$('.skeleton-box')
    expect(skeletons.length).toBe(0)

    await page.close()
  })

  it('有更多数据时显示"下滑加载更多..."提示', async () => {
    const page = await createPage('/')

    // Mock 排行榜 API：hasMore = true
    await page.route('**/api/ranking**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: makeMockItems(30),
          total: 100,
          page: 1,
          pageSize: 30,
          hasMore: true,
          timestamp: Date.now(),
        }),
      })
    })

    await page.waitForSelector('.video-card', { timeout: 15000 })
    await page.waitForFunction(
      () => document.querySelectorAll('.skeleton-box').length === 0,
      { timeout: 10000 },
    )

    // "下滑加载更多..."提示应出现
    await page.waitForFunction(
      () => document.body.innerText.includes('下滑加载更多'),
      { timeout: 10000 },
    )

    await page.close()
  })

  it('无更多数据时显示"已展示全部"', async () => {
    const page = await createPage('/')

    // Mock 排行榜 API：hasMore = false
    await page.route('**/api/ranking**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: makeMockItems(10),
          total: 10,
          page: 1,
          pageSize: 30,
          hasMore: false,
          timestamp: Date.now(),
        }),
      })
    })

    await page.waitForSelector('.video-card', { timeout: 15000 })
    await page.waitForFunction(
      () => document.querySelectorAll('.skeleton-box').length === 0,
      { timeout: 10000 },
    )

    // "已展示全部"提示应出现
    await page.waitForFunction(
      () => document.body.innerText.includes('已展示全部'),
      { timeout: 10000 },
    )

    await page.close()
  })
})
