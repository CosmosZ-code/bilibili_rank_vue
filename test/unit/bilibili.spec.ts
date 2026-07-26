/**
 * bilibili.ts 工具函数单元测试
 *
 * 测试非网络请求的纯函数：
 * - getMixinKey: WBI 混排密钥生成
 * - signWbiParams: WBI 参数签名
 * - formatCount: 数字格式化
 * - parseChineseNumber: 中文数字解析
 * - ensureHttps: URL 协议转换
 * - dedupByBvid: 去重逻辑
 */
import { describe, it, expect } from 'vitest'
import {
  formatCount,
  parseChineseNumber,
  ensureHttps,
  dedupByBvid,
  getMixinKey,
  signWbiParams,
} from '../../server/utils/bilibili'

describe('WBI 签名逻辑验证', () => {
  it('getMixinKey 生成 32 字符长度的密钥', () => {
    const imgKey = '7cd084941338484aae1ad9425b84077c'
    const subKey = 'a5d6e7f83b4c2d1a9e8f7c6b5a4d3e2f'

    const mixinKey = getMixinKey(imgKey + subKey)
    expect(mixinKey.length).toBe(32)
  })

  it('getMixinKey 对相同输入产生相同输出', () => {
    const input = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01'
    const result1 = getMixinKey(input)
    const result2 = getMixinKey(input)
    expect(result1).toBe(result2)
  })

  it('getMixinKey 对不同输入产生不同输出', () => {
    const input1 = 'a'.repeat(64)
    const input2 = 'b'.repeat(64)
    const result1 = getMixinKey(input1)
    const result2 = getMixinKey(input2)
    expect(result1).not.toBe(result2)
  })

  it('getMixinKey 输入长度不足 64 时，不足部分跳过', () => {
    const shortInput = 'abc' // 长度 3
    const result = getMixinKey(shortInput)
    // 只有索引 < 3 的会被选中（索引 0, 1, 2），其余跳过
    expect(result.length).toBeLessThanOrEqual(32)
    expect(typeof result).toBe('string')
  })

  it('signWbiParams 生成 w_rid 和 wts', () => {
    const imgKey = '7cd084941338484aae1ad9425b84077c'
    const subKey = 'a5d6e7f83b4c2d1a9e8f7c6b5a4d3e2f'
    const params = { rid: '0', type: 'all' }

    const result = signWbiParams(params, imgKey, subKey)

    // w_rid 是 32 字符的 MD5 十六进制字符串
    expect(typeof result.w_rid).toBe('string')
    expect(result.w_rid.length).toBe(32)
    expect(/^[0-9a-f]{32}$/.test(result.w_rid)).toBe(true)

    // wts 是 Unix 时间戳（10 位数字）
    expect(typeof result.wts).toBe('number')
    expect(String(result.wts).length).toBe(10)
  })

  it('WBI 签名参数值中 !\'()* 字符被过滤', () => {
    const imgKey = '7cd084941338484aae1ad9425b84077c'
    const subKey = 'a5d6e7f83b4c2d1a9e8f7c6b5a4d3e2f'

    // 包含 !'()* 的参数值应与过滤后相同参数的签名一致
    // （两次调用在同一秒内，wts 相同 → w_rid 相同）
    const result1 = signWbiParams({ q: "test!qu'ery(v)al*ue" }, imgKey, subKey)
    const result2 = signWbiParams({ q: 'testqueryvalue' }, imgKey, subKey)

    expect(result1.w_rid).toBe(result2.w_rid)
  })

  it('WBI 签名参数顺序无关（排序后一致）', () => {
    const imgKey = '7cd084941338484aae1ad9425b84077c'
    const subKey = 'a5d6e7f83b4c2d1a9e8f7c6b5a4d3e2f'

    // 不同顺序的参数应产生相同签名
    const result1 = signWbiParams({ type: 'all', rid: '0' }, imgKey, subKey)
    const result2 = signWbiParams({ rid: '0', type: 'all' }, imgKey, subKey)

    expect(result1.w_rid).toBe(result2.w_rid)
  })
})

describe('formatCount — 数字格式化', () => {
  it('小于 1 万的数字原样返回', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1)).toBe('1')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(9999)).toBe('9999')
  })

  it('1 万到 1 亿之间格式化为 "X万"', () => {
    expect(formatCount(10000)).toBe('1万')
    expect(formatCount(12000)).toBe('1.2万')
    expect(formatCount(50000)).toBe('5万')
    expect(formatCount(99990000)).toBe('9999万')
  })

  it('1 亿以上格式化为 "X亿"', () => {
    expect(formatCount(100000000)).toBe('1亿')
    expect(formatCount(120000000)).toBe('1.2亿')
    expect(formatCount(38000000)).toBe('3800万')
    expect(formatCount(150000000)).toBe('1.5亿')
  })

  it('常见 B站播放量/弹幕数格式', () => {
    expect(formatCount(52_0000)).toBe('52万')
    expect(formatCount(3800_0000)).toBe('3800万')
    expect(formatCount(1_2000)).toBe('1.2万')
    expect(formatCount(0)).toBe('0')
  })

  it('处理非常大的数（Number.MAX_SAFE_INTEGER）', () => {
    // 9 千万亿，远超亿级别
    const huge = Number.MAX_SAFE_INTEGER // 9007199254740991
    const result = formatCount(huge)
    // 应格式化为亿单位
    expect(result).toContain('亿')
    expect(result).not.toBe('0')
  })

  it('处理负数（边界防御）', () => {
    // 实际业务中不会传入负数，但函数应能处理
    const result = formatCount(-1000)
    // 当前实现会将 -1000 转为 "-1000"（小于 10000，原样返回）
    expect(typeof result).toBe('string')
  })
})

describe('parseChineseNumber — 中文数字解析', () => {
  it('解析 "万" 单位', () => {
    expect(parseChineseNumber('1万')).toEqual({ value: 10000, hasPlus: false })
    expect(parseChineseNumber('2.3万')).toEqual({ value: 23000, hasPlus: false })
    expect(parseChineseNumber('10万')).toEqual({ value: 100000, hasPlus: false })
    expect(parseChineseNumber('9999万')).toEqual({ value: 99990000, hasPlus: false })
  })

  it('解析 "万+" 格式（B站常见返回）', () => {
    expect(parseChineseNumber('1万+')).toEqual({ value: 10000, hasPlus: true })
    expect(parseChineseNumber('2.3万+')).toEqual({ value: 23000, hasPlus: true })
    expect(parseChineseNumber('10万+')).toEqual({ value: 100000, hasPlus: true })
  })

  it('解析 "亿" 单位', () => {
    expect(parseChineseNumber('1亿')).toEqual({ value: 100000000, hasPlus: false })
    expect(parseChineseNumber('1.5亿')).toEqual({ value: 150000000, hasPlus: false })
    expect(parseChineseNumber('1.2亿')).toEqual({ value: 120000000, hasPlus: false })
  })

  it('解析 "亿+" 格式', () => {
    expect(parseChineseNumber('1亿+')).toEqual({ value: 100000000, hasPlus: true })
    expect(parseChineseNumber('1.5亿+')).toEqual({ value: 150000000, hasPlus: true })
  })

  it('解析普通数字（无单位）', () => {
    expect(parseChineseNumber('0')).toEqual({ value: 0, hasPlus: false })
    expect(parseChineseNumber('999')).toEqual({ value: 999, hasPlus: false })
    expect(parseChineseNumber('1500')).toEqual({ value: 1500, hasPlus: false })
  })

  it('解析带 "+" 的普通数字', () => {
    expect(parseChineseNumber('1500+')).toEqual({ value: 1500, hasPlus: true })
    expect(parseChineseNumber('999+')).toEqual({ value: 999, hasPlus: true })
  })

  it('处理边界情况', () => {
    expect(parseChineseNumber('')).toEqual({ value: 0, hasPlus: false })
    expect(parseChineseNumber('   ')).toEqual({ value: 0, hasPlus: false })
    expect(parseChineseNumber('abc')).toEqual({ value: 0, hasPlus: false })
  })
})

describe('ensureHttps — HTTPS 协议转换', () => {
  it('http 转 https', () => {
    expect(ensureHttps('http://i0.hdslb.com/bfs/archive/xxx.jpg')).toBe(
      'https://i0.hdslb.com/bfs/archive/xxx.jpg',
    )
  })

  it('已经是 https 保持不变', () => {
    expect(ensureHttps('https://i0.hdslb.com/bfs/archive/xxx.jpg')).toBe(
      'https://i0.hdslb.com/bfs/archive/xxx.jpg',
    )
  })

  it('空字符串和异常值处理', () => {
    expect(ensureHttps('')).toBe('')
    // @ts-expect-error 测试边界情况
    expect(ensureHttps(null)).toBe(null)
    // @ts-expect-error 测试边界情况
    expect(ensureHttps(undefined)).toBe(undefined)
  })

  it('协议相对 URL（//开头）保持不变', () => {
    // 协议相对 URL 没有明确的 http:// 前缀，不应被替换
    expect(ensureHttps('//i0.hdslb.com/bfs/archive/xxx.jpg')).toBe(
      '//i0.hdslb.com/bfs/archive/xxx.jpg',
    )
  })
})

describe('dedupByBvid — BV 号去重', () => {
  it('按 bvid 去重，保持首次出现', () => {
    const list = [
      { bvid: 'BV1xx', title: 'First' },
      { bvid: 'BV2yy', title: 'Second' },
      { bvid: 'BV1xx', title: 'Duplicate' },
      { bvid: 'BV3zz', title: 'Third' },
      { bvid: 'BV2yy', title: 'Duplicate 2' },
    ]

    const result = dedupByBvid(list)
    expect(result).toHaveLength(3)
    expect(result[0].title).toBe('First')
    expect(result[1].title).toBe('Second')
    expect(result[2].title).toBe('Third')
  })

  it('空数组返回空数组', () => {
    expect(dedupByBvid([])).toEqual([])
  })

  it('单个元素数组返回原数组', () => {
    const list = [{ bvid: 'BV1xx', title: 'Only' }]
    expect(dedupByBvid(list)).toEqual(list)
  })

  it('全部唯一时不减少元素', () => {
    const list = [
      { bvid: 'BV1xx', title: 'A' },
      { bvid: 'BV2yy', title: 'B' },
      { bvid: 'BV3zz', title: 'C' },
    ]
    expect(dedupByBvid(list)).toHaveLength(3)
  })

  it('全部重复时只保留第一个', () => {
    const list = [
      { bvid: 'BV1xx', title: 'First' },
      { bvid: 'BV1xx', title: 'Second' },
      { bvid: 'BV1xx', title: 'Third' },
    ]
    const result = dedupByBvid(list)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('First')
  })

  it('处理空 bvid 字符串的条目', () => {
    const list = [
      { bvid: '', title: 'Empty' },
      { bvid: 'BV1xx', title: 'Valid' },
      { bvid: '', title: 'Empty Duplicate' },
    ]
    const result = dedupByBvid(list)
    // 空字符串也被视为有效 key，去重后保留第一个
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('Empty')
    expect(result[1].title).toBe('Valid')
  })
})
