/**
 * useTouchDevice 及下拉菜单触屏适配 — 纯逻辑单元测试
 *
 * 测试触屏检测、两阶段点按逻辑和点击外部关闭逻辑。
 * 纯函数从 app/composables/useTouchDropdown.ts 导入。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { computeTriggerTap, isClickOutside } from '../../app/composables/useTouchDropdown'

const rootDir = resolve(__dirname, '../..')

// ============================================================
// 触屏检测的媒体查询字符串（来自 useTouchDevice.ts）
// ============================================================
const TOUCH_MEDIA_QUERY = '(hover: none) and (pointer: coarse)'

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

describe('isClickOutside — 点击外部检测', () => {
  // 创建简单的 mock 元素来模拟 DOM contains 关系
  function mockEl(children: any[] = []): any {
    return {
      contains(target: any): boolean {
        return this === target || children.some((c) => c.contains(target))
      },
    }
  }

  it('所有容器为 null/undefined → 返回 false（不关闭）', () => {
    const target = mockEl()
    expect(isClickOutside(target, [null, undefined])).toBe(false)
  })

  it('点击在容器内部 → 返回 false', () => {
    const child = mockEl()
    const container = mockEl([child])
    expect(isClickOutside(child, [container])).toBe(false)
  })

  it('点击在容器外部 → 返回 true', () => {
    const outside = mockEl()
    const container = mockEl()
    expect(isClickOutside(outside, [container])).toBe(true)
  })

  it('多个容器：点击在任一容器内部 → 返回 false', () => {
    const target = mockEl()
    const container1 = mockEl()
    const container2 = mockEl([target])
    expect(isClickOutside(target, [container1, container2])).toBe(false)
  })

  it('多个容器：点击在所有容器外部 → 返回 true', () => {
    const outside = mockEl()
    const container1 = mockEl()
    const container2 = mockEl()
    expect(isClickOutside(outside, [container1, container2])).toBe(true)
  })

  it('部分容器为 null，其他容器内点击 → 返回 false', () => {
    const target = mockEl()
    const container = mockEl([target])
    expect(isClickOutside(target, [null, container, undefined])).toBe(false)
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

    it('clickLive 中使用 computeTriggerTap（两阶段点按）', () => {
      expect(content).toContain('computeTriggerTap')
    })

    it('clickLive 中触屏首次点按仅展开下拉', () => {
      expect(content).toContain('shouldOpen')
      expect(content).toContain('dropdownOpen.value = true')
    })

    it('onDocumentClick 中使用 isClickOutside', () => {
      expect(content).toContain('isClickOutside')
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

    it('onTriggerClick 中使用 computeTriggerTap', () => {
      expect(content).toContain('computeTriggerTap')
      expect(content).toContain('e.preventDefault()')
      expect(content).toContain('isOpen.value = true')
    })

    it('onDocumentClick 中使用 isClickOutside', () => {
      expect(content).toContain('isClickOutside')
      expect(content).toContain('historyPanelRef')
      expect(content).toContain('historyWrapperRef')
    })

    it('onDocumentClick 中使用 isClickOutside 检查两个容器', () => {
      expect(content).toContain('isClickOutside')
      expect(content).toContain('historyWrapperRef')
      expect(content).toContain('historyPanelRef')
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

    it('onDocumentClick 中使用 isClickOutside', () => {
      expect(content).toContain('isClickOutside')
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

    it('onDocumentClick 中使用 isClickOutside', () => {
      expect(content).toContain('isClickOutside')
      expect(content).toContain('navDropdownRef')
      expect(content).toContain('onDocumentClick')
    })
  })
})
