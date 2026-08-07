/**
 * E2E 共享服务器 globalSetup
 *
 * 所有 e2e 测试文件共用一个 Nitro 实例：
 * - 直接启动预构建的 .output（不在此处构建——nuxi 构建会破坏 vitest 主进程
 *   stdout，导致控制台 reporter 输出丢失；构建由 `npm run test:e2e` 前置完成）
 * - exposeContextToEnv() 把服务器 URL 序列化进 NUXT_TEST_CONTEXT 环境变量，
 *   各测试 worker 通过 recoverContextFromEnv 自动恢复，无需再调用 setup()
 * - 等待 cache-warmer 首次预热完成，保证依赖真实数据的测试有稳定前置条件
 *
 * 收益：消除原先「每文件一个服务器」的并行请求洪峰（14 实例同时向 B站 预热
 * 会触发风控），构建也只执行一次。
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createTest,
  exposeContextToEnv,
  useTestContext,
  startServer,
  stopServer,
} from '@nuxt/test-utils/e2e'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))

const hooks = createTest({
  rootDir,
  fixture: false, // 不加载 Nuxt 配置/不构建（直接使用预构建的 .output）
  build: false,
  server: true,
  browser: false,
  nuxtConfig: {
    nitro: {
      output: {
        dir: resolve(rootDir, '.output'),
      },
    },
  },
  env: {
    // 共享服务器以 3s 间隔刷新（cache-warmer e2e 测试依赖快速刷新验证定时逻辑）
    NUXT_CACHE_WARMER_REFRESH_INTERVAL_MS: '3000',
  },
})

/** 等待 cache-warmer 首次预热完成（排行榜 + 直播数据均就绪，或超时），最多 120s */
async function waitForWarmup(): Promise<void> {
  const ctx = useTestContext()
  const baseURL = ctx.url // 以 / 结尾
  const deadline = Date.now() + 120_000
  let lastRanking = 0
  let lastLive = 0

  while (Date.now() < deadline) {
    let rankingReady = false
    let liveReady = false

    try {
      const res = await fetch(`${baseURL}api/ranking`)
      const body = (await res.json()) as { items?: unknown[] }
      lastRanking = body.items?.length ?? 0
      rankingReady = lastRanking > 0
    } catch {
      // 服务器/请求未就绪，继续轮询
    }

    try {
      const res = await fetch(`${baseURL}api/live-rooms`)
      const body = (await res.json()) as { items?: unknown[] }
      lastLive = body.items?.length ?? 0
      liveReady = lastLive > 0
    } catch {
      // 直播缓存未就绪（预热较慢），继续轮询
    }

    if (rankingReady && liveReady) {
      console.log(`[e2e] cache-warmer 预热完成（排行 ${lastRanking} 条 / 直播 ${lastLive} 条）`)
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  console.warn(
    `[e2e] cache-warmer 预热超时（排行 ${lastRanking} 条 / 直播 ${lastLive} 条，B站 可能风控），测试将基于现有缓存运行`,
  )
}

export async function setup(): Promise<void> {
  await startServer() // 启动预构建的共享服务器（一次）
  exposeContextToEnv() // 广播 URL 到 NUXT_TEST_CONTEXT，供各 worker 恢复
  await waitForWarmup()
}

export async function teardown(): Promise<void> {
  await stopServer()
}
