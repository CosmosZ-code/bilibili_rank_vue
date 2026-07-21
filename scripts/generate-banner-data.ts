/**
 * 从现有图片/视频文件生成 data.json
 *
 * 当 data.json 丢失时（grab.js 本地生成未提交），
 * 用此脚本为每个日期目录生成基础图层配置。
 *
 * 排序策略：
 * - 文件大小降序（大图 → 远景/背景，小图 → 近景/前景）
 * - 视频文件（UUID 无后缀）放在最后（通常是前景动画层）
 *
 * 用法: npx tsx scripts/generate-banner-data.ts
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ASSETS_DIR = path.resolve(__dirname, '../public/assets')

interface BannerLayerData {
  src: string
  transform: number[]
  width: number
  height?: number
  a: number
  tagName?: 'img' | 'video'
  deg?: number
  opacity?: [number, number]
  blur?: number
  f?: number
  g?: number
}

/** 判断是否为视频文件（UUID 格式，无扩展名） */
function isVideoFile(filename: string): boolean {
  // UUID 格式: 8-4-4-4-12，无扩展名
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filename)
}

/** 判断是否为日期目录名 */
function isDateDir(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name)
}

/**
 * 获取图片文件的原始尺寸
 * 通过读取 WebP 文件头部获取宽高
 */
function getWebPDimensions(filePath: string): { width: number; height: number } | null {
  try {
    const buf = fs.readFileSync(filePath)
    // WebP 文件头部: RIFF .... WEBP
    if (buf.length < 30) return null
    if (buf.toString('ascii', 0, 4) !== 'RIFF') return null
    if (buf.toString('ascii', 8, 12) !== 'WEBP') return null

    // VP8X 格式（扩展格式）：宽度在 24-26 字节，高度在 27-29 字节
    const format = buf.toString('ascii', 12, 16)
    if (format === 'VP8X' && buf.length >= 30) {
      // VP8X: width 和 height 是 24-bit little-endian + 1
      const width = (buf.readUIntLE(24, 3) & 0xffffff) + 1
      const height = (buf.readUIntLE(27, 3) & 0xffffff) + 1
      return { width, height }
    }

    // VP8L 格式（无损）：宽度在 21-22 字节（14-bit），高度在 23-24 字节
    if (format === 'VP8L' && buf.length >= 25) {
      const bits = buf.readUInt32LE(21)
      const width = (bits & 0x3fff) + 1
      const height = ((bits >> 14) & 0x3fff) + 1
      return { width, height }
    }

    // VP8 格式（有损）：宽度在 26-27 字节，高度在 28-29 字节
    if (format === 'VP8 ' && buf.length >= 30) {
      const width = buf.readUInt16LE(26) & 0x3fff
      const height = buf.readUInt16LE(28) & 0x3fff
      return { width, height }
    }

    return null
  } catch {
    return null
  }
}

function generateDataJson(dirPath: string, dateDir: string): BannerLayerData[] {
  const files = fs.readdirSync(dirPath)

  // 分离图片和视频
  const imageFiles: { name: string; size: number }[] = []
  const videoFiles: string[] = []

  for (const file of files) {
    if (file === 'data.json') continue
    const filePath = path.join(dirPath, file)
    const stat = fs.statSync(filePath)
    if (stat.isFile()) {
      if (isVideoFile(file)) {
        videoFiles.push(file)
      } else if (/\.(webp|png|jpg|jpeg)$/i.test(file)) {
        imageFiles.push({ name: file, size: stat.size })
      }
    }
  }

  // 图片按文件大小降序排列（大的在底层）
  imageFiles.sort((a, b) => b.size - a.size)

  const layers: BannerLayerData[] = []
  const totalLayers = imageFiles.length + videoFiles.length
  const imageCount = imageFiles.length

  // 生成图片图层
  for (let i = 0; i < imageFiles.length; i++) {
    const dims = getWebPDimensions(path.join(dirPath, imageFiles[i].name))
    const depthRatio = imageCount > 1 ? i / (imageCount - 1) : 0

    layers.push({
      src: `./${imageFiles[i].name}`,
      transform: [1, 0, 0, 1, 0, 0],
      width: dims?.width || 1950,
      height: dims?.height || undefined,
      // 深层（背景）移动小，浅层（前景）移动大
      a: 0.01 + depthRatio * 0.08,
      // 透视图层交替微旋转
      deg: i % 3 === 1 ? Math.PI / 60000 : i % 3 === 2 ? -Math.PI / 60000 : undefined,
    })
  }

  // 生成视频图层（放在最前面）
  for (const videoFile of videoFiles) {
    layers.push({
      src: `./${videoFile}`,
      transform: [1, 0, 0, 1, 0, 0],
      width: 1950,
      a: 0.05,
      tagName: 'video',
      opacity: [0.3, 1],
    })
  }

  return layers
}

function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.error('public/assets/ 目录不存在')
    process.exit(1)
  }

  const entries = fs.readdirSync(ASSETS_DIR, { withFileTypes: true })
  const dateDirs = entries
    .filter((e) => e.isDirectory() && isDateDir(e.name))
    .map((e) => e.name)
    .sort()

  if (dateDirs.length === 0) {
    console.log('没有找到日期目录，无需生成')
    return
  }

  let generated = 0
  let skipped = 0

  for (const dir of dateDirs) {
    const dirPath = path.join(ASSETS_DIR, dir)
    const dataJsonPath = path.join(dirPath, 'data.json')

    if (fs.existsSync(dataJsonPath)) {
      skipped++
      continue
    }

    const layers = generateDataJson(dirPath, dir)
    if (layers.length === 0) {
      console.log(`  ${dir}: 无图层文件，跳过`)
      continue
    }

    fs.writeFileSync(dataJsonPath, JSON.stringify(layers, null, 2), 'utf-8')
    console.log(`  ${dir}: ${layers.length} 层 (${layers.filter((l) => l.tagName === 'video').length} 视频)`)
    generated++
  }

  console.log(`\n生成 ${generated} 套，跳过 ${skipped} 套（已存在）`)
}

main()
