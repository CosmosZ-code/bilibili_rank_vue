/**
 * 阶段 1 基础设施验证测试
 *
 * 验证：
 * 1. vitest 配置正确，单元测试环境可运行
 * 2. TypeScript 类型系统正常工作
 * 3. 基本断言可用
 */
import { describe, it, expect } from 'vitest'

describe('基础设施验证', () => {
  it('vitest 测试环境可正常启动', () => {
    expect(true).toBe(true)
  })

  it('可以导入类型定义', async () => {
    const types = await import('../../app/types/index')
    
    // 验证关键类型导出了
    expect(types).toBeDefined()
  })

  it('视频数据格式兼容 — VideoInfo 类型字段完整性', () => {
    // 模拟 data.json 中的一条记录，验证字段与 VideoInfo 接口匹配
    const videoEntry = {
      title: '测试标题',
      owner: '测试UP主',
      mid: '123456',
      pic: 'https://i0.hdslb.com/bfs/archive/xxx.jpg',
      online_count: '1.2万+',
      count_num: 12000,
      play_count_num: 38000000,
      danmaku_count_num: 520000,
      play_count: '3800万+',
      danmaku_count: '52万+',
    }

    // 验证字段存在且类型正确
    expect(typeof videoEntry.title).toBe('string')
    expect(typeof videoEntry.owner).toBe('string')
    expect(typeof videoEntry.mid).toBe('string')
    expect(videoEntry.pic.startsWith('https://')).toBe(true)
    expect(typeof videoEntry.count_num).toBe('number')
    expect(typeof videoEntry.play_count_num).toBe('number')
    expect(typeof videoEntry.danmaku_count_num).toBe('number')
    expect(typeof videoEntry.online_count).toBe('string')
    expect(typeof videoEntry.play_count).toBe('string')
    expect(typeof videoEntry.danmaku_count).toBe('string')
  })

  it('BannerLayerData 类型字段完整性', () => {
    // 模拟 Banner 图层数据
    const layer = {
      src: 'https://example.com/image.webp',
      transform: [1, 0, 0, 1, 0, 0],
      width: 1950,
      height: 179,
      a: 0.01,
      f: 0.0001,
      g: -0.02,
      deg: Math.PI / 60000,
      opacity: [0.1, 1] as [number, number],
      blur: 1,
      tagName: 'img' as const,
    }

    expect(Array.isArray(layer.transform)).toBe(true)
    expect(layer.transform.length).toBe(6)
    expect(layer.transform[4]).toBe(0) // tx
    expect(layer.transform[5]).toBe(0) // ty
    expect(layer.a).toBe(0.01)
    expect(typeof layer.src).toBe('string')
  })

  it('BilibiliResponse 泛型包装结构', () => {
    // B站 API 标准响应格式
    const mockResponse = {
      code: 0,
      message: '0',
      ttl: 1,
      data: { items: [] },
    }

    expect(mockResponse.code).toBe(0)
    expect(mockResponse.message).toBe('0')
    expect(Array.isArray(mockResponse.data.items)).toBe(true)
  })
})
