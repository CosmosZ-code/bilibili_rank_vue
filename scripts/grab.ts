/**
 * Banner 抓取脚本 — 从 B站首页抓取当前 Banner 图层数据
 *
 * 用法: npx tsx scripts/grab.ts
 *
 * 流程:
 * 1. 创建 public/assets/{今天日期}/ 目录
 * 2. Puppeteer 抓取 .animated-banner 图层
 * 3. 模拟鼠标偏移 → 计算加速系数 a
 * 4. 写入 data.json
 * 5. 文件夹级去重：与已有 data.json 比对，图层完全一致则跳过
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ASSETS_DIR = path.resolve(__dirname, '../public/assets')

// ============================================================
// 工具函数
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 生成今天的日期字符串 */
function todayStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 判断是否为日期目录 */
function isDateDir(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name)
}

/** 递归删除目录 */
function rimraf(dir: string): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      rimraf(full)
    } else {
      fs.unlinkSync(full)
    }
  }
  fs.rmdirSync(dir)
}

// ============================================================
// 文件夹级去重
// ============================================================

/**
 * 读取已有 Banner 的 data.json，提取指纹信息
 * 指纹 = 图层数量 + 每层的文件大小 + tagName 序列
 */
function getBannerFingerprint(dateDir: string): string | null {
  const jsonPath = path.join(ASSETS_DIR, dateDir, 'data.json')
  if (!fs.existsSync(jsonPath)) return null

  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8')
    const layers = JSON.parse(raw) as any[]

    const parts: string[] = [`layers:${layers.length}`]
    for (const layer of layers) {
      const tagName = layer.tagName || 'img'
      // 获取文件大小
      let size = 0
      try {
        // src 格式如 "./xxx.webp"、"./xxx" 或 "./assets/{date}/xxx.webp"（历史数据）
        const srcFile = String(layer.src || '').replace(/^\.\//, '')
        // 去掉可能存在的 assets/{date}/ 前缀（兼容历史数据格式）
        const filename = srcFile.replace(/^assets\/[^/]+\//, '')
        const filePath = path.join(ASSETS_DIR, dateDir, filename)
        if (fs.existsSync(filePath)) {
          size = fs.statSync(filePath).size
        }
      } catch { /* ignore */ }
      parts.push(`${tagName}:${size}`)
    }
    return parts.join('|')
  } catch {
    return null
  }
}

/**
 * 检查是否与已有 Banner 重复
 * 返回重复的日期目录名，或 null（不重复）
 */
function findDuplicate(fingerprint: string): string | null {
  if (!fs.existsSync(ASSETS_DIR)) return null

  for (const entry of fs.readdirSync(ASSETS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isDateDir(entry.name)) continue

    const existing = getBannerFingerprint(entry.name)
    if (existing && existing === fingerprint) {
      return entry.name
    }
  }
  return null
}

// ============================================================
// 主抓取流程
// ============================================================

async function main() {
  const date = todayStr()
  const saveDir = path.join(ASSETS_DIR, date)

  console.log(`[grab] 目标日期: ${date}`)
  console.log(`[grab] 输出目录: ${saveDir}`)

  // 创建输出目录
  if (fs.existsSync(saveDir)) {
    // 清空已有内容（可能上次抓取失败残留）
    for (const file of fs.readdirSync(saveDir)) {
      fs.unlinkSync(path.join(saveDir, file))
    }
  } else {
    fs.mkdirSync(saveDir, { recursive: true })
  }

  const layers: any[] = []

  console.log('[grab] 启动浏览器...')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1650, height: 800 })

    console.log('[grab] 访问 B站首页...')
    await page.goto('https://www.bilibili.com/', {
      waitUntil: 'domcontentloaded',
    })

    await page.waitForSelector('.animated-banner', { timeout: 15000 })
    await sleep(3000)

    // 第一遍：获取图层结构和下载资源
    let layerElements = await page.$$('.animated-banner .layer')
    console.log(`[grab] 检测到 ${layerElements.length} 个图层`)

    if (layerElements.length === 0) {
      console.log('[grab] 未检测到图层（B站可能未展示动态 Banner），退出')
      rimraf(saveDir)
      return
    }

    for (let i = 0; i < layerElements.length; i++) {
      const info = await page.evaluate((el) => {
        const child = el.firstElementChild as HTMLElement
        if (!child) return null

        const style = child.style || (window.getComputedStyle ? window.getComputedStyle(child) : null)
        const transform = style?.transform || ''
        const pattern = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/
        const match = transform.match(pattern)

        return {
          tagName: child.tagName.toLowerCase(),
          opacity: [(style as any)?.opacity || '1', (style as any)?.opacity || '1'],
          transform: match
            ? [1, 0, 0, 1, ...match.slice(1).map((x) => +x.replace('px', ''))]
            : [1, 0, 0, 1, 0, 0],
          width: (child as any)?.width || 1950,
          height: (child as any)?.height || undefined,
          src: (child as HTMLImageElement)?.src || (child as HTMLVideoElement)?.src || '',
          a: 0.01,
        }
      }, layerElements[i])

      if (!info) continue

      // 下载文件
      const fileArr = info.src.split('/')
      const fileName = fileArr[fileArr.length - 1] || `layer_${i}`
      const filePath = path.join(saveDir, fileName)

      try {
        const content = await page.evaluate(async (url) => {
          const response = await fetch(url)
          const buffer = await response.arrayBuffer()
          return Array.from(new Uint8Array(buffer))
        }, info.src)

        fs.writeFileSync(filePath, Buffer.from(content))
      } catch (err: any) {
        console.warn(`[grab] 图层 ${i} 下载失败: ${err.message}`)
        continue
      }

      layers.push({ ...info, src: `./${fileName}` })
      console.log(`[grab] 图层 ${i + 1}/${layerElements.length}: ${fileName}`)
    }

    // 第二遍：模拟鼠标移动计算加速度
    console.log('[grab] 模拟鼠标偏移...')
    const banner = await page.$('.animated-banner')
    if (banner) {
      const box = await banner.boundingBox()
      if (box) {
        await page.mouse.move(box.x, box.y + 50)
        await page.mouse.move(box.x + 1000, box.y, { steps: 1 })
        await sleep(1200)

        layerElements = await page.$$('.animated-banner .layer')
        for (let i = 0; i < Math.min(layers.length, layerElements.length); i++) {
          const skew = await page.evaluate((el) => {
            const child = el.firstElementChild as HTMLElement
            const style = child?.style || {}
            const transform = style.transform || ''
            const pattern = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/
            const match = transform.match(pattern)
            return match ? +match[1].replace('px', '') : 0
          }, layerElements[i])

          layers[i].a = (skew - layers[i].transform[4]) / 1000
        }
      }
    }

    // 写入 data.json
    const dataJsonPath = path.join(saveDir, 'data.json')
    fs.writeFileSync(dataJsonPath, JSON.stringify(layers, null, 2), 'utf-8')
    console.log(`[grab] 已写入 ${dataJsonPath}`)

    // 文件夹级去重
    console.log('[grab] 检查是否与已有 Banner 重复...')
    const fingerprint = getBannerFingerprint(date)
    if (fingerprint) {
      const duplicate = findDuplicate(fingerprint)
      if (duplicate && duplicate !== date) {
        console.log(`[grab] ⚠ 与 ${duplicate} 完全重复，删除本次抓取`)
        rimraf(saveDir)
        console.log(`[grab] 已跳过（与 ${duplicate} 相同）`)
        return
      }
    }

    console.log(`[grab] ✅ 新增 Banner：${date}（${layers.length} 层）`)
  } catch (err: any) {
    console.error(`[grab] 抓取失败: ${err.message}`)
    // 清理失败的目录
    if (fs.existsSync(saveDir) && fs.readdirSync(saveDir).length === 0) {
      rimraf(saveDir)
    }
  } finally {
    await browser.close()
    console.log('[grab] 完成')
  }
}

main()
