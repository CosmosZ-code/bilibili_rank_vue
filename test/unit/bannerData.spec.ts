/**
 * bannerData.ts 单元测试
 *
 * 测试 Banner 备用数据集：
 * - getFallbackBanners() 返回非空数组
 * - 备用数据集完整性（layer 字段验证）
 * - Banner 数据结构一致性
 */
import { describe, it, expect } from 'vitest'
import { getFallbackBanners } from '../../server/utils/bannerData'

describe('getFallbackBanners', () => {
  it('返回非空数组', () => {
    const banners = getFallbackBanners()
    expect(banners).toBeDefined()
    expect(Array.isArray(banners)).toBe(true)
    expect(banners.length).toBeGreaterThan(0)
  })

  it('每个 Banner 有 name 和 data', () => {
    const banners = getFallbackBanners()
    for (const banner of banners) {
      expect(typeof banner.name).toBe('string')
      expect(banner.name.length).toBeGreaterThan(0)
      expect(Array.isArray(banner.data)).toBe(true)
    }
  })

  it('每个 Banner 至少包含 10 个图层', () => {
    const banners = getFallbackBanners()
    for (const banner of banners) {
      expect(banner.data.length).toBeGreaterThanOrEqual(10)
    }
  })

  it('每个图层包含必需的字段：src, transform, width, a', () => {
    const banners = getFallbackBanners()
    for (const banner of banners) {
      for (const layer of banner.data) {
        // 必需字段
        expect(typeof layer.src).toBe('string')
        expect(layer.src.length).toBeGreaterThan(0)

        expect(Array.isArray(layer.transform)).toBe(true)
        expect(layer.transform.length).toBe(6) // [a, b, c, d, tx, ty]

        expect(typeof layer.width).toBe('number')
        expect(layer.width).toBeGreaterThan(0)

        expect(typeof layer.a).toBe('number')
      }
    }
  })

  it('transform 数组格式正确 — [a, b, c, d, tx, ty]', () => {
    const banners = getFallbackBanners()
    for (const banner of banners) {
      for (const layer of banner.data) {
        const t = layer.transform
        // a, b, c, d 通常是 1, 0, 0, 1（单位矩阵）
        expect(typeof t[0]).toBe('number') // a
        expect(typeof t[1]).toBe('number') // b
        expect(typeof t[2]).toBe('number') // c
        expect(typeof t[3]).toBe('number') // d
        expect(typeof t[4]).toBe('number') // tx (translateX)
        expect(typeof t[5]).toBe('number') // ty (translateY)
      }
    }
  })

  it('可选字段格式正确（如果存在）', () => {
    const banners = getFallbackBanners()
    for (const banner of banners) {
      for (const layer of banner.data) {
        // 可选字段
        if (layer.height !== undefined) {
          expect(typeof layer.height).toBe('number')
          expect(layer.height).toBeGreaterThan(0)
        }

        if (layer.blur !== undefined) {
          expect(typeof layer.blur).toBe('number')
        }

        if (layer.deg !== undefined) {
          expect(typeof layer.deg).toBe('number')
        }

        if (layer.f !== undefined) {
          expect(typeof layer.f).toBe('number')
        }

        if (layer.g !== undefined) {
          expect(typeof layer.g).toBe('number')
        }

        if (layer.opacity !== undefined) {
          expect(Array.isArray(layer.opacity)).toBe(true)
          expect(layer.opacity.length).toBe(2)
          expect(typeof layer.opacity[0]).toBe('number')
          expect(typeof layer.opacity[1]).toBe('number')
        }

        if (layer.tagName !== undefined) {
          expect(['img', 'video']).toContain(layer.tagName)
        }
      }
    }
  })

  it('备用数据集包含预期的 2 个 Banner', () => {
    const banners = getFallbackBanners()
    // 备用数据集有 2 个 Banner
    expect(banners.length).toBe(2)
  })

  it('Banner 名称不为空且为中文', () => {
    const banners = getFallbackBanners()
    for (const banner of banners) {
      // 至少包含中文字符
      expect(/[\u4e00-\u9fff]/.test(banner.name)).toBe(true)
    }
  })
})
