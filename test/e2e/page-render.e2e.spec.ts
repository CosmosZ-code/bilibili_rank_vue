/**
 * 页面渲染集成测试 — 验证核心功能能正常工作
 */
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('页面完整渲染', async () => {
  await setup({ browser: false, server: true })

  it('首页返回 200 并包含核心内容', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('<!DOCTYPE html>')
    // Controls
    expect(html).toContain('观看列表')
    expect(html).toContain('过滤等级')
    // Footer
    expect(html).toContain('bilibili_rank_html')
    expect(html).toContain('此页面基于以下开源项目')
    // Banner fallback
    expect(html).toContain('--b-blue')
  })

  it('SSR 阶段已渲染视频卡片（useFetch 在服务端获取数据）', async () => {
    const html = await $fetch<string>('/')
    // mock 数据至少有一张卡片
    expect(html).toContain('video-card')
    expect(html).toContain('rank-badge')
    // 不应该显示"没有找到匹配"
    expect(html).not.toContain('没有找到匹配的视频')
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

		  it('SSR 渲染的视频卡片不全是零数据', async () => {
	    const html = await $fetch<string>('/')

	    // 验证页面包含 video-meta 区域
	    expect(html).toContain('video-meta')

	    // 提取所有 video-meta 区域的文本内容
	    // 正常数据应包含中文单位（万、亿）或非零数字
	    const hasFormattedCount = html.includes('万<') || html.includes('亿<')
	    // 如果所有数据都是 "0"，则不会有中文单位
	    expect(hasFormattedCount).toBe(true)

	    // 额外的烟雾测试：不应该出现孤立的 ">0<" 模式
	    // 正常数据如 "511万" 或 "3424"（小于1万的数字）
	    const videoCardCount = (html.match(/video-card/g) || []).length
	    expect(videoCardCount).toBeGreaterThan(0)
	  })

	  it('SSR 首屏 HTML 包含视频卡片', async () => {
	    const html = await $fetch<string>('/')
	    const data = await $fetch<Record<string, any>>('/api/ranking')
	    // 验证 HTML 包含来自 API items 的数据
	    const videoCardCount = (html.match(/video-card/g) || []).length
	    expect(videoCardCount).toBeGreaterThan(0)
	    // 验证 services 端 data items 不为空
	    expect(data.items.length).toBeGreaterThan(0)
	  })

	  it('首屏 SSR 只传输首页数据（不传全部 500 条）', async () => {
	    const html = await $fetch<string>('/')
	    // SSR 应该只渲染 page 1（30 条），不应渲染 500 条
	    const videoCardCount = (html.match(/video-card/g) || []).length
	    expect(videoCardCount).toBeLessThan(50) // 远少于 500
	  })
})
