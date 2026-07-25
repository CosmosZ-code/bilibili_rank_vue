/**
 * 排行榜分区常量
 *
 * 排除不适合做排行榜的 5 个分区：番剧(13)、国创(167)、电影(23)、电视剧(11)、纪录片(177)
 * 仅支持主分区，详见：bilibili-API-collect/docs/video/video_zone.md
 */
export const VALID_RANKING_RIDS = [
  '0',   // 全站
  '1',   // 动画
  '3',   // 音乐
  '4',   // 游戏
  '5',   // 娱乐
  '36',  // 知识
  '119', // 鬼畜
  '129', // 舞蹈
  '155', // 时尚
  '160', // 生活
  '181', // 影视
  '188', // 科技
  '211', // 美食
  '217', // 动物圈
  '223', // 汽车
  '234', // 运动
] as const

/** 默认 rid（全站排行榜） */
export const DEFAULT_RID = '0'

/** 全分区组合缓存 Key（合并全部 rid 的结果） */
export const COMBINED_CACHE_KEY = 'ranking:all'

/** 生成分区排行榜缓存 Key */
export function rankingCacheKey(rid: string): string {
  return `ranking:${rid}`
}

/** 校验 rid 是否为合法分区值 */
export function isValidRid(rid: unknown): rid is string {
  return typeof rid === 'string' && (VALID_RANKING_RIDS as readonly string[]).includes(rid)
}
