/**
 * 运行时 polyfill（仅客户端）
 *
 * 通过 core-js 静态导入补齐旧浏览器（iOS 12+ / Safari 12+）缺失的运行时 API。
 * 与启动前内联脚本（app/utils/polyfills.ts）的分工：
 * - 内联脚本：hydration 启动路径必调的 API（Object.hasOwn、Array/String.at、
 *   AbortController——ofetch 模块求值期捕获引用，必须最先定义）
 * - 本插件：其余运行时 API（Vue 3.5 响应式数组增强方法、Object.fromEntries 等，
 *   组件/逻辑代码运行时才调用，插件阶段定义即可）
 *
 * 裁剪说明（2026-08-16，依据 .output 产物调用点扫描）：
 * - has-own / at / at-alternative 与内联脚本完全冗余（内联先执行，此处空转）→ 不导入
 * - promise.all-settled / promise.any / string.replace-all 客户端产物 0 调用点 → 不导入
 *   （若未来依赖引入调用点，test/e2e/build-output.e2e.spec.ts 的记录性断言会报警）
 * - find-last / to-sorted 等保留：Vue 3.5 响应式数组 instrumentation 在旧引擎上
 *   会暴露这些方法，一旦被调用即 TypeError（防御性）
 *
 * core-js 模块在 API 已存在时零开销（内部检测存在性）。
 */
import 'core-js/modules/es.array.find-last.js'
import 'core-js/modules/es.array.find-last-index.js'
import 'core-js/modules/es.array.to-sorted.js'
import 'core-js/modules/es.array.to-reversed.js'
import 'core-js/modules/es.array.to-spliced.js'
import 'core-js/modules/es.array.with.js'
import 'core-js/modules/es.object.from-entries.js'
import 'core-js/modules/es.array.flat.js'
import 'core-js/modules/es.array.flat-map.js'

export default defineNuxtPlugin(() => {
  // 仅依赖上述 import 的副作用（API 缺失时补齐），无额外逻辑
})
