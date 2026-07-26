/**
 * 缓存时间戳比较工具
 *
 * 用于判断是否可跳过数据刷新：当服务端时间戳与本地记录一致时，
 * 说明缓存未更新，可跳过本次请求。
 */

/**
 * 判断是否应该跳过数据刷新
 *
 * @param serverTimestamp - 服务端缓存时间戳（来自 /api/xxx/timestamp 端点）
 * @param localTimestamp  - 本地记录的最近一次数据时间戳
 * @returns true 表示可跳过刷新（数据未变化），false 表示需要刷新
 */
export function shouldSkipRefresh(
  serverTimestamp: number,
  localTimestamp: number | undefined,
): boolean {
  return !!(
    serverTimestamp &&
    localTimestamp &&
    serverTimestamp === localTimestamp
  )
}
