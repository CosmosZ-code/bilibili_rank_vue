/**
 * useBlacklist — 屏蔽 UP 黑名单状态管理
 *
 * 双轨持久化（模仿 purifyPercent 的偏好模式）：
 * - 本地：浏览器 cookie（blocked_ups），刷新后保留
 * - 服务端：登录后同步 DB（user_blacklist 表），跨设备跟随
 *
 * 模块级单例（懒初始化，避免纯 Node 单元测试环境加载 Nuxt 依赖）。
 * SSR 阶段不初始化（值恒为空数组；视频列表 SSR 仅渲染骨架屏，不依赖黑名单），
 * 客户端首次调用时从 cookie 恢复并监听写回。
 */

import type { BlacklistItem } from '../types'

// ============================================================
// 纯函数（导出供单元测试）
// ============================================================

/**
 * 切换屏蔽状态：已存在则移除，不存在则追加（返回新数组）
 */
export function toggleBlockFromList(list: BlacklistItem[], item: BlacklistItem): BlacklistItem[] {
  if (list.some((b) => b.mid === item.mid)) {
    return list.filter((b) => b.mid !== item.mid)
  }
  return [...list, item]
}

/**
 * 按 mid 移除屏蔽条目（返回新数组）
 */
export function removeFromList(list: BlacklistItem[], mid: string): BlacklistItem[] {
  return list.filter((b) => b.mid !== mid)
}

/**
 * 按 UP 名排序（中文按拼音，首字优先；返回新数组）
 */
export function sortBlacklistByOwner(list: BlacklistItem[]): BlacklistItem[] {
  return [...list].sort((a, b) => a.owner.localeCompare(b.owner, 'zh'))
}

// ============================================================
// Composable（模块级单例）
// ============================================================

let _blockedUps: Ref<BlacklistItem[]> | null = null
let initialized = false

export function useBlacklist() {
  if (!_blockedUps) {
    _blockedUps = ref<BlacklistItem[]>([])
  }
  const blockedUps = _blockedUps

  // 客户端初始化：从 cookie 恢复 + 双向同步 + 登录后 DB 同步
  if (import.meta.client && !initialized) {
    initialized = true

    const cookie = useCookie<BlacklistItem[]>('blocked_ups', { default: () => [] })
    if (cookie.value?.length) {
      blockedUps.value = cookie.value
    }
    // 黑名单变化 → 写回 cookie
    watch(blockedUps, (val) => {
      cookie.value = val
    }, { deep: true })

    // 登录后与服务端同步（模仿 index.vue 中 purifyPercent 的同步块）：
    // DB 有数据 → 覆盖本地；DB 空且本地有数据 → 上传本地
    const { user: authUser } = useAuth()
    watch(authUser, async (u) => {
      if (!u?.bilibiliUid) return
      try {
        const res = await $fetch<{ items: BlacklistItem[] }>('/api/user/blacklist')
        if (res.items?.length) {
          blockedUps.value = res.items
        } else if (blockedUps.value.length) {
          $fetch('/api/user/blacklist', {
            method: 'PUT',
            body: { items: blockedUps.value },
          }).catch(() => {})
        }
      } catch { /* 请求失败静默 */ }
    }, { immediate: true })

    // 本地变化 → 1s 防抖上传服务端
    let saveTimer: ReturnType<typeof setTimeout>
    watch(blockedUps, (val) => {
      if (!authUser.value?.bilibiliUid) return
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        $fetch('/api/user/blacklist', {
          method: 'PUT',
          body: { items: val },
        }).catch(() => {})
      }, 1000)
    }, { deep: true })
  }

  /** 已屏蔽 UP 的 mid 列表（供查询参数与组件 props） */
  const blockedMids = computed(() => blockedUps.value.map((b) => b.mid))

  /** 切换屏蔽：已屏蔽则取消，未屏蔽则加入 */
  function toggleBlock(item: BlacklistItem) {
    blockedUps.value = toggleBlockFromList(blockedUps.value, item)
  }

  /** 取消屏蔽 */
  function unblock(mid: string) {
    blockedUps.value = removeFromList(blockedUps.value, mid)
  }

  return {
    blockedUps: readonly(blockedUps),
    blockedMids,
    toggleBlock,
    unblock,
  }
}
