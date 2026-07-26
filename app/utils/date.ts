/**
 * 日期格式化工具
 *
 * 使用固定 locale + options 确保服务端（Node.js）和客户端（浏览器）
 * 输出一致，避免 hydration mismatch。
 */

export const DATE_LOCALE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai',
}

/**
 * 格式化时间戳为 zh-CN 固定格式：yyyy/MM/dd HH:mm:ss
 */
export function formatDate(ts: number | Date): string {
  return new Date(ts).toLocaleString('zh-CN', DATE_LOCALE_OPTIONS)
}
