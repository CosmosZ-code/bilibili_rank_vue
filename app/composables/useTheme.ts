/**
 * useTheme — 日间/夜间/跟随系统 三态主题
 *
 * 持久化：cookie（theme_mode），SSR 可读 → 首屏无闪烁；
 * 生效方式：app.vue 中 useHead 把 resolvedTheme 绑定到 <html data-theme>，
 * 内联首帧脚本（head 内）在水合前修正 auto 模式的系统偏好。
 *
 * 模块级单例（懒初始化，避免纯 Node 单元测试环境加载 Nuxt 依赖）。
 */

export type ThemeMode = 'light' | 'dark' | 'auto'

import { onMqChange } from '../utils/mq'

// ============================================================
// 纯函数（导出供单元测试）
// ============================================================

/** 三态循环顺序：light → dark → auto → light */
export function nextTheme(mode: ThemeMode): ThemeMode {
  if (mode === 'light') return 'dark'
  if (mode === 'dark') return 'auto'
  return 'light'
}

/** 校验主题模式：非法值回退 auto（内联脚本解析 cookie 时复用） */
export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'auto'
}

/**
 * 从 Node req（含 unenv 模拟对象）的 rawHeaders 解析指定 cookie。
 * 背景：unenv 模拟 req 的 `headers` getter 在某些运行时返回空（rawHeaders 有值），
 * 导致 useCookie / useRequestHeaders 在 SSR 读不到 cookie，这里手动解析兜底。
 */
export function readCookieFromRawHeaders(
  req: { rawHeaders?: string[] } | null | undefined,
  name: string,
): string | null {
  const raw = req?.rawHeaders
  if (!raw || raw.length < 2) return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (let i = 0; i < raw.length - 1; i += 2) {
    if (raw[i].toLowerCase() !== 'cookie') continue
    const m = raw[i + 1].match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`))
    if (!m) return null
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }
  return null
}

/** 解析实际生效主题：auto 按系统偏好（prefersDark 为 null 表示无法获取，回退 light） */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean | null = null): 'light' | 'dark' {
  if (mode !== 'auto') return mode
  return prefersDark ? 'dark' : 'light'
}

// ============================================================
// Composable（模块级单例）
// ============================================================

let _theme: Ref<ThemeMode> | null = null
let _systemPrefersDark: Ref<boolean> | null = null
let initialized = false

export function useTheme() {
  // SSR：每次请求从 rawHeaders 解析 cookie（ref 而非 useCookie——unenv 的
  // headers getter 在某些运行时返回空，useCookie 读不到；且服务器进程跨请求
  // 共享模块状态，也不能缓存单例）。SSR 端从不修改主题，无需写回 cookie。
  // 客户端：浏览器 cookie 全局共享，模块级单例可安全缓存。
  const theme = import.meta.server
    ? ref<ThemeMode>(normalizeThemeMode(readCookieFromRawHeaders(useRequestEvent()?.node?.req, 'theme_mode')))
    : (_theme ??= useCookie<ThemeMode>('theme_mode', { default: () => 'auto' }))
  if (!_systemPrefersDark) {
    _systemPrefersDark = ref(false)
  }
  const systemPrefersDark = _systemPrefersDark

  // 实际生效主题：auto → 跟随系统 prefers-color-scheme
  // SSR 时无系统偏好（null）返回 light（首帧由 app.vue 内联脚本修正）
  const resolvedTheme = computed<'light' | 'dark'>(() =>
    resolveTheme(theme.value, import.meta.server ? null : systemPrefersDark.value),
  )

  // 客户端：记录系统偏好并监听变化（仅 auto 模式需要响应）
  if (import.meta.client && !initialized) {
    initialized = true
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    systemPrefersDark.value = media.matches
    // 模块级单例：监听器注册一次、应用生命周期内不解除，忽略返回值
    // （内部处理 iOS 12 无 addEventListener 时的 addListener 回退）
    onMqChange(media, (e) => {
      systemPrefersDark.value = e.matches
    })
  }

  /** 三态循环切换：日间 → 夜间 → 跟随系统 */
  function cycleTheme() {
    theme.value = nextTheme(theme.value)
  }

  return {
    theme: readonly(theme),
    resolvedTheme: readonly(resolvedTheme),
    cycleTheme,
  }
}
