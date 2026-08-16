/**
 * 浏览器兼容看护（二）：降级路径（旧浏览器 API 缺失模拟）
 *
 * 通过 addInitScript 在页面任何脚本执行前删除 iOS 12/14 缺失的 API，
 * 模拟旧浏览器环境：
 * - Object.hasOwn / Array/String.prototype.at（Safari 15.4+）
 * - AbortController / AbortSignal（iOS 12.0/12.1 缺失）
 * - MediaQueryList.prototype.addEventListener（iOS 12 只有 addListener）
 *
 * 验证：
 * 1. 内联 polyfill 接管后页面正常渲染、无未捕获错误（兼容代码合入前此文件必红）
 * 2. polyfill 语义正确（hasOwn / at / AbortController）
 * 3. 路由导航、主题切换（addListener 回退）正常
 *
 * 说明：真实旧引擎无法在 CI 模拟，这里用「删除 API + polyfill 接管」的方式
 * 覆盖行为降级路径；语法降级由 build-output.e2e.spec.ts 的产物断言兜底。
 *
 * 注意：`.video-card` 同时是骨架屏类名，真实卡片以 `.video-meta` / `.rank-badge` 为标记。
 * 且此处不能用 createPage('/')（其默认等待 hydration，基线崩溃时会挂死），
 * 须 createPage(undefined) + 手动 goto(waitUntil: 'load')。
 */
import { describe, it, expect } from 'vitest'
import { createPage, url } from '@nuxt/test-utils/e2e'

// ============================================================
// 工具
// ============================================================

/** 删除旧浏览器缺失的 API（addInitScript：页面任何脚本执行前生效） */
function degradeBrowserApis(page: any): Promise<void> {
  const fn = () => {
    const G: any = window
    // Safari 15.4+ 才有（iOS 14.8 / Safari 14.1 缺失）；均为 configurable，delete 不抛错
    delete (Object as any).hasOwn
    delete (Array.prototype as any).at
    delete (String.prototype as any).at
    // iOS 12.0/12.1 缺失（ofetch 模块求值期捕获引用，必须由内联脚本先补齐）
    Object.defineProperty(G, 'AbortController', { value: undefined, writable: true, configurable: true })
    Object.defineProperty(G, 'AbortSignal', { value: undefined, writable: true, configurable: true })
    // iOS 12 的 MediaQueryList 只有 addListener。
    // 注意：addEventListener 继承自 EventTarget.prototype（Safari 14+ 才有），
    // delete 无效（属性不在 MediaQueryList.prototype 上，静默失败）——
    // 必须用 defineProperty 在 MediaQueryList.prototype 上遮蔽，模拟旧引擎
    Object.defineProperty(MediaQueryList.prototype as any, 'addEventListener', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  }
  if (typeof page.addInitScript === 'function') {
    return page.addInitScript(fn)
  }
  return page.evaluateOnNewDocument(fn)
}

/** 页面错误收集 + 首错信号（pageerror / JS 类 console error，过滤网络资源噪音） */
function createErrorSignal(page: any): { errors: string[]; signal: Promise<string> } {
  const errors: string[] = []
  let resolve!: (msg: string) => void
  const signal = new Promise<string>((r) => (resolve = r))
  const onError = (msg: string) => {
    errors.push(msg)
    resolve(msg)
  }
  page.on('pageerror', (e: Error) => onError(`pageerror: ${e.message}`))
  page.on('console', (msg: any) => {
    if (msg.type() !== 'error') return
    const text = String(msg.text?.() ?? '')
    if (/Failed to load resource|net::ERR_|ERR_/.test(text)) return
    onError(`console: ${text}`)
  })
  return { errors, signal }
}

/** 降级环境下加载首页（不等 hydration，避免基线崩溃导致挂死） */
async function openDegradedHome(page: any): Promise<void> {
  await page.goto(url('/'), { waitUntil: 'load' })
}

// ============================================================
// 用例
// ============================================================

describe('兼容看护：降级路径（合入前红，合入后绿）', () => {
  it('删除旧 API 后页面仍正常渲染真实卡片，且无 JS 错误', async () => {
    const page = await createPage(undefined)
    await degradeBrowserApis(page)
    const { errors, signal } = createErrorSignal(page)
    await openDegradedHome(page)

    // 竞速：真实卡片出现（成功）或首个 JS 错误（快速失败）
    const result = await Promise.race([
      page.waitForSelector('.video-meta', { timeout: 15_000 }).then(() => 'cards' as const),
      signal.then(() => 'error' as const),
    ])
    expect(result).toBe('cards')

    const realCount = await page.$$eval('.video-meta', (els: Element[]) => els.length)
    expect(realCount).toBeGreaterThan(0)
    expect(errors).toEqual([])
    await page.close()
  })

  it('polyfill 接管后语义正确（hasOwn / at / AbortController）', async () => {
    const page = await createPage(undefined)
    await degradeBrowserApis(page)
    await openDegradedHome(page)

    const result = await page.evaluate(() => {
      const hasOwnOk =
        typeof Object.hasOwn === 'function' &&
        Object.hasOwn({ a: 1 }, 'a') === true &&
        Object.hasOwn({ a: 1 }, 'toString') === false
      const atOk = [10, 20, 30].at(-1) === 30
      const strAtOk = 'abc'.at(-1) === 'c'
      let acOk = false
      try {
        const c = new AbortController()
        let fired = 0
        c.signal.addEventListener('abort', () => fired++)
        c.abort('x')
        acOk = c.signal.aborted === true && c.signal.reason === 'x' && fired === 1
      } catch { /* noop */ }
      return { hasOwnOk, atOk, strAtOk, acOk }
    })
    expect(result).toEqual({ hasOwnOk: true, atOk: true, strAtOk: true, acOk: true })
    await page.close()
  })

  it('删除旧 API 后路由导航正常（视图切换，matched.at 走 shim）', async () => {
    const page = await createPage(undefined)
    await degradeBrowserApis(page)
    const { errors } = createErrorSignal(page)
    await openDegradedHome(page)

    await page.waitForSelector('.live-trigger', { timeout: 10_000 }).catch(() => {})
    await page.$$eval('.live-trigger', (els: Element[]) => els.forEach((el) => (el as HTMLElement).click()))
    await page.waitForSelector('.live-card', { timeout: 15_000 }).catch(() => {})

    const liveCards = await page.$$eval('.live-card', (els: Element[]) => els.length)
    expect(liveCards).toBeGreaterThan(0)
    expect(page.url()).toContain('view=live')
    expect(errors).toEqual([])
    await page.close()
  })

  it('删除 MQ addEventListener 后主题跟随系统偏好变化（addListener 回退链路）', async () => {
    const page = await createPage(undefined)
    await degradeBrowserApis(page)
    const { errors } = createErrorSignal(page)
    // 模拟系统深色（不用 cookie：e2e 服务器 SSR 读不到 cookie 恒渲染 auto，
    // 客户端 cookie 会导致 hydration mismatch；emulateMedia 只影响客户端
    // prefers-color-scheme，theme 模式两端仍为 auto，无 mismatch）
    await page.emulateMedia({ colorScheme: 'dark' })
    await openDegradedHome(page)

    // auto + 系统深色 → data-theme=dark（首帧内联脚本设置，仅作前置状态）
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', { timeout: 10_000 })

    // 关键：触发真实 MQ change 事件（emulateMedia 会通知所有监听器，含
    // addListener 注册的）→ 驱动完整链路：addListener → onChange →
    // systemPrefersDark → resolvedTheme → watch → data-theme。
    // 若 useTheme 的 addListener 回退分支未注册监听器，data-theme 不会变化、
    // 用例失败——这正是原 click 版用例的假阳性所在（cycleTheme 不经 MQ）。
    await page.emulateMedia({ colorScheme: 'light' })
    const theme = await page
      .waitForFunction(() => document.documentElement.dataset.theme === 'light', { timeout: 10_000 })
      .then(() => 'light')
      .catch(() => 'dark')
    expect(theme).toBe('light')
    expect(errors).toEqual([])
    await page.close()
  })
})
