/**
 * useTouchDevice 及下拉菜单触屏适配 — 纯逻辑单元测试
 *
 * 测试触屏检测 composable 和下拉菜单的两阶段点按逻辑。
 * 由于 useTouchDevice 依赖 window.matchMedia（仅客户端可用），
 * 本测试提取纯逻辑部分进行验证，并验证各组件文件的触屏代码结构。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'

const rootDir = resolve(__dirname, '../..')

// ============================================================
// 内联纯函数：触屏检测的媒体查询字符串（与 useTouchDevice.ts 保持同步）
// ============================================================
const TOUCH_MEDIA_QUERY = '(hover: none) and (pointer: coarse)'

// ============================================================
// 内联纯函数：点按展开逻辑（与各组件保持同步）
// ============================================================

/**
 * 计算触屏下点击触发器后的下拉状态
 *
 * @param isTouch - 是否为触屏设备
 * @param isOpen - 当前下拉是否已打开
 * @returns 新的下拉状态
 */
function computeTriggerTap(isTouch: boolean, isOpen: boolean): { shouldOpen: boolean; shouldTriggerAction: boolean } {
  if (!isTouch) {
    // 桌面设备：点击直接触发原操作，不改变下拉状态
    return { shouldOpen: isOpen, shouldTriggerAction: true }
  }
  if (!isOpen) {
    // 触屏首次点按：展开下拉，不触发原操作
    return { shouldOpen: true, shouldTriggerAction: false }
  }
  // 触屏第二次点按：触发原操作
  return { shouldOpen: isOpen, shouldTriggerAction: true }
}

/**
 * 计算点击外部时是否应关闭下拉
 *
 * @param isTouch - 是否为触屏设备
 * @param isOpen - 当前下拉是否已打开
 * @param clickedInside - 点击目标是否在下拉容器内
 * @returns 是否应关闭下拉
 */
function computeClickOutside(isTouch: boolean, isOpen: boolean, clickedInside: boolean): boolean {
  if (!isTouch || !isOpen) return false
  return !clickedInside
}

// ============================================================
// 测试用例
// ============================================================

describe('触屏媒体查询字符串', () => {
  it('matchMedia 查询字符串为 (hover: none) and (pointer: coarse)', () => {
    expect(TOUCH_MEDIA_QUERY).toBe('(hover: none) and (pointer: coarse)')
  })

  it('查询字符串包含 hover: none（检测无悬浮能力）', () => {
    expect(TOUCH_MEDIA_QUERY).toContain('hover: none')
  })

  it('查询字符串包含 pointer: coarse（检测粗指针 = 手指）', () => {
    expect(TOUCH_MEDIA_QUERY).toContain('pointer: coarse')
  })
})

describe('点按展开逻辑（两阶段点按）', () => {
  describe('桌面设备（isTouch = false）', () => {
    it('下拉关闭时点击 → 触发原操作，下拉状态不变', () => {
      const result = computeTriggerTap(false, false)
      expect(result.shouldTriggerAction).toBe(true)
      // 桌面点击不改变下拉状态（由 hover 控制）
    })

    it('下拉已打开时点击 → 触发原操作', () => {
      const result = computeTriggerTap(false, true)
      expect(result.shouldTriggerAction).toBe(true)
    })
  })

  describe('触屏设备（isTouch = true）', () => {
    it('下拉关闭时第一次点按 → 展开下拉，不触发原操作', () => {
      const result = computeTriggerTap(true, false)
      expect(result.shouldOpen).toBe(true)
      expect(result.shouldTriggerAction).toBe(false)
    })

    it('下拉已打开时第二次点按 → 触发原操作', () => {
      const result = computeTriggerTap(true, true)
      expect(result.shouldTriggerAction).toBe(true)
    })
  })
})

describe('点击外部关闭逻辑', () => {
  it('桌面设备：点击外部不关闭（由 mouseleave 控制）', () => {
    expect(computeClickOutside(false, true, false)).toBe(false)
  })

  it('桌面设备：点击内部不关闭', () => {
    expect(computeClickOutside(false, true, true)).toBe(false)
  })

  it('触屏设备 + 下拉关闭：不处理', () => {
    expect(computeClickOutside(true, false, false)).toBe(false)
  })

  it('触屏设备 + 下拉打开 + 点击外部 → 关闭', () => {
    expect(computeClickOutside(true, true, false)).toBe(true)
  })

  it('触屏设备 + 下拉打开 + 点击内部 → 不关闭', () => {
    expect(computeClickOutside(true, true, true)).toBe(false)
  })
})

// ============================================================
// 组件文件内容验证
// ============================================================

describe('组件触屏适配代码结构验证', () => {
  describe('useTouchDevice composable', () => {
    it('文件存在', async () => {
      const fs = await import('node:fs/promises')
      const exists = await fs.access(resolve(rootDir, 'app/composables/useTouchDevice.ts'))
        .then(() => true).catch(() => false)
      expect(exists).toBe(true)
    })

    it('导出 useTouchDevice 函数', async () => {
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(resolve(rootDir, 'app/composables/useTouchDevice.ts'), 'utf-8')
      expect(content).toContain('export function useTouchDevice')
    })

    it('使用 matchMedia 检测触屏', async () => {
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(resolve(rootDir, 'app/composables/useTouchDevice.ts'), 'utf-8')
      expect(content).toContain('matchMedia')
    })

    it('返回 isTouch ref', async () => {
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(resolve(rootDir, 'app/composables/useTouchDevice.ts'), 'utf-8')
      expect(content).toContain('isTouch')
    })

    it('监听 matchMedia change 事件（动态适配）', async () => {
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(resolve(rootDir, 'app/composables/useTouchDevice.ts'), 'utf-8')
      expect(content).toContain('addEventListener')
      expect(content).toContain('removeEventListener')
    })

    it('SSR 安全：仅在 onMounted 中访问 window', async () => {
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(resolve(rootDir, 'app/composables/useTouchDevice.ts'), 'utf-8')
      expect(content).toContain('onMounted')
    })
  })

  describe('RankingControls.vue — 直播下拉触屏适配', () => {
    let content = ''

    beforeAll(async () => {
      const fs = await import('node:fs/promises')
      content = await fs.readFile(resolve(rootDir, 'app/components/ranking/RankingControls.vue'), 'utf-8')
    })

    it('引入 useTouchDevice', () => {
      expect(content).toContain('useTouchDevice()')
    })

    it('包含触屏点按逻辑（isTouch 判断）', () => {
      expect(content).toContain('isTouch.value')
    })

    it('clickLive 中触屏首次点按仅展开下拉', () => {
      expect(content).toContain('isTouch.value && !dropdownOpen.value')
      expect(content).toContain('dropdownOpen.value = true')
    })

    it('包含点击外部关闭逻辑', () => {
      expect(content).toContain('onDocumentClick')
      expect(content).toContain('document.addEventListener')
    })

    it('liveDropdownRef 用于判断点击目标', () => {
      expect(content).toContain('ref="liveDropdownRef"')
    })
  })

  describe('HistoryDropdown.vue — 历史下拉触屏适配', () => {
    let content = ''

    beforeAll(async () => {
      const fs = await import('node:fs/promises')
      content = await fs.readFile(resolve(rootDir, 'app/components/nav/HistoryDropdown.vue'), 'utf-8')
    })

    it('引入 useTouchDevice', () => {
      expect(content).toContain('useTouchDevice()')
    })

    it('触发器添加 @click 处理', () => {
      expect(content).toContain('@click="onTriggerClick"')
    })

    it('onTriggerClick 触屏首次点按 preventDefault + 展开面板', () => {
      expect(content).toContain('onTriggerClick')
      expect(content).toContain('e.preventDefault()')
      expect(content).toContain('isOpen.value = true')
    })

    it('包含点击外部关闭（含 Teleported 面板的 ref）', () => {
      expect(content).toContain('historyPanelRef')
      expect(content).toContain('historyWrapperRef')
      expect(content).toContain('panel.contains')
    })

    it('点击外部检查 wrapper 和 teleported panel 两个容器', () => {
      // 检查 contains 同时检查 wrapper 和 panel
      expect(content).toContain('wrapper.contains')
      expect(content).toContain('panel.contains')
    })
  })

  describe('BilibiliLogin.vue — 用户菜单触屏适配', () => {
    let content = ''

    beforeAll(async () => {
      const fs = await import('node:fs/promises')
      content = await fs.readFile(resolve(rootDir, 'app/components/auth/BilibiliLogin.vue'), 'utf-8')
    })

    it('引入 useTouchDevice', () => {
      expect(content).toContain('useTouchDevice()')
    })

    it('.user-info 添加 @click 处理', () => {
      expect(content).toContain('@click="onUserClick"')
    })

    it('onUserClick 触屏下切换下拉菜单', () => {
      expect(content).toContain('onUserClick')
      expect(content).toContain('isMenuOpen.value = !isMenuOpen.value')
    })

    it('包含点击外部关闭逻辑', () => {
      expect(content).toContain('userMenuWrapperRef')
      expect(content).toContain('userDropdownRef')
      expect(content).toContain('onDocumentClick')
    })
  })

  describe('NavDropdown.vue — 通用下拉触屏适配', () => {
    let content = ''

    beforeAll(async () => {
      const fs = await import('node:fs/promises')
      content = await fs.readFile(resolve(rootDir, 'app/components/nav/NavDropdown.vue'), 'utf-8')
    })

    it('引入 useTouchDevice', () => {
      expect(content).toContain('useTouchDevice()')
    })

    it('触发器按钮添加 @click 处理', () => {
      expect(content).toContain('@click="onTriggerClick"')
    })

    it('onTriggerClick 触屏下切换下拉菜单', () => {
      expect(content).toContain('onTriggerClick')
      expect(content).toContain('isOpen.value = !isOpen.value')
    })

    it('包含点击外部关闭逻辑', () => {
      expect(content).toContain('navDropdownRef')
      expect(content).toContain('onDocumentClick')
    })
  })
})
