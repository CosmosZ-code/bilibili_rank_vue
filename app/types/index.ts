// ============================================================
// 核心数据类型定义
// ============================================================

/** 单个视频的完整信息（与 data.json 格式兼容） */
export interface VideoInfo {
  /** 视频标题 */
  title: string
  /** UP主名称 */
  owner: string
  /** UP主 mid */
  mid: string
  /** 封面图 URL（https） */
  pic: string
  /** 格式化后的在线人数，如 "1.2万+" */
  online_count: string
  /** 在线人数原始数值 */
  count_num: number
  /** 播放量原始数值 */
  play_count_num: number
  /** 弹幕数原始数值 */
  danmaku_count_num: number
  /** 格式化后的播放量，如 "3800万+" */
  play_count: string
  /** 格式化后的弹幕数，如 "52万+" */
  danmaku_count: string
}

/** 以 BV 号为 key 的视频数据字典 */
export type VideosDataMap = Record<string, VideoInfo>

/** 排序方式 */
export type SortBy = 'count'

// ============================================================
// Banner 视差引擎相关
// ============================================================

/** 单个 Banner 图层的变换数据 */
export interface BannerLayerData {
  /** 图片/视频资源 URL */
  src: string
  /** transform matrix 数组 [a, b, c, d, tx, ty] */
  transform: number[]
  /** 宽度（px） */
  width: number
  /** 高度（px） */
  height?: number
  /** 鼠标移动加速度因子 */
  a: number
  /** 缩放因子 */
  f?: number
  /** 垂直移动因子 */
  g?: number
  /** 旋转角度因子（弧度） */
  deg?: number
  /** 透明度 [初始值, 目标值] */
  opacity?: [number, number]
  /** 模糊量（px） */
  blur?: number
  /** HTML 标签名（默认 img，可选 video） */
  tagName?: 'img' | 'video'
}

/** 一个完整的 Banner 数据集 */
export interface BannerDataSet {
  /** Banner 名称 */
  name: string
  /** 图层数据数组 */
  data: BannerLayerData[]
}

// ============================================================
// 用户数据相关
// ============================================================

/** B站历史记录项 */
export interface HistoryItem {
  /** 视频标题 */
  title: string
  /** BV 号 */
  bvid: string
  /** 封面图 */
  cover: string
  /** UP主名称 */
  ownerName: string
  /** 观看时间戳 */
  viewAt: number
  /** 进度（秒） */
  progress: number
  /** 总时长（秒） */
  duration: number
}

/** B站收藏夹 */
export interface FavoriteFolder {
  /** 收藏夹 ID */
  id: number
  /** 收藏夹名称 */
  title: string
  /** 收藏夹封面 */
  cover: string
  /** 视频数量 */
  media_count: number
}

/** B站收藏夹中的视频 */
export interface FavoriteItem {
  /** 视频标题 */
  title: string
  /** BV 号 */
  bvid: string
  /** 封面图 */
  cover: string
  /** UP主名称 */
  upperName: string
}

// ============================================================
// API 响应泛型
// ============================================================

/** B站标准 API 响应包装 */
export interface BilibiliResponse<T> {
  code: number
  message: string
  ttl?: number
  data: T
}

/** 带 bvid 的视频条目（从 VideosDataMap 展开） */
export interface VideoWithBvid extends VideoInfo {
  bvid: string
}

/** 排行榜分页响应 */
export interface RankingResponse {
  items: VideoWithBvid[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  timestamp: number
}

/** 缓存条目 */
export interface CacheEntry<T> {
  data: T
  timestamp: number
}

// ============================================================
// 直播排行相关类型
// ============================================================

/** 单个直播间信息 */
export interface LiveRoomInfo {
  /** 直播标题 */
  title: string
  /** 主播名称 */
  uname: string
  /** 主播 UID */
  uid: number
  /** 直播间 ID */
  roomid: number
  /** 原始在线热度 */
  online: number
  /** 格式化后的在线热度，如 "12.3万" */
  online_formatted: string
  /** 封面图 URL */
  cover: string
  /** 主播头像 URL */
  face: string
  /** 子分区名，如 "英雄联盟" */
  area_v2_name: string
  /** 一级分区名，如 "游戏" */
  parent_area_name: string
  /** 一级分区 ID */
  parent_area_id: number
  /** 直播间链接 */
  link: string
}

/** 直播排行榜分页响应 */
export interface LiveRankingResponse {
  items: LiveRoomInfo[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  timestamp: number
}

/** 直播一级分区 */
export interface LiveArea {
  id: number
  name: string
}

/** 视图模式：视频排行 / 直播排行 */
export type ViewMode = 'videos' | 'live'
