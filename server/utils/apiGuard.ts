/**
 * API Guard 核心校验逻辑（纯函数，不依赖 h3/Nitro）
 *
 * 供 server/middleware/api-guard.ts 调用，也可直接单元测试。
 */

/** 不需要校验的 API 路径（health check 等） */
export const API_GUARD_SKIP_PATHS = new Set(['/api/health'])

/** 从逗号分隔字符串解析为数组 */
export function parseAllowedOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 从 Referer 值中提取 origin 部分（仅协议+主机+端口） */
export function extractOriginFromReferer(referer: string): string | null {
  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

export interface GuardResult {
  allowed: boolean
  reason?: string
}

/** 判断 origin 是否为本地/局域网地址（仅开发环境使用） */
export function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.')
    )
  } catch {
    return false
  }
}

/**
 * 核心校验逻辑
 *
 * @param headers         - 请求头字典 { origin?, referer? }
 * @param path            - 请求路径
 * @param allowedOrigins  - 白名单 origin 列表
 * @param skipPaths       - 需要跳过的路径集合
 */
export function checkOrigin(
  headers: Record<string, string | undefined>,
  path: string,
  allowedOrigins: string[],
  skipPaths: Set<string> = API_GUARD_SKIP_PATHS,
): GuardResult {
  // 1. 非 API 路径 — 放行
  if (!path.startsWith('/api/')) {
    return { allowed: true }
  }

  // 2. 健康检查等特殊路径 — 放行
  if (skipPaths.has(path)) {
    return { allowed: true }
  }

  // 如果白名单为空，跳过校验（安全兜底：配置缺失时不断路）
  if (allowedOrigins.length === 0) {
    return { allowed: true }
  }

  const origin = headers['origin']
  const referer = headers['referer']

  // 3. 无 Origin 且无 Referer — SSR 内部调用，放行
  if (!origin && !referer) {
    return { allowed: true }
  }

  // 4. 检查 Origin
  if (origin && allowedOrigins.includes(origin)) {
    return { allowed: true }
  }

  // 5. 检查 Referer（降级兜底：部分环境没有 Origin）
  if (referer) {
    const refererOrigin = extractOriginFromReferer(referer)
    if (refererOrigin && allowedOrigins.includes(refererOrigin)) {
      return { allowed: true }
    }
  }

  return { allowed: false, reason: 'Blocked by API guard: origin not allowed' }
}
