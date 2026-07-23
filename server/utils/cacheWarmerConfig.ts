/**
 * 缓存预热器配置工具
 *
 * 纯函数，不依赖 Nitro 运行时，可单元测试。
 */

/** 默认刷新间隔：4 分钟 */
export const DEFAULT_REFRESH_INTERVAL_MS = 4 * 60 * 1000

/** 退避延迟序列（毫秒）：30s → 60s → 120s → 240s（封顶） */
const BACKOFF_SEQUENCE = [30_000, 60_000, 120_000, 240_000]

/**
 * 从环境变量值解析刷新间隔
 *
 * 非法、零、负值均回退到默认值。
 */
export function resolveRefreshInterval(envValue: string | undefined, defaultMs: number): number {
  if (envValue === undefined) return defaultMs

  const parsed = Number(envValue)
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultMs

  return parsed
}

/**
 * 根据连续失败次数计算退避延迟
 *
 * 序列：0→30s, 1→60s, 2→120s, 3+→240s（封顶）
 *
 * @param consecutiveFailures - 连续失败次数（>= 0）
 * @param maxDelay - 封顶延迟，默认 DEFAULT_REFRESH_INTERVAL_MS
 * @returns 下次重试应等待的毫秒数
 * @throws 当 consecutiveFailures < 0 时抛出
 */
export function calculateBackoffDelay(
  consecutiveFailures: number,
  maxDelay: number = DEFAULT_REFRESH_INTERVAL_MS,
): number {
  if (consecutiveFailures < 0) {
    throw new Error(`consecutiveFailures 不能为负数，当前值: ${consecutiveFailures}`)
  }

  const index = Math.min(consecutiveFailures, BACKOFF_SEQUENCE.length - 1)
  const delay = BACKOFF_SEQUENCE[index]

  return Math.min(delay, maxDelay)
}
