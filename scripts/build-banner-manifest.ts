/**
 * 构建时脚本 — 扫描 public/assets/ 目录，生成 Banner 数据清单
 *
 * 在 npm run build 之前运行（通过 prebuild 脚本）。
 * 扫描所有 YYYY-MM-DD 格式目录，读取 data.json，
 * 规范化图层数据并修正资源路径，输出为 TypeScript 模块。
 *
 * 输出：server/generated/banner-manifest.ts
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ASSETS_DIR = join(ROOT, 'public', 'assets')
const OUTPUT_FILE = join(ROOT, 'server', 'generated', 'banner-manifest.ts')
const MAX_BANNERS = 5

// ============================================================
// 类型（与 app/types/index.ts 保持一致）
// ============================================================

interface BannerLayerData {
  src: string
  transform: number[]
  width: number
  height?: number
  a: number
  f?: number
  g?: number
  deg?: number
  opacity?: [number, number]
  blur?: number
  tagName?: 'img' | 'video'
}

interface BannerDataSet {
  name: string
  data: BannerLayerData[]
}

// ============================================================
// 工具函数
// ============================================================

/** 判断是否为日期目录（YYYY-MM-DD） */
function isDateDir(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name)
}

/**
 * 修正 Banner 图层的 src 路径
 *
 * data.json 中的 src 可能是：
 * - ./xxx.webp                 → 补全为 /assets/{dir}/xxx.webp
 * - ./assets/{dir}/xxx.webp    → 转为 /assets/{dir}/xxx.webp
 * - https://...                → 保持原样（CDN fallback）
 * - /assets/...                → 保持原样（已是绝对路径）
 */
function fixBannerSrc(src: string, dir: string): string {
  if (!src) return src
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) return src
  const cleaned = src.replace(/^\.\//, '')
  const filename = cleaned.replace(/^assets\/[^/]+\//, '')
  return `/assets/${dir}/${filename}`
}

/**
 * 规范化图层数据（grab.js 输出可能是字符串类型）
 */
function normalizeLayer(layer: Record<string, unknown>): BannerLayerData {
  const normalized = { ...layer } as Record<string, unknown>

  // opacity: ["0.7", "0.7"] → [0.7, 0.7]
  if (Array.isArray(normalized.opacity)) {
    normalized.opacity = (normalized.opacity as string[]).map(Number)
  }

  // transform 元素确保为 number
  if (Array.isArray(normalized.transform)) {
    normalized.transform = (normalized.transform as unknown[]).map(Number)
  }

  // 各数值字段强制转换
  for (const key of ['a', 'f', 'g', 'deg', 'blur', 'width', 'height']) {
    if (typeof normalized[key] === 'string') {
      normalized[key] = Number(normalized[key])
    }
  }

  return normalized as unknown as BannerLayerData
}

// ============================================================
// 主流程
// ============================================================

function main(): void {
  console.log('[build-banner-manifest] 扫描 public/assets/ 目录...')

  // 确保输出目录存在
  const outDir = dirname(OUTPUT_FILE)
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true })
  }

  // 扫描日期目录
  let dateDirs: string[] = []
  try {
    dateDirs = readdirSync(ASSETS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && isDateDir(e.name))
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a)) // 降序：最新在前
    console.log(`  找到 ${dateDirs.length} 个日期目录`)
  } catch {
    console.log('  public/assets/ 目录不存在，将只使用 CDN fallback 数据')
    writeEmptyManifest()
    return
  }

  // 读取每个目录的 data.json
  const banners: BannerDataSet[] = []

  for (const dir of dateDirs.slice(0, MAX_BANNERS)) {
    const jsonPath = join(ASSETS_DIR, dir, 'data.json')
    if (!existsSync(jsonPath)) {
      console.log(`  跳过 ${dir}（无 data.json）`)
      continue
    }

    try {
      const raw = readFileSync(jsonPath, 'utf-8')
      const layers = JSON.parse(raw)

      if (!Array.isArray(layers)) {
        console.log(`  跳过 ${dir}（data.json 格式异常）`)
        continue
      }

      const data = layers.map((layer: Record<string, unknown>) => {
        const normalized = normalizeLayer(layer)
        return { ...normalized, src: fixBannerSrc(normalized.src, dir) }
      })

      banners.push({ name: dir, data })
      console.log(`  ✓ ${dir}（${data.length} 个图层）`)
    } catch (err: any) {
      console.log(`  跳过 ${dir}（解析失败: ${err.message}）`)
    }
  }

  // 写入 TypeScript 文件
  const jsonContent = JSON.stringify(banners, null, 2)
  const tsContent = [
    '/**',
    ' * Banner 数据清单（构建时由 scripts/build-banner-manifest.ts 自动生成）',
    ` * 生成时间：${new Date().toISOString()}`,
    ` * 共 ${banners.length} 套 Banner`,
    ' *',
    ' * 此文件在每次构建时自动覆盖。请勿手动编辑。',
    ' */',
    "import type { BannerDataSet } from '../../app/types'",
    '',
    `const manifest: BannerDataSet[] = ${jsonContent}`,
    '',
    'export default manifest',
    '',
  ].join('\n')

  writeFileSync(OUTPUT_FILE, tsContent, 'utf-8')
  console.log(`\n  清单已写入：${OUTPUT_FILE}`)
  console.log(`  共 ${banners.length} 套 Banner（限制 ${MAX_BANNERS} 套）`)
}

function writeEmptyManifest(): void {
  const tsContent = [
    '/**',
    ' * Banner 数据清单',
    ' * 无本地数据，运行时将使用 CDN fallback',
    ' */',
    "import type { BannerDataSet } from '../../app/types'",
    '',
    'const manifest: BannerDataSet[] = []',
    '',
    'export default manifest',
    '',
  ].join('\n')

  writeFileSync(OUTPUT_FILE, tsContent, 'utf-8')
}

main()
