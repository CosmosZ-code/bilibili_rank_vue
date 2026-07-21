/**
 * useBanner 纯函数单元测试
 *
 * 测试不依赖 Vue/Nuxt 运行时的纯函数：
 * - lerp: 线性插值
 * - calcLayerTransform: 图层变换计算（移植原 index.js animate 逻辑）
 * - calcCompensate: 视窗补偿
 */
import { describe, it, expect } from 'vitest'
import {
  lerp,
  calcLayerTransform,
  calcCompensate,
} from '../../app/composables/useBanner'
import type { BannerLayerData } from '../../app/types'

describe('lerp — 线性插值', () => {
  it('amt=0 时返回 start', () => {
    expect(lerp(10, 100, 0)).toBe(10)
    expect(lerp(-5, 5, 0)).toBe(-5)
  })

  it('amt=1 时返回 end', () => {
    expect(lerp(10, 100, 1)).toBe(100)
  })

  it('amt=0.5 时返回中点', () => {
    expect(lerp(0, 100, 0.5)).toBe(50)
    expect(lerp(100, 0, 0.5)).toBe(50)
  })

  it('支持外推（amt 超出 [0, 1] 范围）', () => {
    expect(lerp(0, 100, 2)).toBe(200)
    expect(lerp(0, 100, -1)).toBe(-100)
  })

  it('start = end 时返回值不变', () => {
    expect(lerp(50, 50, 0.3)).toBe(50)
    expect(lerp(50, 50, 0)).toBe(50)
    expect(lerp(50, 50, 1)).toBe(50)
  })
})

describe('calcCompensate — 视窗补偿', () => {
  const BASE = 1650

  it('窗口宽度小于基准宽度时返回 1', () => {
    expect(calcCompensate(1024)).toBe(1)
    expect(calcCompensate(800)).toBe(1)
    expect(calcCompensate(1650)).toBe(1)
  })

  it('窗口宽度大于基准宽度时按比例放大', () => {
    expect(calcCompensate(3300)).toBe(2)
    expect(calcCompensate(2475)).toBe(1.5)
    expect(calcCompensate(1920)).toBeCloseTo(1.1636, 3)
  })
})

describe('calcLayerTransform — 图层变换计算', () => {
  // 简单图层：静止，无加速度，无特殊效果
  const simpleLayer: BannerLayerData = {
    src: 'test.webp',
    transform: [1, 0, 0, 1, 0, 0],
    width: 1650,
    a: 0.01,
  }

  // 复杂图层：有旋转、缩放、透明度、垂直偏移
  const complexLayer: BannerLayerData = {
    src: 'test2.webp',
    transform: [1, 0, 0, 1, -240, -5],
    width: 457.5,
    a: 0.035,
    deg: -Math.PI / 60000,
    f: 0.0001,
    g: -0.02,
    opacity: [0.1, 1],
  }

  const windowWidth = 1920

  it('鼠标跟随模式：transform 是有效的 CSS matrix 字符串', () => {
    const result = calcLayerTransform(simpleLayer, 200, windowWidth)
    expect(typeof result.transform).toBe('string')
    expect(result.transform).toMatch(/^matrix\(/)
  })

  it('鼠标跟随模式：moveX=0 时变换接近初始状态', () => {
    const result = calcLayerTransform(simpleLayer, 0, windowWidth)
    // matrix(1,0,0,1,0,0) — 单位矩阵
    expect(result.transform).toContain('matrix(1,0,0,1,0,0)')
  })

  it('鼠标跟随模式：moveX 越大位移越大', () => {
    const r1 = calcLayerTransform(simpleLayer, 100, windowWidth)
    const r2 = calcLayerTransform(simpleLayer, 500, windowWidth)

    // 提取 translateX 值
    const tx1 = parseFloat(r1.transform.split(',')[4])
    const tx2 = parseFloat(r2.transform.split(',')[4])

    // tx2 应该大于 tx1（a=0.01 → tx = moveX * 0.01）
    expect(Math.abs(tx2)).toBeGreaterThan(Math.abs(tx1))
  })

  it('回位模式：progress=0 时等于鼠标跟随状态', () => {
    const moveXVal = 200
    const following = calcLayerTransform(simpleLayer, moveXVal, windowWidth)
    const homing = calcLayerTransform(simpleLayer, moveXVal, windowWidth, 0)

    expect(homing.transform).toBe(following.transform)
  })

  it('回位模式：progress=1 时恢复到初始状态', () => {
    const moveXVal = 500
    const result = calcLayerTransform(simpleLayer, moveXVal, windowWidth, 1)
    // 回到原始矩阵
    expect(result.transform).toContain('matrix(1,0,0,1,0,0)')
  })

  it('复杂图层：包含旋转 + 缩放 + 透明度 + 垂直偏移', () => {
    const result = calcLayerTransform(complexLayer, 300, windowWidth)

    // 验证返回格式
    expect(typeof result.transform).toBe('string')
    expect(result.transform).toMatch(/^matrix\(/)

    // 透明度应被计算（如果 opacity 字段存在）
    if (complexLayer.opacity) {
      expect(typeof result.opacity).toBe('number')
    }
  })

  it('复杂图层：回位模式 progress=1 回到初始不透明度', () => {
    const result = calcLayerTransform(complexLayer, 300, windowWidth, 1)

    // progress=1 时 opacity 应接近原始值 [0]=0.1
    if (result.opacity !== undefined) {
      expect(result.opacity).toBeCloseTo(0.1, 1)
    }
  })

  it('图层不含 opacity 时不返回 opacity 字段', () => {
    const { opacity: _, ...noOpacity } = complexLayer
    const result = calcLayerTransform(noOpacity, 300, windowWidth)
    expect(result.opacity).toBeUndefined()
  })

  it('不同的 transform 初始 tx/ty 值正确处理', () => {
    const layerWithOffset: BannerLayerData = {
      src: 'test3.webp',
      transform: [1, 0, 0, 1, 100, 50], // tx=100, ty=50
      width: 800,
      a: 0.05,
    }

    // moveX=0 时应反映原始偏移
    const result = calcLayerTransform(layerWithOffset, 0, windowWidth)
    const parts = result.transform.match(/matrix\(([^)]+)\)/)![1].split(',').map(Number)
    expect(parts[4]).toBe(100) // tx
    expect(parts[5]).toBe(50) // ty
  })

  it('正向和负向 moveX 产生相反的变换效果', () => {
    const rPos = calcLayerTransform(simpleLayer, 200, windowWidth)
    const rNeg = calcLayerTransform(simpleLayer, -200, windowWidth)

    const txPos = parseFloat(rPos.transform.split(',')[4])
    const txNeg = parseFloat(rNeg.transform.split(',')[4])

    // a=0.01 → tx = 0 + 200*0.01 = 2 (正向)
    // a=0.01 → tx = 0 + (-200)*0.01 = -2 (负向)
    expect(txPos).toBeGreaterThan(0)
    expect(txNeg).toBeLessThan(0)
  })

  it('deg 旋转角度影响矩阵值', () => {
    const layerWithDeg: BannerLayerData = {
      src: 'rotation.webp',
      transform: [1, 0, 0, 1, 0, 0],
      width: 500,
      a: 0.01,
      deg: Math.PI / 4, // 45 度（大角度便于观察变化）
    }

    const moveXVal = 100
    // 期望旋转 100 * π/4 = 25π ≈ 78.5 度
    const result = calcLayerTransform(layerWithDeg, moveXVal, windowWidth)
    const parts = result.transform.match(/matrix\(([^)]+)\)/)![1].split(',').map(Number)

    // 旋转后 [1,0,0,1] 矩阵变为 [cos, sin, -sin, cos]
    // cos(78.5°) ≈ 0.2, sin(78.5°) ≈ 0.98
    // 因为有 scale=1，所以 m11 ≈ cos, m21 ≈ -sin
    expect(parts[0]).not.toBe(1) // m11 != 1（因为有旋转）
    expect(parts[2]).not.toBe(0) // m21 != 0
  })

  it('f 缩放因子产生缩放效果', () => {
    const layerWithScale: BannerLayerData = {
      src: 'scale.webp',
      transform: [1, 0, 0, 1, 0, 0],
      width: 500,
      a: 0.01,
      f: 0.001, // 缩放 = f * moveX + 1 = 0.001 * 100 + 1 = 1.1
    }

    const moveXVal = 100
    const result = calcLayerTransform(layerWithScale, moveXVal, windowWidth)
    const parts = result.transform.match(/matrix\(([^)]+)\)/)![1].split(',').map(Number)

    // scale = 1.1, m11 = a * s = 1 * 1.1 = 1.1
    expect(parts[0]).toBeCloseTo(1.1, 5)
  })

  it('g 垂直偏移因子产生 translateY 效果', () => {
    const layerWithG: BannerLayerData = {
      src: 'vertical.webp',
      transform: [1, 0, 0, 1, 0, 0],
      width: 500,
      a: 0.01,
      g: -0.02,
    }

    const moveXVal = 100
    const result = calcLayerTransform(layerWithG, moveXVal, windowWidth)
    const parts = result.transform.match(/matrix\(([^)]+)\)/)![1].split(',').map(Number)

    // translateY = g * moveX = -0.02 * 100 = -2
    expect(parts[5]).toBeCloseTo(-2, 5)
  })

  it('回位模式：rotation 回位到 0', () => {
    const layerWithDeg: BannerLayerData = {
      src: 'rotate-back.webp',
      transform: [1, 0, 0, 1, 0, 0],
      width: 500,
      a: 0.01,
      deg: Math.PI / 60000,
    }

    const moveXVal = 300
    const result = calcLayerTransform(layerWithDeg, moveXVal, windowWidth, 1)

    // progress=1 时 deg=0, 矩阵回到单位矩阵
    expect(result.transform).toContain('matrix(1,0,0,1,0,0)')
  })
})
