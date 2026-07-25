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

import { checkOrigin, parseAllowedOrigins, isLocalOrigin, extractOriginFromReferer } from '../utils/apiGuard'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const allowedOrigins = parseAllowedOrigins(config.apiGuard?.allowedOrigins ?? '')

  // 开发环境：放行本地/局域网来源
  if (process.env.NODE_ENV !== 'production') {
    const origin = getHeader(event, 'origin')
    if (origin && isLocalOrigin(origin)) {
      return
    }
    // 部分浏览器同源 GET 不发 Origin 只发 Referer
    const referer = getHeader(event, 'referer')
    if (referer) {
      const refererOrigin = extractOriginFromReferer(referer)
      if (refererOrigin && isLocalOrigin(refererOrigin)) {
        return
      }
    }
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
