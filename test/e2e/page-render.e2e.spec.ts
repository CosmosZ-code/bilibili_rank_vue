/**
 * 页面渲染集成测试 — 验证核心功能能正常工作
 */
import { describe, it, expect } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'

describe('页面完整渲染', async () => {
  it('首页返回 200 并包含核心内容', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('<!DOCTYPE html>')
    // Controls
    expect(html).toContain('观看列表')
    expect(html).toContain('过滤等级')
    // Footer
    expect(html).toContain('bilibili_rank_vue')
    expect(html).toContain('此页面基于以下开源项目')
    // Banner fallback：元素 SSR 渲染，样式经 CSS 产物提供
    // （@unocss/nuxt 默认禁用 Nuxt 内联样式，--b-blue 在产物 CSS 而非 HTML 内联）
    expect(html).toContain('banner-fallback')
    const cssHref = html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+\.css)"/)?.[1]
    expect(cssHref).toBeTruthy()
    const css = await $fetch<string>(cssHref!)
    expect(css).toContain('--b-blue')
  })

  it('SSR 阶段渲染骨架屏（server: false 不在服务端获取数据）', async () => {
    const html = await $fetch<string>('/')
    // 骨架屏使用 video-card skeleton 类
    expect(html).toContain('video-card')
    expect(html).toContain('skeleton-box')
    // 不应该包含真实视频卡片特有元素
    expect(html).not.toContain('rank-badge')
    expect(html).not.toContain('video-meta')
  })

	it('/api/ranking 返回 mock 降级数据', async () => {
	    const data = await $fetch<Record<string, any>>('/api/ranking')
	    const items = data.items
	    expect(items.length).toBeGreaterThanOrEqual(8)

	    const item = items[0]
	    expect(item.bvid).toMatch(/^BV/)
	    expect(item.title).toBeTruthy()
	    expect(item.owner).toBeTruthy()
	    expect(typeof item.count_num).toBe('number')
	    expect(item.count_num).toBeGreaterThan(0)
	    expect(item.online_count).toBeTruthy()
	    // 播放量和弹幕数不能为 "0" 字符串
	    expect(item.play_count).not.toBe('0')
	    expect(item.danmaku_count).not.toBe('0')
	    expect(item.play_count_num).toBeGreaterThan(0)
	    expect(item.danmaku_count_num).toBeGreaterThan(0)
	  })

	it('视频数据格式与旧 data.json 兼容', async () => {
	    const data = await $fetch<Record<string, any>>('/api/ranking')
	    for (const item of data.items) {
	      // 每个视频必须有这些字段
	      expect(item).toHaveProperty('title')
	      expect(item).toHaveProperty('owner')
	      expect(item).toHaveProperty('mid')
	      expect(item).toHaveProperty('pic')
	      expect(item).toHaveProperty('online_count')
	      expect(item).toHaveProperty('count_num')
	      expect(item).toHaveProperty('play_count_num')
	      expect(item).toHaveProperty('danmaku_count_num')
	      expect(item).toHaveProperty('play_count')
	      expect(item).toHaveProperty('danmaku_count')
	    }
	  })

  it('SSR 页面壳渲染正确，骨架屏不含真实数据', async () => {
    const html = await $fetch<string>('/')
    // 骨架屏标记
    expect(html).toContain('skeleton-box')
    expect(html).toContain('skeleton-line')
    // 不含真实数据标记（server: false 阻止服务端数据加载）
    expect(html).not.toContain('rank-badge')
    expect(html).not.toContain('video-meta')
    // 骨架屏数量合理（12 个骨架卡片）
    const videoCardCount = (html.match(/video-card/g) || []).length
    expect(videoCardCount).toBeGreaterThan(0)
    expect(videoCardCount).toBeLessThan(50)
  })

  it('SSR 不包含真实榜单数据，API 独立正常运行', async () => {
    const html = await $fetch<string>('/')
    const data = await $fetch<Record<string, any>>('/api/ranking')
    // API 仍正常返回视频数据
    expect(data.items.length).toBeGreaterThan(0)
    // SSR HTML 不包含真实数据标记（server: false 确保仅客户端加载）
    expect(html).not.toContain('rank-badge')
    expect(html).not.toContain('video-meta')
  })

  it('首屏 SSR 只渲染骨架屏（server: false 不传榜单数据）', async () => {
    const html = await $fetch<string>('/')
    // 骨架屏 12 个，远少于真实数据量
    const videoCardCount = (html.match(/video-card/g) || []).length
    expect(videoCardCount).toBeLessThan(50)
    // 无真实榜单数据
    expect(html).not.toContain('rank-badge')
    expect(html).not.toContain('video-meta')
  })
})
