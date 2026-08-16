/**
 * 启动前内联 polyfill（POLYFILL_SCRIPT）
 *
 * 背景：Nuxt 4.5 客户端运行时依赖 Safari 15.4+ 才有的运行时 API——
 * - `Object.hasOwn`：devalue payload 解析（hydration 第一个插件，无保护）
 * - `Array.prototype.at`：Nuxt router 插件 `to.matched.at(-1)`（每次导航）
 * - `AbortController`/`AbortSignal`：iOS 12.0/12.1 缺失，且 ofetch 在
 *   模块求值期捕获 `_globalThis.AbortController`、每请求 `new`——
 *   插件层的 polyfill 来不及，必须由 head 内联脚本（先于一切 bundle 模块）补齐
 *
 * 用法：app.vue 中 useHead script 数组首位注入（先于 THEME_INIT_SCRIPT），
 * HTML 解析期同步执行，保证任何 bundle 模块求值前生效。
 *
 * 约束：
 * - 必须保持 ES5 语法（目标设备是 iOS 12 / Safari 12，连 ?. 都解析不了）
 * - 自包含、无依赖、无副作用（仅在 API 缺失时定义）
 * - 语义与规范一致（Object.hasOwn 的 ToObject 转换、at 的 ToIntegerOrInfinity 截断）
 */

/**
 * Array/String.prototype.at 的公共实现（按规范语义）：
 * ToIntegerOrInfinity 向零截断（Math.trunc，NaN/undefined → 0），
 * 负索引加 length，越界返回 undefined。
 */
const AT_IMPL = `i = Math.trunc(i) || 0
      if (i < 0) i += this.length
      return i < 0 || i >= this.length ? undefined : this[i]`

export const POLYFILL_SCRIPT = `;(function () {
  // 1) Object.hasOwn（ES2022 / Safari 15.4+）— Nuxt/devalue payload 解析依赖
  if (!Object.hasOwn) {
    Object.hasOwn = function (o, k) {
      return Object.prototype.hasOwnProperty.call(o, k)
    }
  }
  // 2) Array.prototype.at（ES2022 / Safari 15.4+）— Nuxt router afterEach 依赖
  if (!Array.prototype.at) {
    Array.prototype.at = function (i) {
      ${AT_IMPL}
    }
  }
  // 3) String.prototype.at（ES2022 / Safari 15.4+）
  if (!String.prototype.at) {
    String.prototype.at = function (i) {
      ${AT_IMPL}
    }
  }
  // 4) AbortController / AbortSignal（iOS 12.0/12.1 缺失）
  var G = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : self)
  if (G && !G.AbortController) {
    function AbortSignalShim() {
      this.aborted = false
      this.reason = undefined
      this._listeners = []
    }
    AbortSignalShim.prototype.addEventListener = function (type, cb) {
      if (type === 'abort' && typeof cb === 'function') this._listeners.push(cb)
    }
    AbortSignalShim.prototype.removeEventListener = function (type, cb) {
      if (type !== 'abort') return
      for (var i = 0; i < this._listeners.length; i++) {
        if (this._listeners[i] === cb) {
          this._listeners.splice(i, 1)
          return
        }
      }
    }
    AbortSignalShim.prototype.dispatchEvent = function () { return true }
    function AbortControllerShim() { this.signal = new AbortSignalShim() }
    AbortControllerShim.prototype.abort = function (reason) {
      if (this.signal.aborted) return
      this.signal.aborted = true
      this.signal.reason = reason
      var list = this.signal._listeners.slice()
      for (var i = 0; i < list.length; i++) {
        try { list[i]({ type: 'abort', target: this.signal }) } catch (e) { /* 监听器异常不影响 abort 流程 */ }
      }
    }
    G.AbortController = AbortControllerShim
    G.AbortSignal = AbortSignalShim
  }
})()`
