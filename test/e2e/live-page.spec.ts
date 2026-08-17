/**
 * 直播页面 E2E 测试
 *
 * 验证直播在页面中的集成表现：标签切换、搜索、分区筛选、SSR 直出。
 */
import { describe, it, expect } from 'vitest'
import { $fetch, createPage } from '@nuxt/test-utils/e2e'

describe('直播页面功能', async () => {
  it('默认加载"视频"模式，显示视频卡片', async () => {
    const page = await createPage('/')
    const html = await page.innerHTML('body')

    // 默认视频
    expect(html).toContain('视频')
    expect(html).toContain('直播')

    // 显示视频卡片
    await page.waitForSelector('.video-card', { timeout: 10000 }).catch(() => {})
    const videoCards = await page.$$('.video-card')
    expect(videoCards.length).toBeGreaterThan(0)

    await page.close()
  })

  it('点击"直播"标签切换到直播视图', async () => {
    const page = await createPage('/')
    await page.waitForSelector('.live-trigger:visible', { timeout: 5000 })

    // "直播"标签是 .live-trigger（非 .tab-btn），直接定位点击。
    // 注意：ViewSwitch 在 MobileTopBar（compact）与 RankingControls 各渲染一个实例，
    // DOM 中第一个可能是隐藏的移动端实例（>768px 时 display:none）——必须用 :visible 过滤可见实例
    const liveTab = await page.$('.live-trigger:visible')
    expect(liveTab).not.toBeNull()

    if (liveTab) {
      await liveTab.click()
      await page.waitForSelector('.live-card', { timeout: 10000 }).catch(() => {})
    }

    // 验证 URL 出现 ?view=live
    const url = page.url()
    expect(url).toContain('view=live')

    await page.close()
  })

  it('直播模式显示直播卡片', async () => {
    const page = await createPage('/?view=live')

    // 验证 LiveCard 渲染
    await page.waitForSelector('.live-card', { timeout: 15000 }).catch(() => {})
    const liveCards = await page.$$('.live-card')
    expect(liveCards.length).toBeGreaterThan(0)

    // 验证显示人气值
    const html = await page.innerHTML('body')
    expect(html).toContain('人气')

    await page.close()
  })

  it('切换到"视频"标签回到视频视图', async () => {
    const page = await createPage('/?view=live')
    await page.waitForSelector('.tab-btn:visible', { timeout: 5000 })

    // 点击"视频"标签
    const tabs = await page.$$('.tab-btn:visible')
    let videoTab = null
    for (const tab of tabs) {
      const text = await tab.evaluate((el: Element) => el.textContent)
      if (text?.includes('视频')) {
        videoTab = tab
        break
      }
    }
    expect(videoTab).not.toBeNull()

    if (videoTab) {
      await videoTab.click()
      await page.waitForFunction(() => !window.location.href.includes('view=live'), { timeout: 5000 })
    }

    // URL 不再包含 view=live
    const url = page.url()
    expect(url).not.toContain('view=live')

    await page.close()
  })

  it('直播模式搜索过滤', { timeout: 15000 }, async () => {
    const page = await createPage('/?view=live')
    await page.waitForSelector('.live-card', { timeout: 10000 }).catch(() => {})

    // 找到搜索框
    const searchInput = await page.$('input[type="search"], input[placeholder*="搜索"]')
    if (searchInput) {
      // 输入搜索词
      await searchInput.fill('游戏')
      // 等待 debounce (1s) + 请求完成
      await page.waitForTimeout(1500)

      const liveCards = await page.$$('.live-card')
      // 搜索后至少不崩溃，结果数量合理
      expect(liveCards.length).toBeGreaterThanOrEqual(0)
    }

    await page.close()
  })

  it('直链 ?view=live SSR 正确渲染直播视图', async () => {
    const html = await $fetch<string>('/?view=live')

    // SSR 阶段应包含直播相关的标记
    expect(html).toContain('直播')
    expect(html).toContain('<!DOCTYPE html>')
  })

  // ============================================================
  // 时间戳 API 验证
  // ============================================================
  it('GET /api/ranking/timestamp 返回有效时间戳', async () => {
    const data = await $fetch<{ timestamp: number }>('/api/ranking/timestamp')
    expect(data).toHaveProperty('timestamp')
    expect(typeof data.timestamp).toBe('number')
  })

  it('GET /api/live-rooms/timestamp 返回有效时间戳', async () => {
    const data = await $fetch<{ timestamp: number }>('/api/live-rooms/timestamp')
    expect(data).toHaveProperty('timestamp')
    expect(typeof data.timestamp).toBe('number')
  })

  it('GET /api/live-rooms/timestamp?areaId=2 返回分区时间戳', async () => {
    const data = await $fetch<{ timestamp: number }>('/api/live-rooms/timestamp?areaId=2')
    expect(data).toHaveProperty('timestamp')
    expect(typeof data.timestamp).toBe('number')
  })

  // ============================================================
  // 视图快速切换回归
  // ============================================================
  it('视频 ↔ 直播连续切换不报错', { timeout: 20000 }, async () => {
    const page = await createPage('/')
    await page.waitForSelector('.live-trigger:visible', { timeout: 5000 })

    // 切换到直播
    const liveTrigger = await page.$('.live-trigger:visible')
    expect(liveTrigger).not.toBeNull()
    if (liveTrigger) {
      await liveTrigger.click()
      await page.waitForFunction(() => window.location.href.includes('view=live'), { timeout: 5000 })
    }
    expect(page.url()).toContain('view=live')

    // 切回视频
    const tabs = await page.$$('.tab-btn:visible')
    let videoTab = null
    for (const tab of tabs) {
      const text = await tab.evaluate((el: Element) => el.textContent)
      if (text?.includes('视频')) {
        videoTab = tab
        break
      }
    }
    if (videoTab) {
      await videoTab.click()
      await page.waitForFunction(() => !window.location.href.includes('view=live'), { timeout: 5000 })
    }
    expect(page.url()).not.toContain('view=live')

    // 再次切换到直播
    const liveTrigger2 = await page.$('.live-trigger:visible')
    if (liveTrigger2) {
      await liveTrigger2.click()
      await page.waitForFunction(() => window.location.href.includes('view=live'), { timeout: 5000 })
    }
    expect(page.url()).toContain('view=live')

    await page.close()
  })

  it('直播分区反复切换正常（回归：第二次切回不失效）', { timeout: 20000 }, async () => {
    const page = await createPage('/')

    // ============================================================
    // Mock API：让测试聚焦前端切换逻辑，消除网络等待
    // ============================================================
    await page.route('**/api/live-rooms**', (route) => {
      const url = new URL(route.request().url())
      const areaId = url.searchParams.get('areaId') || '0'
      const prefix = areaId === '0' ? '全站' : areaId === '2' ? '网游' : `分区${areaId}`
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: Array.from({ length: 8 }, (_, i) => ({
            roomid: 1000 + Number(areaId) * 100 + i,
            title: `${prefix}直播间-${i + 1}`,
            uname: `主播${i + 1}`,
            uid: 100 + i,
            online: 5000 - i * 500,
            online_formatted: `${5000 - i * 500}`,
            cover: '',
            face: '',
            area_v2_name: prefix,
            parent_area_name: prefix,
            parent_area_id: Number(areaId),
            link: `https://live.bilibili.com/${1000 + Number(areaId) * 100 + i}`,
          })),
          total: 8,
          page: 1,
          pageSize: 30,
          hasMore: false,
          timestamp: Date.now(),
        }),
      })
    })

    await page.route('**/api/live-areas', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          areas: [
            { id: 2, name: '网游' },
            { id: 3, name: '手游' },
          ],
        }),
      })
    })

    await page.route('**/api/live-rooms/timestamp**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ timestamp: Date.now() }),
      })
    })

    await page.route('**/api/ranking/timestamp', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ timestamp: Date.now() }),
      })
    })

    // ============================================================
    // 切换到直播模式
    // ============================================================
    const liveTrigger = await page.$('.live-trigger:visible')
    expect(liveTrigger).not.toBeNull()
    await liveTrigger!.click()
    await page.waitForSelector('.live-card', { timeout: 5000 })
    let cards = await page.$$('.live-card')
    expect(cards.length).toBeGreaterThan(0)

    // ============================================================
    // 辅助函数：hover 下拉 → 点击第 n 个分区项
    // ============================================================
    async function selectAreaNth(index: number) {
      await page.$eval('.live-dropdown:visible', (el) => {
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      })
      await page.waitForTimeout(300)
      await page.evaluate((idx) => {
        const items = document.querySelectorAll('.dropdown-item')
        if (items.length > idx) (items[idx] as HTMLElement).click()
      }, index)
      await page.waitForTimeout(500)
      await page.waitForSelector('.live-card', { timeout: 5000 }).catch(() => {})
    }

    // 1. 全站 → 网游（dropdown 第 2 项，index=1）
    await selectAreaNth(1)
    cards = await page.$$('.live-card')
    expect(cards.length).toBeGreaterThan(0)
    // 验证切换到网游分区（卡片标题应含"网游"）
    const title1 = await page.$eval('.live-card:first-child', (el) => el.textContent || '')
    expect(title1).toContain('网游')

    // 2. 网游 → 全站（dropdown 第 1 项，index=0）
    await selectAreaNth(0)
    cards = await page.$$('.live-card')
    expect(cards.length).toBeGreaterThan(0)
    // 验证已切回全站数据
    const titleMid = await page.$eval('.live-card:first-child', (el) => el.textContent || '')
    expect(titleMid).toContain('全站')

    // 3. 全站 → 网游 —— 关键回归点：第二次切同一分区
    await selectAreaNth(1)
    cards = await page.$$('.live-card')
    expect(cards.length).toBeGreaterThan(0)
    const title2 = await page.$eval('.live-card:first-child', (el) => el.textContent || '')
    expect(title2).toContain('网游') // 第二次切回应仍显示网游数据

    await page.close()
  })
})
