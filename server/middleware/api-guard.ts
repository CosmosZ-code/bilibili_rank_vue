/**
 * API 防护中间件
 *
 * 校验 Origin / Referer 头，阻止外部来源直接调用 /api/* 路由。
 *
 * 放行规则（按优先级）：
 * 1. 非 /api/ 路径          → 放行（普通页面请求）
 * 2. /api/health            → 放行（Docker health check）
 * 3. 无 Origin 且无 Referer  → 放行（SSR 内部调用、curl、监控探针）
 * 4. Origin 匹配白名单       → 放行
 * 5. Referer origin 匹配白名单 → 放行（降级兜底）
 * 6. 以上都不满足            → 403 Forbidden
 */

import { checkOrigin, parseAllowedOrigins } from '../utils/apiGuard'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const allowedOrigins = parseAllowedOrigins(config.apiGuard?.allowedOrigins ?? '')

  // 开发环境自动追加本地白名单（127.0.0.1 用于 SSR 内部抓取）
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push(
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
    )
  }

  const headers: Record<string, string | undefined> = {
    origin: getHeader(event, 'origin'),
    referer: getHeader(event, 'referer'),
  }

  const result = checkOrigin(headers, event.path, allowedOrigins)

  if (!result.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: result.reason,
    })
  }
})
