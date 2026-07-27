/**
 * Banner 数据同步 — 从 GitHub 仓库拉取最新 Banner
 *
 * 数据源: https://github.com/palxiao/bilibili-banner/tree/main/assets
 * 每 7 天由 banner-warmer 插件触发，对比远程目录与本地 Volume，
 * 下载本地不存在的日期目录。
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { isDateDir } from './bannerData'

const GITHUB_API_BASE = 'https://api.github.com/repos/palxiao/bilibili-banner/contents'
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/palxiao/bilibili-banner/main'

interface GitHubItem {
  name: string
  type: 'file' | 'dir'
  download_url: string | null
}

/**
 * 从 GitHub 同步本地不存在的 Banner 日期目录
 *
 * @param localDir - 本地 Volume 目录（如 /app/data/banners）
 * @returns 新同步的日期目录名列表
 */
export async function syncBannersFromGitHub(localDir: string): Promise<string[]> {
  // 请求头（可选 GitHub Token 提升限流：60 → 5000 req/h）
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'bilibili-rank-vue',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  // 1. 获取远程日期目录列表
  let remoteDirs: string[] = []
  try {
    const assetsListing = await $fetch<GitHubItem[]>(`${GITHUB_API_BASE}/assets`, { headers })
    remoteDirs = assetsListing
      .filter((item) => item.type === 'dir' && isDateDir(item.name))
      .map((item) => item.name)
  } catch (err) {
    console.warn('[banner-syncer] 获取远程目录列表失败:', (err as Error).message)
    return []
  }

  if (remoteDirs.length === 0) {
    console.log('[banner-syncer] 远程仓库无 Banner 目录')
    return []
  }

  // 2. 获取本地已有的日期目录
  let localDirs: string[] = []
  try {
    if (existsSync(localDir)) {
      localDirs = readdirSync(localDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && isDateDir(e.name))
        .map((e) => e.name)
    }
  } catch {
    // 目录不存在，从零开始
  }

  // 3. 找出本地缺失的目录
  const newDirs = remoteDirs.filter((d) => !localDirs.includes(d))
  if (newDirs.length === 0) {
    console.log('[banner-syncer] 本地已是最新，无需同步')
    return []
  }

  console.log(`[banner-syncer] 发现 ${newDirs.length} 个新 Banner 目录: ${newDirs.join(', ')}`)

  // 4. 下载每个新目录的全部文件
  const synced: string[] = []
  for (const dir of newDirs) {
    try {
      // 列出目录内的文件
      const files = await $fetch<GitHubItem[]>(`${GITHUB_API_BASE}/assets/${dir}`, { headers })
      const targetDir = join(localDir, dir)
      mkdirSync(targetDir, { recursive: true })

      let downloaded = 0
      for (const file of files) {
        if (file.type !== 'file' || !file.download_url) continue
        try {
          // raw.githubusercontent.com 不占用 API 限流配额
          const blob = await $fetch<ArrayBuffer>(file.download_url, {
            responseType: 'arrayBuffer',
          })
          writeFileSync(join(targetDir, file.name), Buffer.from(blob))
          downloaded++
        } catch (err) {
          console.warn(`[banner-syncer] 下载 ${dir}/${file.name} 失败:`, (err as Error).message)
        }
      }

      // 验证 data.json 是否存在（完整性检查）
      if (existsSync(join(targetDir, 'data.json'))) {
        synced.push(dir)
        console.log(`[banner-syncer] ✓ ${dir} (${downloaded} 个文件)`)
      } else {
        console.warn(`[banner-syncer] ✗ ${dir} 缺少 data.json，跳过`)
      }
    } catch (err) {
      console.warn(`[banner-syncer] 同步 ${dir} 失败:`, (err as Error).message)
    }
  }

  return synced
}

/**
 * 获取远程最新日期目录名（快速检查，不下载文件）
 */
export async function getLatestRemoteDir(): Promise<string | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'bilibili-rank-vue',
  }
  try {
    const assetsListing = await $fetch<GitHubItem[]>(`${GITHUB_API_BASE}/assets`, { headers })
    const dateDirs = assetsListing
      .filter((item) => item.type === 'dir' && isDateDir(item.name))
      .map((item) => item.name)
      .sort((a, b) => b.localeCompare(a))
    return dateDirs[0] || null
  } catch {
    return null
  }
}
