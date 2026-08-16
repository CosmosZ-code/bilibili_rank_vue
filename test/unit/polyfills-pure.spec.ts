/**
 * POLYFILL_SCRIPT（内联 polyfill）纯逻辑单元测试
 *
 * 生产代码：app/utils/polyfills.ts 导出的 POLYFILL_SCRIPT（ES5 IIFE 字符串），
 * 由 app.vue 以 head 内联脚本注入，先于一切 bundle 模块执行。
 *
 * 覆盖三类 shim 的语义：
 * - Object.hasOwn（Safari 15.4+，Nuxt/devalue payload 解析依赖）
 * - Array/String.prototype.at（Safari 15.4+，Nuxt router afterEach 依赖）
 * - AbortController/AbortSignal（iOS 12.0/12.1 缺失，ofetch 模块求值期捕获引用）
 *
 * 兼容目标：iOS 12+（Safari 12+）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { POLYFILL_SCRIPT } from '../../app/utils/polyfills'

// 被 polyfill 触及的全局项：测试间保存/恢复，避免互相污染
const GLOBAL_KEYS = ['AbortController', 'AbortSignal'] as const

/** 保存全局原生引用（可能为 undefined，恢复时对应 delete） */
const savedGlobals = new Map<string, unknown>()

beforeEach(() => {
  for (const k of GLOBAL_KEYS) {
    savedGlobals.set(k, (globalThis as any)[k])
  }
})

afterEach(() => {
  for (const k of GLOBAL_KEYS) {
    const original = savedGlobals.get(k)
    if (original === undefined) {
      delete (globalThis as any)[k]
    } else {
      ;(globalThis as any)[k] = original
    }
  }
})

/** 在全局作用域执行生产 polyfill 脚本（new Function 与浏览器内联脚本同为全局作用域） */
function runPolyfillScript(): void {
  // eslint-disable-next-line no-new-func
  new Function(POLYFILL_SCRIPT)()
}

/** 删除目标 API 后执行 polyfill（模拟 iOS 12/14 缺失环境） */
function runPolyfillInDegradedEnv(): void {
  delete (Object as any).hasOwn
  delete (Array.prototype as any).at
  delete (String.prototype as any).at
  delete (globalThis as any).AbortController
  delete (globalThis as any).AbortSignal
  runPolyfillScript()
}

describe('POLYFILL_SCRIPT — Object.hasOwn', () => {
  it('缺失环境下补齐 Object.hasOwn，语义与规范一致', () => {
    runPolyfillInDegradedEnv()

    expect(typeof Object.hasOwn).toBe('function')
    // 自有属性
    expect(Object.hasOwn({ a: 1 }, 'a')).toBe(true)
    // 继承属性不是自有属性
    expect(Object.hasOwn({ a: 1 }, 'toString')).toBe(false)
    expect(Object.hasOwn(Object.create({ a: 1 }), 'a')).toBe(false)
    // 原型为 null 的对象
    expect(Object.hasOwn(Object.create(null), 'x')).toBe(false)
    const nullProto = Object.create(null)
    Object.defineProperty(nullProto, 'x', { value: 1 })
    expect(Object.hasOwn(nullProto, 'x')).toBe(true)
    // 非对象参数按 ToObject 转换（与规范一致）
    expect(Object.hasOwn('str', 'length')).toBe(true)
    expect(Object.hasOwn('str', '0')).toBe(true)
  })

  it('重复执行不覆盖已定义的 shim（幂等）', () => {
    runPolyfillInDegradedEnv()
    const shimmed = Object.hasOwn
    runPolyfillScript() // 再执行一次不应覆盖
    expect(Object.hasOwn).toBe(shimmed as any)
    expect(Object.hasOwn({ a: 1 }, 'a')).toBe(true)
  })
})

describe('POLYFILL_SCRIPT — Array/String.prototype.at', () => {
  it('缺失环境下补齐 Array.prototype.at，正/负/越界/NaN/小数截断语义正确', () => {
    runPolyfillInDegradedEnv()

    const arr = [10, 20, 30]
    expect(arr.at(0)).toBe(10)
    expect(arr.at(-1)).toBe(30)
    expect(arr.at(-2)).toBe(20)
    expect(arr.at(-3)).toBe(10)
    expect(arr.at(5)).toBeUndefined()
    expect(arr.at(-5)).toBeUndefined()
    expect(arr.at(NaN)).toBe(10)
    expect(arr.at(-1.7)).toBe(30) // 负数小数向零截断
    expect(arr.at(1.9)).toBe(20)
    expect(arr.at('1')).toBe(20) // 字符串索引
    expect(arr.at()).toBe(10) // 无参数 = 0
    expect([].at(0)).toBeUndefined()
    // 类数组对象（at 是泛型方法）
    expect(Array.prototype.at.call({ length: 2, 0: 'a', 1: 'b' }, -1)).toBe('b')
  })

  it('缺失环境下补齐 String.prototype.at', () => {
    runPolyfillInDegradedEnv()

    expect('abc'.at(0)).toBe('a')
    expect('abc'.at(-1)).toBe('c')
    expect('abc'.at(-3)).toBe('a')
    expect('abc'.at(3)).toBeUndefined()
    expect('abc'.at(-4)).toBeUndefined()
    expect('abc'.at(NaN)).toBe('a')
    expect(''.at(0)).toBeUndefined()
    expect('abc'.at(1.9)).toBe('b')
  })

  it('重复执行不覆盖已定义的 shim（幂等）', () => {
    runPolyfillInDegradedEnv()
    const shimmedArrayAt = Array.prototype.at
    const shimmedStringAt = String.prototype.at
    runPolyfillScript()
    expect(Array.prototype.at).toBe(shimmedArrayAt)
    expect(String.prototype.at).toBe(shimmedStringAt)
    expect([1, 2, 3].at(-1)).toBe(3)
    expect('abc'.at(-1)).toBe('c')
  })
})

describe('POLYFILL_SCRIPT — AbortController/AbortSignal shim', () => {
  it('缺失环境下补齐 AbortController，abort 状态/事件语义正确', () => {
    runPolyfillInDegradedEnv()

    const AC = (globalThis as any).AbortController
    const AS = (globalThis as any).AbortSignal
    expect(typeof AC).toBe('function')
    expect(typeof AS).toBe('function')

    const controller = new AC()
    const { signal } = controller
    expect(signal.aborted).toBe(false)
    expect(signal.reason).toBeUndefined()

    // abort 事件监听
    const fired: unknown[] = []
    signal.addEventListener('abort', (e: any) => fired.push(e))
    const ignored: unknown[] = []
    signal.addEventListener('other', (e: any) => ignored.push(e))

    controller.abort('request-canceled')
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe('request-canceled')
    expect(fired.length).toBe(1)
    expect(ignored.length).toBe(0)

    // 重复 abort 是 no-op
    controller.abort('again')
    expect(fired.length).toBe(1)
    expect(signal.reason).toBe('request-canceled')

    // removeEventListener
    let afterRemove = 0
    const cb = () => afterRemove++
    const c2 = new AC()
    c2.signal.addEventListener('abort', cb)
    c2.signal.removeEventListener('abort', cb)
    c2.abort()
    expect(afterRemove).toBe(0)
    expect(c2.signal.reason).toBeUndefined() // 无参 abort 时 reason 保持 undefined

    // ofetch 依赖 AbortSignal.timeout 不存在（走 ?. 特性检测）
    expect((globalThis as any).AbortSignal.timeout).toBeUndefined()
  })

  it('重复执行不覆盖已定义的 shim（幂等）', () => {
    runPolyfillInDegradedEnv()
    const shimmedAC = (globalThis as any).AbortController
    expect(shimmedAC.name).toBe('AbortControllerShim')
    runPolyfillScript()
    expect((globalThis as any).AbortController).toBe(shimmedAC)
  })
})

describe('POLYFILL_SCRIPT — 脚本整体', () => {
  it('脚本是可独立执行的 ES5 IIFE（无解析错误、无外部依赖）', () => {
    expect(POLYFILL_SCRIPT).toContain('Object.hasOwn')
    expect(POLYFILL_SCRIPT).toContain('AbortController')
    expect(() => runPolyfillScript()).not.toThrow()
  })

  it('原生环境（不删除任何 API）下执行不产生副作用', () => {
    const originalHasOwn = Object.hasOwn
    const originalArrayAt = Array.prototype.at
    runPolyfillScript()
    expect(Object.hasOwn).toBe(originalHasOwn)
    expect(Array.prototype.at).toBe(originalArrayAt)
  })
})
