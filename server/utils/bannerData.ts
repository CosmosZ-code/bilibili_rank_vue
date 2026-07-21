/**
 * Banner 数据加载与备用数据集
 *
 * - 构建时：scripts/build-banner-manifest.ts 扫描 public/assets/ 生成清单
 * - 运行时：读取构建时生成的清单，不足 5 套时用 CDN 备用数据补齐
 * - 兼容 Node.js 和 Cloudflare Workers 运行时（无 fs 依赖）
 */
import type { BannerDataSet, BannerLayerData } from '../../app/types'
import manifest from '../generated/banner-manifest'

// ============================================================
// 备用数据集 1 — 海洋生物-乌龟
// ============================================================

const fallbackSet1: BannerLayerData[] = [
  {
    src: 'https://pic.imgdb.cn/item/64d89f131ddac507ccdb7db2.webp',
    transform: [1, 0, 0, 1, 0, 0],
    width: 1950,
    a: 0.01,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f821ddac507ccdc71e4.webp',
    transform: [1, 0, 0, 1, -240, -5],
    width: 457.5,
    deg: -Math.PI / 60000,
    a: 0.035,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f561ddac507ccdc10d9.webp',
    transform: [1, 0, 0, 1, -300, 45],
    width: 157.5,
    deg: -Math.PI / 15000,
    a: 0.03,
    g: -0.02,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f811ddac507ccdc715c.webp',
    transform: [1, 0, 0, 1, -180, 0],
    width: 314.3,
    a: -0.035,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f7c1ddac507ccdc64c2.webp',
    transform: [1, 0, 0, 1, -300, 20],
    width: 571.2,
    deg: Math.PI / 40000,
    a: 0.05,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f7c1ddac507ccdc65e6.webp',
    transform: [1, 0, 0, 1, 100, 0],
    width: 1446,
    a: 0.01,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f7c1ddac507ccdc655c.webp',
    transform: [1, 0, 0, 1, 220, 0],
    width: 158.25,
    deg: Math.PI / 10000,
    a: 0.06,
    g: 0.045,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f7c1ddac507ccdc6536.webp',
    transform: [1, 0, 0, 1, -240, 0],
    width: 1721.3,
    a: 0.01,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f811ddac507ccdc7133.webp',
    transform: [1, 0, 0, 1, 320, 0],
    width: 642.96,
    a: 0.075,
    g: -0.025,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f7c1ddac507ccdc649b.webp',
    transform: [1, 0, 0, 1, 20, 0],
    blur: 1,
    width: 2131.5,
    a: 0.18,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f5c1ddac507ccdc1bbd.webp',
    transform: [1, 0, 0, 1, 400, 0],
    blur: 2.5,
    width: 299.52,
    deg: -Math.PI / 30000,
    a: 0.15,
    g: -0.02,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f571ddac507ccdc113d.webp',
    transform: [1, 0, 0, 1, 0, 10],
    width: 457.1,
    deg: Math.PI / 20000,
    f: 0.0001,
    a: 0.06,
    g: 0.01,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f561ddac507ccdc10aa.webp',
    transform: [1, 0, 0, 1, -150, 0],
    width: 419.2,
    opacity: [0.1, 1],
    a: -0.02,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f561ddac507ccdc1077.webp',
    transform: [1, 0, 0, 1, 40, 10],
    width: 816.9,
    blur: 1,
    a: 0.09,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f561ddac507ccdc102a.webp',
    transform: [1, 0, 0, 1, 20, 0],
    blur: 3,
    width: 1805.6,
    a: 0.3,
  },
  {
    src: 'https://pic.imgdb.cn/item/64d89f821ddac507ccdc71c6.webp',
    transform: [1, 0, 0, 1, 0, 0],
    width: 2400,
    a: 0.25,
  },
]

// ============================================================
// 备用数据集 2 — 大海之上-鳄鱼
// ============================================================

const fallbackSet2: BannerLayerData[] = [
  {
    width: 1916,
    height: 179,
    src: 'https://pic.imgdb.cn/item/64e08056661c6c8e540748c5.webp',
    transform: [1, 0, 0, 1, 0, 0],
    a: 0.01,
  },
  {
    width: 690,
    height: 56,
    src: 'https://pic.imgdb.cn/item/64e0808e661c6c8e5407fb3d.webp',
    transform: [1, 0, 0, 1, 95.8065, -19.1613],
    a: 0.02,
  },
  {
    width: 1360,
    height: 179,
    src: 'https://pic.imgdb.cn/item/64e083b8661c6c8e5411820c.webp',
    transform: [1, 0, 0, 1, 223.548, 9.58065],
    a: 0.015,
  },
  {
    width: 1781,
    height: 179,
    src: 'https://pic.imgdb.cn/item/64e083cf661c6c8e5411c5d2.webp',
    transform: [1, 0, 0, 1, -102.194, 6.3871],
    a: 0.02,
  },
  {
    width: 911,
    height: 141,
    src: 'https://pic.imgdb.cn/item/64e083e5661c6c8e541200a9.webp',
    transform: [1, 0, 0, 1, -127.742, 25.5484],
    a: 0.04,
    opacity: [1, 0],
  },
  {
    width: 911,
    height: 141,
    src: 'https://pic.imgdb.cn/item/64e08404661c6c8e541256f4.webp',
    transform: [1, 0, 0, 1, -127.742, 25.5484],
    a: 0.04,
    opacity: [0, 1],
  },
  {
    width: 84,
    height: 45,
    src: 'https://pic.imgdb.cn/item/64e0840d661c6c8e541271aa.webp',
    transform: [1, 0, 0, 1, -558.871, 37.2581],
    a: 0.02,
  },
  {
    width: 201,
    height: 103,
    src: 'https://pic.imgdb.cn/item/64e08416661c6c8e541289a1.webp',
    transform: [1, 0, 0, 1, -606.774, 44.7097],
    a: 0.1,
  },
  {
    width: 95,
    height: 34,
    src: 'https://pic.imgdb.cn/item/64e08421661c6c8e5412a883.webp',
    transform: [1, 0, 0, 1, 380.565, 76.1129],
    a: 0.07,
  },
  {
    width: 68,
    height: 40,
    src: 'https://pic.imgdb.cn/item/64e0842c661c6c8e5412c88f.webp',
    transform: [1, 0, 0, 1, 63.871, 0],
    a: 0.075,
    deg: -Math.PI / 40000,
    g: -0.0075,
  },
  {
    width: 304,
    height: 116,
    src: 'https://pic.imgdb.cn/item/64e08435661c6c8e5412e1ee.webp',
    transform: [1, 0, 0, 1, -127.742, 12.7742],
    a: 0.04,
  },
  {
    width: 259,
    height: 64,
    src: 'https://pic.imgdb.cn/item/64e0843c661c6c8e5412f5b4.webp',
    transform: [1, 0, 0, 1, -193.742, 41.5161],
    a: 0.04,
    deg: Math.PI / 40000,
  },
  {
    width: 1980,
    height: 221,
    src: 'https://pic.imgdb.cn/item/64e08445661c6c8e54130dee.webp',
    transform: [1, 0, 0, 1, -23.9516, -3.99194],
    a: 0.07,
  },
  {
    width: 196,
    height: 88,
    src: 'https://pic.imgdb.cn/item/64e0844c661c6c8e54132471.webp',
    transform: [1, 0, 0, 1, -268.258, -51.0968],
    a: 0.16,
  },
  {
    width: 2235,
    height: 209,
    src: 'https://pic.imgdb.cn/item/64e08455661c6c8e54133dda.webp',
    transform: [1, 0, 0, 1, 0, -14.9032],
    a: 0.16,
    blur: 3,
  },
]

// ============================================================
// Fallback 备用数据
// ============================================================

export function getFallbackBanners(): BannerDataSet[] {
  return [
    { name: '海洋生物 - 乌龟', data: fallbackSet1 },
    { name: '大海之上 - 鳄鱼', data: fallbackSet2 },
  ]
}

// ============================================================
// Banner 加载（构建时清单 + fallback 补齐）
// ============================================================

const MAX_BANNERS = 5

/**
 * 获取全部 Banner 数据集
 *
 * 优先使用构建时扫描生成的本地 Banner 数据，
 * 不足 5 套时用 CDN 备用数据补齐。
 */
export async function loadAllBanners(): Promise<BannerDataSet[]> {
  const banners: BannerDataSet[] = []

  // 1. 从构建时清单加载（按日期降序，取前 MAX_BANNERS 套）
  if (Array.isArray(manifest) && manifest.length > 0) {
    banners.push(...manifest.slice(0, MAX_BANNERS))
  }

  // 2. 不足 5 套时 fallback 补齐
  if (banners.length < MAX_BANNERS) {
    const fallback = getFallbackBanners()
    banners.push(...fallback.slice(0, MAX_BANNERS - banners.length))
  }

  return banners.length > 0 ? banners : getFallbackBanners()
}

/**
 * 清除 Banner 缓存
 *
 * Cloudflare Workers 环境下模块级变量不跨 isolate 共享，
 * 此函数保留用于接口兼容，实际不执行任何操作。
 */
export function clearBannerCache(): void {
  // 无需操作 — Banner 数据在构建时已打包，无运行时缓存
}
