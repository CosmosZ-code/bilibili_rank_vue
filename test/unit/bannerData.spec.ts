/**
 * bannerData.ts 单元测试
 *
 * 测试 Banner 数据处理：
 * - getFallbackBanners() 备用数据集完整性
 * - isDateDir() 日期目录名判断
 * - loadAllBanners() 目录扫描与加载
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getFallbackBanners, isDateDir, loadAllBanners } from '../../server/utils/bannerData'

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

// ============================================================
// isDateDir
// ============================================================

describe('isDateDir', () => {
  it('标准日期格式 YYYY-MM-DD 通过', () => {
    expect(isDateDir('2026-04-27')).toBe(true)
  })

  it('月份缺少补零不通过', () => {
    expect(isDateDir('2026-4-27')).toBe(false)
  })

  it('无分隔符不通过', () => {
    expect(isDateDir('20260427')).toBe(false)
  })

  it('非日期文本不通过', () => {
    expect(isDateDir('abc')).toBe(false)
  })

  it('空字符串不通过', () => {
    expect(isDateDir('')).toBe(false)
  })
})

// ============================================================
// loadAllBanners
// ============================================================

/** 创建最小有效的 data.json（2 个图层的数组） */
function makeDataJson(): string {
  return JSON.stringify([
    { tagName: 'img', opacity: ['1', '1'], transform: [1, 0, 0, 1, 0, 0], width: 100, a: 0.01, src: './test.png' },
    { tagName: 'img', opacity: ['0.7', '0.7'], transform: [1, 0, 0, 1, 50, 0], width: 200, a: '0.05', src: './test2.webp' },
  ])
}

describe('loadAllBanners', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `bilibili-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  })

  function createDateDir(date: string, dataJson?: string): void {
    const dir = join(tmpDir, date)
    mkdirSync(dir, { recursive: true })
    if (dataJson !== undefined) {
      writeFileSync(join(dir, 'data.json'), dataJson, 'utf-8')
    }
  }

  it('正常扫描并按日期降序排列', async () => {
    createDateDir('2023-08-21', makeDataJson())
    createDateDir('2026-04-27', makeDataJson())
    createDateDir('2024-06-06', makeDataJson())

    const result = await loadAllBanners(tmpDir)

    // 3 套本地 + 2 套 fallback 补齐到 5
    expect(result.length).toBe(5)
    // 降序：最新在前
    expect(result[0].name).toBe('2026-04-27')
    expect(result[1].name).toBe('2024-06-06')
    expect(result[2].name).toBe('2023-08-21')
    // 后 2 套是 fallback
    expect(/[\u4e00-\u9fff]/.test(result[3].name)).toBe(true)
    expect(/[\u4e00-\u9fff]/.test(result[4].name)).toBe(true)
  })

  it('超过 5 套时截断只取最新 5 套', async () => {
    for (const d of ['2023-01-01', '2023-06-15', '2024-02-01', '2024-08-15', '2025-01-01', '2025-07-01', '2026-04-27']) {
      createDateDir(d, makeDataJson())
    }

    const result = await loadAllBanners(tmpDir)

    // 7 套本地 → 只取最新 5 套，不需要 fallback
    expect(result.length).toBe(5)
    expect(result[0].name).toBe('2026-04-27')
    expect(result[1].name).toBe('2025-07-01')
    expect(result[4].name).toBe('2024-02-01')
    // 2023-06-15 和 2023-01-01 被截断
  })

  it('不足 5 套时用 fallback 补齐', async () => {
    createDateDir('2026-04-27', makeDataJson())
    createDateDir('2025-01-01', makeDataJson())

    const result = await loadAllBanners(tmpDir)

    // 2 本地 + fallback（getFallbackBanners 返回 2 套，补到 5 只需 2 套）
    expect(result.length).toBe(4)
    expect(result[0].name).toBe('2026-04-27')
    expect(result[1].name).toBe('2025-01-01')
    // 后 2 套是 fallback（中文名）
    expect(/[\u4e00-\u9fff]/.test(result[2].name)).toBe(true)
    expect(/[\u4e00-\u9fff]/.test(result[3].name)).toBe(true)
  })

  it('缺少 data.json 的目录被跳过', async () => {
    createDateDir('2026-04-27', makeDataJson())
    createDateDir('2025-06-15') // 无 data.json
    createDateDir('2024-01-01', makeDataJson())

    const result = await loadAllBanners(tmpDir)

    // 只有 2 套有效，补 fallback
    const localNames = result.map((b) => b.name).filter((n) => !n.includes(' '))
    expect(localNames).toEqual(['2026-04-27', '2024-01-01'])
  })

  it('data.json 非法 JSON 时跳过该目录', async () => {
    createDateDir('2026-04-27', makeDataJson())
    createDateDir('2025-01-01', 'not-valid-json')

    const result = await loadAllBanners(tmpDir)

    const localNames = result.map((b) => b.name).filter((n) => !n.includes(' '))
    expect(localNames).toEqual(['2026-04-27'])
  })

  it('传入不存在的目录时回退到项目内置 assets', async () => {
    // tmpDir 下的 nonexistent 不存在 → 回退到 public/assets/（开发环境）或 .output/public/assets/
    const result = await loadAllBanners(join(tmpDir, 'nonexistent'))

    // 项目内置 assets 至少有 2 套（实际有 15 套），取最新 5 套
    expect(result.length).toBe(5)
    // 第一套应为内置最新日期
    expect(isDateDir(result[0].name)).toBe(true)
  })
})
