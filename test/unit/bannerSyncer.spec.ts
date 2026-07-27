/**
 * bannerSyncer.ts 单元测试
 *
 * 测试 GitHub Banner 同步逻辑：
 * - 远程目录列表解析与对比
 * - 新目录下载
 * - 错误处理与边界情况
 *
 * 遵循 bilibili-auth.spec.ts 的 mock 模式：
 * globalThis.$fetch mock + vi.resetModules() + freshImport()
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const mock$Fetch = vi.fn()

function setupGlobals() {
  ;(globalThis as any).$fetch = mock$Fetch
}

setupGlobals()

let mod: typeof import('../../server/utils/bannerSyncer')
let tmpDir: string

async function freshImport() {
  vi.resetModules()
  setupGlobals()
  mod = await import('../../server/utils/bannerSyncer')
}

beforeEach(async () => {
  tmpDir = join(tmpdir(), `bilibili-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
  await freshImport()
})

afterEach(() => {
  vi.clearAllMocks()
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
})

/** 构造一个 GitHub API 返回的目录条目 */
function dirEntry(name: string) {
  return { name, type: 'dir', download_url: null }
}

/** 构造一个 GitHub API 返回的文件条目 */
function fileEntry(name: string) {
  return {
    name,
    type: 'file',
    download_url: `https://raw.githubusercontent.com/palxiao/bilibili-banner/main/assets/test/${name}`,
  }
}

/** 在本地 tmpDir 下创建日期目录（模拟已有数据） */
function createLocalDateDir(date: string) {
  const dir = join(tmpDir, date)
  mkdirSync(dir, { recursive: true })
}

// ============================================================
// syncBannersFromGitHub
// ============================================================

describe('syncBannersFromGitHub', () => {
  it('发现新目录并下载完整内容', async () => {
    // 本地已有 2026-04-27
    createLocalDateDir('2026-04-27')

    // GitHub assets 列表：2 个日期目录
    mock$Fetch.mockResolvedValueOnce([
      dirEntry('2026-04-27'),
      dirEntry('2026-08-01'),
    ])

    // GitHub 2026-08-01 目录内容
    mock$Fetch.mockResolvedValueOnce([
      fileEntry('data.json'),
      fileEntry('layer1.webp'),
    ])

    // 下载 data.json
    mock$Fetch.mockResolvedValueOnce(
      Buffer.from(JSON.stringify([{ src: './test.webp', transform: [1, 0, 0, 1, 0, 0], width: 100, a: 0.01 }])),
    )
    // 下载 layer1.webp
    mock$Fetch.mockResolvedValueOnce(Buffer.from('fake-webp-data'))

    const result = await mod.syncBannersFromGitHub(tmpDir)

    expect(result).toEqual(['2026-08-01'])
    // 验证文件已写入
    const newDir = join(tmpDir, '2026-08-01')
    expect(existsSync(join(newDir, 'data.json'))).toBe(true)
    expect(existsSync(join(newDir, 'layer1.webp'))).toBe(true)
  })

  it('本地已最新时返回空数组', async () => {
    createLocalDateDir('2026-04-27')
    createLocalDateDir('2025-01-01')

    mock$Fetch.mockResolvedValueOnce([
      dirEntry('2026-04-27'),
      dirEntry('2025-01-01'),
    ])

    const result = await mod.syncBannersFromGitHub(tmpDir)

    expect(result).toEqual([])
    // 仅调用了列表接口，无下载调用
    expect(mock$Fetch).toHaveBeenCalledTimes(1)
  })

  it('GitHub API 列表失败时返回空数组不抛异常', async () => {
    mock$Fetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await mod.syncBannersFromGitHub(tmpDir)

    expect(result).toEqual([])
  })

  it('过滤掉 GitHub 返回的非日期条目', async () => {
    createLocalDateDir('2026-04-27')

    mock$Fetch.mockResolvedValueOnce([
      dirEntry('2026-04-27'),
      dirEntry('2026-08-01'),
      { name: 'README.md', type: 'file', download_url: null },
      { name: '.gitkeep', type: 'file', download_url: null },
    ])

    // 2026-08-01 目录内容（只有一个 data.json）
    mock$Fetch.mockResolvedValueOnce([fileEntry('data.json')])
    mock$Fetch.mockResolvedValueOnce(Buffer.from(JSON.stringify([])))

    const result = await mod.syncBannersFromGitHub(tmpDir)

    expect(result).toEqual(['2026-08-01'])
    // README.md 和 .gitkeep 不会被当作日期目录
  })

  it('GITHUB_TOKEN 存在时注入 Authorization 请求头', async () => {
    const originalToken = process.env.GITHUB_TOKEN
    process.env.GITHUB_TOKEN = 'test-token-123'

    // 远程只有 1 个目录，本地已存在 → 不触发下载
    createLocalDateDir('2026-04-27')
    mock$Fetch.mockResolvedValueOnce([dirEntry('2026-04-27')])

    try {
      await mod.syncBannersFromGitHub(tmpDir)

      // 验证请求头注入了 token
      const callArgs = mock$Fetch.mock.calls[0]
      expect(callArgs[1]).toMatchObject({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    } finally {
      if (originalToken === undefined) {
        delete process.env.GITHUB_TOKEN
      } else {
        process.env.GITHUB_TOKEN = originalToken
      }
    }
  })
})
