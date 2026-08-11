/**
 * useBlacklist 纯函数单元测试
 *
 * 测试 toggleBlockFromList / removeFromList 的数组增删逻辑
 * （不依赖 Nuxt 运行时，沿用项目 -pure 测试惯例）
 */
import { describe, it, expect } from 'vitest'
import {
  toggleBlockFromList,
  removeFromList,
  sortBlacklistByOwner,
  hasSameBlockedMids,
} from '../../app/composables/useBlacklist'
import type { BlacklistItem } from '../../app/types'

const UP_A: BlacklistItem = { mid: '10001', owner: 'UP_A' }
const UP_B: BlacklistItem = { mid: '10002', owner: 'UP_B' }

describe('toggleBlockFromList — 切换屏蔽状态', () => {
  it('空列表追加条目', () => {
    expect(toggleBlockFromList([], UP_A)).toEqual([UP_A])
  })

  it('未屏蔽的条目被追加（保持原顺序）', () => {
    expect(toggleBlockFromList([UP_A], UP_B)).toEqual([UP_A, UP_B])
  })

  it('已屏蔽的条目被移除', () => {
    expect(toggleBlockFromList([UP_A, UP_B], UP_A)).toEqual([UP_B])
  })

  it('返回新数组，不修改原数组', () => {
    const list = [UP_A]
    const result = toggleBlockFromList(list, UP_B)
    expect(result).not.toBe(list)
    expect(list).toEqual([UP_A])
  })

  it('同 mid 不同 owner 视为同一条目（以 mid 判断）', () => {
    const renamed = { mid: '10001', owner: '新名字' }
    expect(toggleBlockFromList([UP_A], renamed)).toEqual([])
  })
})

describe('removeFromList — 按 mid 移除', () => {
  it('移除存在的 mid', () => {
    expect(removeFromList([UP_A, UP_B], '10001')).toEqual([UP_B])
  })

  it('mid 不存在时返回原数组不变', () => {
    expect(removeFromList([UP_A], '99999')).toEqual([UP_A])
  })

  it('空列表移除不报错', () => {
    expect(removeFromList([], '10001')).toEqual([])
  })
})

describe('sortBlacklistByOwner — 按 UP 名首字排序（中文按拼音）', () => {
  it('按拼音首字排序', () => {
    const list: BlacklistItem[] = [
      { mid: '3', owner: '张三' },
      { mid: '1', owner: '王五' },
      { mid: '2', owner: '李四' },
    ]
    // 李(li) < 王(wang) < 张(zhang)
    expect(sortBlacklistByOwner(list).map((b) => b.owner)).toEqual(['李四', '王五', '张三'])
  })

  it('同首字时按后续字符排序', () => {
    const list: BlacklistItem[] = [
      { mid: '1', owner: '李白' },
      { mid: '2', owner: '李黑' },
    ]
    // 白(bai) < 黑(hei)
    expect(sortBlacklistByOwner(list).map((b) => b.owner)).toEqual(['李白', '李黑'])
  })

  it('英文名按字母序排列', () => {
    const list: BlacklistItem[] = [
      { mid: '1', owner: 'zack' },
      { mid: '2', owner: 'alice' },
    ]
    expect(sortBlacklistByOwner(list).map((b) => b.owner)).toEqual(['alice', 'zack'])
  })

  it('不修改原数组', () => {
    const list: BlacklistItem[] = [
      { mid: '1', owner: '王五' },
      { mid: '2', owner: '李四' },
    ]
    sortBlacklistByOwner(list)
    expect(list.map((b) => b.owner)).toEqual(['王五', '李四'])
  })

  it('空列表返回空数组', () => {
    expect(sortBlacklistByOwner([])).toEqual([])
  })
})

describe('hasSameBlockedMids — 内容比较（忽略顺序与 owner 名）', () => {
  it('相同 mid 不同顺序 → true', () => {
    expect(hasSameBlockedMids([UP_A, UP_B], [UP_B, UP_A])).toBe(true)
  })

  it('同 mid 不同 owner 名 → true（以 mid 判断）', () => {
    const renamed = { mid: '10001', owner: '新名字' }
    expect(hasSameBlockedMids([UP_A], [renamed])).toBe(true)
  })

  it('新增条目 → false', () => {
    expect(hasSameBlockedMids([UP_A], [UP_A, UP_B])).toBe(false)
  })

  it('移除条目 → false', () => {
    expect(hasSameBlockedMids([UP_A, UP_B], [UP_A])).toBe(false)
  })

  it('替换条目 → false', () => {
    expect(hasSameBlockedMids([UP_A], [UP_B])).toBe(false)
  })

  it('两个空列表 → true', () => {
    expect(hasSameBlockedMids([], [])).toBe(true)
  })

  it('一个为空一个非空 → false', () => {
    expect(hasSameBlockedMids([], [UP_A])).toBe(false)
  })
})
