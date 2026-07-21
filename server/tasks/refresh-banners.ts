/**
 * 每周刷新 Banner 缓存
 *
 * 周日 00:00 自动清除缓存，下次请求时重新扫描 public/assets/ 目录
 * 新抓取的 Banner 目录会自动被识别并激活
 */
import { clearBannerCache } from '../utils/bannerData'

export default defineTask({
  meta: {
    name: 'refresh-banners',
    description: '每周清除 Banner 缓存，使新增的 Banner 目录生效',
  },
  cron: '0 0 * * 0', // 每周日 00:00
  async run() {
    clearBannerCache()
    return { result: 'Banner 缓存已清除，下次请求将重新扫描' }
  },
})
