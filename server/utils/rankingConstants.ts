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

/** 全分区组合缓存 Key（合并全部 rid 的结果） */
export const COMBINED_CACHE_KEY = 'ranking:all'

/** 热门视频缓存 Key */
export const POPULAR_CACHE_KEY = 'popular:latest'

/** 在线人数新鲜度 TTL：15 分钟（TTL 内复用旧值，过期才重新拉取） */
export const ONLINE_TTL = 15 * 60 * 1000

/** 每轮刷新在线人数请求上限（防风控） */
export const ONLINE_FETCH_LIMIT = 500

/** 离开排行后保留在线人数的阈值：在线人数 ≥ 此值才保留（防误移除热门视频） */
export const OFF_RANKING_KEEP_THRESHOLD = 500

/**
 * 在线人数批量请求：批间基础延迟（毫秒）
 *
 * 每批 5 并发，批间加入随机延迟（见 ONLINE_BATCH_DELAY_JITTER_MS），
 * 避免短时间同 IP 高频请求触发 B站风控（v_voucher 文档：同接口短时间内
 * 被同一用户/IP/UA 多次请求会触发 -352）。
 */
export const ONLINE_BATCH_DELAY_MS = 250

/** 在线人数批量请求：批间延迟随机抖动上限（毫秒），固定间隔 + 抖动防规律性风控 */
export const ONLINE_BATCH_DELAY_JITTER_MS = 150

/** 元数据重试（/x/web-interface/view 串行请求）间隔基础值（毫秒），该接口批量请求会被 B站封锁 */
export const METADATA_RETRY_DELAY_MS = 300

/**
 * 离开排行保留条目的最长保鲜期（TTL 兜底）
 *
 * 保留条目参与轮转刷新（在线人数 ≥ 阈值时每轮续期，onlineAt 更新），
 * 此 TTL 仅兜底「轮转预算长期不足 / 连续拉取失败」的极端情况：
 * 超过该时长未成功刷新 → 强制淘汰，防止冻结数据无限滞留。
 */
export const OFF_RANKING_RETAIN_TTL = 6 * 60 * 60 * 1000

/** 缓存保留最低在线人数：少于 200 人的视频从缓存剔除（瘦身，含未拉到的 0） */
export const MIN_ONLINE_COUNT = 200

/** 生成分区排行榜缓存 Key */
export function rankingCacheKey(rid: string): string {
  return `ranking:${rid}`
}

/** 默认每页条数 */
export const DEFAULT_PAGE_SIZE = 30

/** 默认排序方式 */
export const DEFAULT_SORT_BY = 'count'
