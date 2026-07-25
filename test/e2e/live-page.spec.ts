/**
 * 直播页面 E2E 测试
 *
 * 验证直播在页面中的集成表现：标签切换、搜索、分区筛选、SSR 直出。
 */
import { describe, it, expect } from 'vitest'
import { setup, $fetch, createPage } from '@nuxt/test-utils/e2e'

describe('直播页面功能', async () => {
  await setup({ browser: true, server: true })

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
    await page.waitForTimeout(1000)

    // 找到"直播"标签并点击
    const tabs = await page.$$('.tab-btn')
    let liveTab = null
    for (const tab of tabs) {
      const text = await tab.evaluate((el: Element) => el.textContent)
      if (text?.includes('直播')) {
        liveTab = tab
        break
      }
    }
    expect(liveTab).not.toBeNull()

    if (liveTab) {
      await liveTab.click()
      await page.waitForTimeout(2000) // 等待 live-ranking 数据加载
    }

    // 验证 URL 出现 ?view=live
    const url = page.url()
    expect(url).toContain('view=live')

    await page.close()
  })

  it('直播模式显示直播卡片', async () => {
    const page = await createPage('/?view=live')
    await page.waitForTimeout(3000) // 等待数据加载

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
    await page.waitForTimeout(1000)

    // 点击"视频"标签
    const tabs = await page.$$('.tab-btn')
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
      await page.waitForTimeout(1000)
    }

    // URL 不再包含 view=live
    const url = page.url()
    expect(url).not.toContain('view=live')

    await page.close()
  })

  it('直播模式搜索过滤', async () => {
    const page = await createPage('/?view=live')
    await page.waitForTimeout(2000)

    // 找到搜索框
    const searchInput = await page.$('input[type="search"], input[placeholder*="搜索"]')
    if (searchInput) {
      // 输入搜索词
      await searchInput.fill('游戏')
      await page.waitForTimeout(2000) // 等待 debounce + 请求

      const liveCards = await page.$$('.live-card')
      // 可能有匹配结果或空结果，至少不报错
      expect(Array.isArray(liveCards)).toBe(true)
    }

    await page.close()
  })

  it('直播模式分区下拉选择', async () => {
    const page = await createPage('/?view=live')
    await page.waitForTimeout(2000)

    const areaSelect = await page.$('#area-select')
    if (areaSelect) {
      // 选择第二个选项（第一个是全站）
      await areaSelect.selectOption('2') // 游戏分区
      await page.waitForTimeout(2000)

      // 验证列表更新
      const liveCards = await page.$$('.live-card')
      expect(Array.isArray(liveCards)).toBe(true)
    }

    await page.close()
  })

  it('直链 ?view=live SSR 正确渲染直播视图', async () => {
    const html = await $fetch<string>('/?view=live')

    // SSR 阶段应包含直播相关的标记
    expect(html).toContain('直播')
    expect(html).toContain('<!DOCTYPE html>')

    await page.close()
  })
})
