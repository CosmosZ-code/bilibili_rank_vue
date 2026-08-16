/**
 * 浏览器兼容看护（一）：现代浏览器路径回归
 *
 * 在支持全部新 API 的浏览器上验证：
 * - 核心功能正常（数据渲染、视图切换、主题切换）
 * - 关键视觉效果（毛玻璃、Banner 图层定位、网格布局、主题变量）
 * - 无未捕获 JS 错误 / 无 JS 类 console 错误
 *
 * 用途：兼容性代码合入前后对比基线——此文件必须始终全绿；
 * 任何修改导致功能/视觉回归都会在这里暴露。
 *
 * 注意：`.video-card` 同时是骨架屏类名，真实卡片以 `.video-meta` / `.rank-badge` 为标记。
 */
import { describe, it, expect } from 'vitest'
import { createPage, url } from '@nuxt/test-utils/e2e'

// ============================================================
// 工具
// ============================================================

/** 收集页面 JS 错误（未捕获异常 + JS 类 console error，过滤网络资源噪音） */
function collectJsErrors(page: any): string[] {
  const errors: string[] = []
  page.on('pageerror', (e: Error) => {
    errors.push(`pageerror: ${e.message}`)
  })
  page.on('console', (msg: any) => {
    if (msg.type() !== 'error') return
    const text = String(msg.text?.() ?? '')
    // 网络资源加载失败（图片/视频 404 等）不属于 JS 崩溃，过滤
    if (/Failed to load resource|net::ERR_|ERR_/.test(text)) return
    errors.push(`console: ${text}`)
  })
  return errors
}

/** 等待真实视频卡片出现（超时不抛错，由调用方断言） */
async function waitForRealCards(page: any): Promise<void> {
  await page.waitForSelector('.video-meta', { timeout: 15_000 }).catch(() => {})
}

/**
 * 打开页面并等待 hydration 完成（错误监听先注册，覆盖 hydration 期错误）。
 * 不能用 createPage(path)——其默认等 hydration，监听器会漏掉 hydration 期错误。
 */
async function openWithErrorGuard(page: any, path = '/'): Promise<string[]> {
  const errors = collectJsErrors(page)
  await page.goto(url(path), { waitUntil: 'hydration' })
  return errors
}

/**
 * 模拟系统深色偏好（导航前设置）。
 * 注意：不能用 cookie 固定主题——e2e 服务器 SSR 读不到 cookie（恒渲染 auto），
 * 客户端 cookie 与 SSR 不一致会触发 hydration mismatch 并损坏 DOM。
 * emulateMedia 只影响客户端的 prefers-color-scheme，theme 模式两端仍为 auto，
 * resolvedTheme 差异由客户端 watch 同步到 data-theme（html 属性不在 hydration 比较范围）。
 */
async function emulateDarkMode(page: any): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' })
}

// ============================================================
// 用例
// ============================================================

describe('兼容看护：现代浏览器路径（必须始终全绿）', () => {
  it('首页骨架屏后渲染真实视频卡片，且无 JS 错误', async () => {
    const page = await createPage(undefined)
    const errors = await openWithErrorGuard(page)

    await waitForRealCards(page)
    const cardCount = await page.$$eval('.video-card', (els: Element[]) => els.length)
    const realCount = await page.$$eval('.video-meta', (els: Element[]) => els.length)

    expect(cardCount).toBeGreaterThan(0)
    expect(realCount).toBeGreaterThan(0)
    expect(errors).toEqual([])
    await page.close()
  })

  it('视频/直播视图切换正常（URL 带 view 参数）', async () => {
    const page = await createPage(undefined)
    const errors = await openWithErrorGuard(page)

    await page.waitForSelector('.live-trigger', { timeout: 10_000 }).catch(() => {})
    await page.$$eval('.live-trigger', (els: Element[]) => els.forEach((el) => (el as HTMLElement).click()))
    await page.waitForSelector('.live-card', { timeout: 15_000 }).catch(() => {})

    const liveCards = await page.$$eval('.live-card', (els: Element[]) => els.length)
    expect(liveCards).toBeGreaterThan(0)
    expect(page.url()).toContain('view=live')
    expect(errors).toEqual([])
    await page.close()
  })

  it('毛玻璃效果保持（顶栏 backdrop-filter 生效）', async () => {
    const page = await createPage('/')
    await page.waitForSelector('.mobile-top-bar', { timeout: 10_000 }).catch(() => {})

    const filter = await page.$eval('.mobile-top-bar', (el: Element) => {
      const s = getComputedStyle(el)
      return s.backdropFilter || s.webkitBackdropFilter || ''
    })
    expect(filter).toContain('blur')
    await page.close()
  })

  it('Banner 视差图层定位正确（absolute + 原点对齐 + 充满容器）', async () => {
    const page = await createPage('/')
    await waitForRealCards(page)
    await page.waitForSelector('.banner-root .layer', { timeout: 10_000 }).catch(() => {})

    const pos = await page.$eval('.banner-root .layer', (el: Element) => {
      const s = getComputedStyle(el)
      return {
        position: s.position,
        top: s.top,
        left: s.left,
        width: parseFloat(s.width),
        height: parseFloat(s.height),
      }
    })
    expect(pos.position).toBe('absolute')
    expect(pos.top).toBe('0px')
    expect(pos.left).toBe('0px')
    expect(pos.width).toBeGreaterThan(0)
    expect(pos.height).toBeGreaterThan(0)
    await page.close()
  })

  it('视频网格保持 grid 多列布局', async () => {
    const page = await createPage('/')
    await waitForRealCards(page)

    const grid = await page.$eval('.video-grid', (el: Element) => {
      const s = getComputedStyle(el)
      return {
        display: s.display,
        columns: s.gridTemplateColumns === 'none' ? 0 : s.gridTemplateColumns.split(' ').length,
      }
    })
    expect(grid.display).toBe('grid')
    expect(grid.columns).toBeGreaterThanOrEqual(2)
    await page.close()
  })

  it('主题切换：data-theme 变化且 CSS 变量生效', async () => {
    const page = await createPage(undefined)
    const errors = collectJsErrors(page)
    // 模拟系统深色 → auto 模式初始 data-theme=dark（客户端 watch 同步）
    await emulateDarkMode(page)
    await page.goto(url('/'), { waitUntil: 'hydration' })

    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
    const darkTextColor = await page.$eval('html', (el) =>
      getComputedStyle(el).getPropertyValue('--text-title').trim(),
    )

    // 点击悬浮主题开关 → auto → light
    await page.$eval('.theme-switch', (el: Element) => (el as HTMLElement).click())
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
    const lightTextColor = await page.$eval('html', (el) =>
      getComputedStyle(el).getPropertyValue('--text-title').trim(),
    )

    expect(darkTextColor).toBeTruthy()
    expect(lightTextColor).not.toBe(darkTextColor)
    expect(errors).toEqual([])
    await page.close()
  })

  it('真实卡片可见（无空白：尺寸均大于 0）', async () => {
    const page = await createPage('/')
    await waitForRealCards(page)

    const sizes = await page.$$eval('.video-card', (els: Element[]) =>
      els.map((el) => ({
        w: el.clientWidth,
        h: el.clientHeight,
      })),
    )
    expect(sizes.length).toBeGreaterThan(0)
    for (const s of sizes) {
      expect(s.w).toBeGreaterThan(0)
      expect(s.h).toBeGreaterThan(0)
    }
    await page.close()
  })
})
