/**
 * history — 观看历史格式化工具（纯函数，供 HistoryDropdown 与 MobileSidebar 共用）
 */

/** 格式化视频时长（秒 → HH:mm:ss / mm:ss） */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`
  }
  return `${pad(m)}:${pad(s)}`
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

/** 计算观看进度百分比 */
export function progressPercent(item: { progress: number; duration: number }): number {
  if (!item.duration) return 0
  const p = effectiveProgress(item)
  return Math.min(100, Math.round((p / item.duration) * 100))
}

/** 有效观看进度 — progress=0 视为已看完，回退为总时长 */
export function effectiveProgress(item: { progress: number; duration: number }): number {
  return item.progress > 0 ? item.progress : item.duration
}

/** 生成历史卡片链接：直播项 → 直播间，视频项 → 视频页 */
export function getHistoryLink(item: { bvid: string; isLive?: boolean; roomId?: number }): string {
  if (item.isLive && item.roomId) return `https://live.bilibili.com/${item.roomId}`
  if (item.bvid) return `https://www.bilibili.com/video/${item.bvid}`
  return ''
}

/** 格式化观看时间（Unix 秒时间戳 → 相对时间） */
export function formatViewTime(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  const now = new Date()

  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  // 今天
  if (isSameDay(date, now)) {
    return `今天 ${time}`
  }

  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, yesterday)) {
    return `昨天 ${time}`
  }

  // 今年
  if (date.getFullYear() === now.getFullYear()) {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
  }

  // 往年
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}
