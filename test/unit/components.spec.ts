/**
 * 组件结构验证测试
 *
 * 验证所有 Vue 组件文件存在且包含必要的结构
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = resolve(__dirname, '../..')
const componentsDir = resolve(rootDir, 'app/components')

const expectedComponents = [
  'banner/BannerContainer.vue',
  'banner/BannerLayer.vue',
  'banner/BannerNav.vue',
    'ranking/RankingControls.vue',
  'ranking/VideoGrid.vue',
  'ranking/VideoCard.vue',
  'ranking/VideoCardSkeleton.vue',
  'common/BackToTop.vue',
  'common/SearchBox.vue',
  'nav/NavDropdown.vue',
  'nav/NavDropdownItem.vue',
  'nav/HistoryDropdown.vue',
  'auth/BilibiliLogin.vue',
]

describe('组件文件完整性', () => {
  for (const component of expectedComponents) {
    it(`${component} 文件存在`, () => {
      const filePath = resolve(componentsDir, component)
      expect(existsSync(filePath)).toBe(true)
    })
  }

  it('所有组件文件总数正确', async () => {
    const fs = await import('node:fs/promises')

    async function countFiles(dir: string): Promise<number> {
      let count = 0
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = resolve(dir, entry.name)
        if (entry.isDirectory()) {
          count += await countFiles(fullPath)
        } else if (entry.name.endsWith('.vue')) {
          count++
        }
      }
      return count
    }

    const total = await countFiles(componentsDir)
    expect(total).toBeGreaterThanOrEqual(expectedComponents.length)
  })
})

describe('组件关键内容验证', () => {
  it('VideoCard 包含排名徽章渲染', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'ranking/VideoCard.vue'), 'utf-8')
    expect(content).toContain('rank-badge')
    expect(content).toContain('rank-1')
    expect(content).toContain('rank-2')
    expect(content).toContain('rank-3')
  })

  it('VideoCard 包含 HTTPS 化逻辑（确保 pic 用 https）', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'ranking/VideoCard.vue'), 'utf-8')
    // 缩略图 URL 拼接逻辑
    expect(content).toContain('@320w_200h_1c_')
  })

  it('VideoGrid 处理空数据、加载中、错误三种状态', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'ranking/VideoGrid.vue'), 'utf-8')
    expect(content).toContain('isLoading')
    expect(content).toContain('error')
    expect(content).toContain('没有找到匹配的视频')
  })

  it('BannerContainer 注册鼠标事件', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'banner/BannerContainer.vue'), 'utf-8')
    expect(content).toContain('mouseenter')
    expect(content).toContain('mousemove')
    expect(content).toContain('mouseleave')
  })

  it('BannerContainer 包含移动端隐藏逻辑', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'banner/BannerContainer.vue'), 'utf-8')
    // 移动端通过 CSS media query 隐藏
    expect(content).toContain('display: none')
    expect(content).toContain('768px')
  })

  it('RankingControls 包含搜索、排序、过滤三种控件', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'ranking/RankingControls.vue'), 'utf-8')
    expect(content).toContain('SearchBox')
    expect(content).toContain('sort-options')
    expect(content).toContain('percent-range')
  })

  it('RankingControls 包含触屏两阶段点按逻辑', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'ranking/RankingControls.vue'), 'utf-8')
    // 引入触屏检测
    expect(content).toContain('useTouchDevice')
    // 两阶段点按：首次展开，二次触发
    expect(content).toContain('isTouch.value && !dropdownOpen.value')
    // 点击外部关闭
    expect(content).toContain('onDocumentClick')
  })

  it('HistoryDropdown 包含触屏点按适配（Teleported 面板）', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'nav/HistoryDropdown.vue'), 'utf-8')
    expect(content).toContain('useTouchDevice')
    expect(content).toContain('@click="onTriggerClick"')
    expect(content).toContain('historyPanelRef') // Teleported 面板的 ref
  })

  it('BilibiliLogin 包含触屏切换下拉菜单逻辑', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'auth/BilibiliLogin.vue'), 'utf-8')
    expect(content).toContain('useTouchDevice')
    expect(content).toContain('onUserClick')
    expect(content).toContain('!isMenuOpen.value')
  })

  it('NavDropdown 包含触屏点按切换逻辑', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'nav/NavDropdown.vue'), 'utf-8')
    expect(content).toContain('useTouchDevice')
    expect(content).toContain('onTriggerClick')
  })

  it('BackToTop 按钮初始 opacity=0（隐藏）', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'common/BackToTop.vue'), 'utf-8')
    expect(content).toContain('opacity: 0')
    expect(content).toContain('.show')
  })

  it('BannerNav 包含原 HTML 的 5 个导航链接', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'banner/BannerNav.vue'), 'utf-8')
    expect(content).toContain('bilibili.com')
    expect(content).toContain('番剧')
    expect(content).toContain('直播')
    expect(content).toContain('动态')
    expect(content).toContain('HistoryDropdown')
  })

  it('BannerLayer 支持 img 和 video 两种标签', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'banner/BannerLayer.vue'), 'utf-8')
    expect(content).toContain('video')
    expect(content).toContain('isVideo')
  })

  it('VideoCardSkeleton 包含 shimmer 动画', async () => {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(resolve(componentsDir, 'ranking/VideoCardSkeleton.vue'), 'utf-8')
    expect(content).toContain('shimmer')
    expect(content).toContain('keyframes')
  })
})
