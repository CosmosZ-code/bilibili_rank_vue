/**
 * 构建产物兼容看护 — 检查 .output 产物（test:e2e 前置 build，产物为最新）
 *
 * 1. 内联 polyfill 脚本先于 entry module 脚本（兼容代码合入前此断言红）
 * 2. 产物不含 iOS 12 无法解析的语法 token（?. / ?? / ??=；合入前红）
 * 3. 记录性断言：Object.hasOwn / matched.at 调用仍在产物中（运行时 API
 *    无法被转译，由 polyfill shim 覆盖——若未来这些调用点消失，说明 Nuxt
 *    升级后可能不再需要对应 shim，需同步更新）
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { $fetch } from '@nuxt/test-utils/e2e'

const OUTPUT_DIR = resolve(process.cwd(), '.output')
const PUBLIC_DIR = resolve(OUTPUT_DIR, 'public')
const NUXT_DIR = resolve(PUBLIC_DIR, '_nuxt')

// ============================================================
// 迷你词法扫描器：跳过字符串/模板串（含 ${} 插值）/注释/正则后统计目标 token
// ============================================================

interface TokenCounts {
  '?.': number
  '??': number
  '??=': number
}

function emptyCounts(): TokenCounts {
  return { '?.': 0, '??': 0, '??=': 0 }
}

function addCounts(target: TokenCounts, source: TokenCounts): void {
  target['?.'] += source['?.']
  target['??'] += source['??']
  target['??='] += source['??=']
}

const REGEX_PREFIX_PUNCT = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>'])
const REGEX_PREFIX_KEYWORDS = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await', 'instanceof', 'throw',
])

function isRegexStart(prev: string, prevWord: string): boolean {
  if (prev === '') return true
  if (REGEX_PREFIX_PUNCT.has(prev)) return true
  return REGEX_PREFIX_KEYWORDS.has(prevWord)
}

/** 跳过字符串/模板/注释/正则，返回扫描位置与内部 token 计数 */
function scanChunk(code: string, start: number, end: number, counts: TokenCounts): void {
  let i = start
  let prev = ''
  let prevWord = ''

  while (i < end) {
    const ch = code[i]
    const next = code[i + 1]

    // 行注释
    if (ch === '/' && next === '/') {
      while (i < end && code[i] !== '\n') i++
      continue
    }
    // 块注释
    if (ch === '/' && next === '*') {
      i += 2
      while (i < end && !(code[i] === '*' && code[i + 1] === '/')) i++
      i += 2
      prev = ''
      prevWord = ''
      continue
    }
    // 单/双引号字符串
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      while (i < end) {
        if (code[i] === '\\') {
          i += 2
          continue
        }
        if (code[i] === quote) {
          i++
          break
        }
        i++
      }
      prev = quote
      prevWord = ''
      continue
    }
    // 模板字符串（含 ${...} 插值递归）
    if (ch === '`') {
      i++
      while (i < end) {
        if (code[i] === '\\') {
          i += 2
          continue
        }
        if (code[i] === '`') {
          i++
          break
        }
        if (code[i] === '$' && code[i + 1] === '{') {
          const r = scanInterpolation(code, i + 2, end, counts)
          i = r
          continue
        }
        i++
      }
      prev = '`'
      prevWord = ''
      continue
    }
    // 正则字面量（启发式判定起点）
    if (ch === '/' && isRegexStart(prev, prevWord)) {
      i++
      let inClass = false
      while (i < end) {
        if (code[i] === '\\') {
          i += 2
          continue
        }
        if (code[i] === '[') inClass = true
        else if (code[i] === ']') inClass = false
        else if (code[i] === '/' && !inClass) {
          i++
          break
        }
        i++
      }
      // flags
      while (i < end && /[a-z]/i.test(code[i])) i++
      prev = '/'
      prevWord = ''
      continue
    }

    // 目标 token
    if (ch === '?' && next === '?') {
      if (code[i + 2] === '=') {
        counts['??=']++
        i += 3
      } else {
        counts['??']++
        i += 2
      }
      prev = '?'
      prevWord = ''
      continue
    }
    // 可选链 ?. 要求后面紧跟标识符开头 / [ / (（不含数字——
    // 排除压缩产物中「三元运算符 + 小数」的巧合，如 `a?.5` 是 `a ? .5`）
    if (ch === '?' && next === '.' && /[A-Za-z_$[(]/.test(code[i + 2] ?? '')) {
      counts['?.']++
      i += 2
      prev = '?'
      prevWord = ''
      continue
    }

    if (/[A-Za-z0-9_$]/.test(ch)) prevWord += ch
    else prevWord = ''
    if (!/\s/.test(ch)) prev = ch
    i++
  }
}

/** 扫描模板插值 ${...}（引号/注释/嵌套模板/正则感知，深度计数直到配对 }） */
function scanInterpolation(code: string, start: number, end: number, counts: TokenCounts): number {
  let i = start
  let depth = 1
  let prev = ''
  let prevWord = ''

  while (i < end) {
    const ch = code[i]
    const next = code[i + 1]

    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '{') {
      depth++
      i++
      continue
    }
    if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      while (i < end) {
        if (code[i] === '\\') {
          i += 2
          continue
        }
        if (code[i] === quote) {
          i++
          break
        }
        i++
      }
      prev = quote
      prevWord = ''
      continue
    }
    if (ch === '`') {
      i++
      while (i < end) {
        if (code[i] === '\\') {
          i += 2
          continue
        }
        if (code[i] === '`') {
          i++
          break
        }
        if (code[i] === '$' && code[i + 1] === '{') {
          i = scanInterpolation(code, i + 2, end, counts)
          continue
        }
        i++
      }
      prev = '`'
      prevWord = ''
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < end && code[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < end && !(code[i] === '*' && code[i + 1] === '/')) i++
      i += 2
      prev = ''
      prevWord = ''
      continue
    }
    if (ch === '/' && isRegexStart(prev, prevWord)) {
      i++
      let inClass = false
      while (i < end) {
        if (code[i] === '\\') {
          i += 2
          continue
        }
        if (code[i] === '[') inClass = true
        else if (code[i] === ']') inClass = false
        else if (code[i] === '/' && !inClass) {
          i++
          break
        }
        i++
      }
      while (i < end && /[a-z]/i.test(code[i])) i++
      prev = '/'
      prevWord = ''
      continue
    }
    if (ch === '?' && next === '?') {
      if (code[i + 2] === '=') {
        counts['??=']++
        i += 3
      } else {
        counts['??']++
        i += 2
      }
      prev = '?'
      prevWord = ''
      continue
    }
    // 可选链 ?. 要求后面紧跟标识符开头 / [ / (（排除三元 + 小数的巧合，如 `a?.5`）
    if (ch === '?' && next === '.' && /[A-Za-z_$[(]/.test(code[i + 2] ?? '')) {
      counts['?.']++
      i += 2
      prev = '?'
      prevWord = ''
      continue
    }
    if (/[A-Za-z0-9_$]/.test(ch)) prevWord += ch
    else prevWord = ''
    if (!/\s/.test(ch)) prev = ch
    i++
  }
  return i
}

function countSyntaxTokens(code: string): TokenCounts {
  const counts = emptyCounts()
  scanChunk(code, 0, code.length, counts)
  return counts
}

// ============================================================
// 扫描器自测（防误报：字符串/模板/注释/正则内容不算 token）
// ============================================================

describe('token 扫描器', () => {
  it('字符串、模板（含插值）、注释、正则内的 ?. / ?? 不误报', () => {
    expect(countSyntaxTokens('const s = "a?.b ?? c"')).toEqual({ '?.': 0, '??': 0, '??=': 0 })
    expect(countSyntaxTokens('// a?.b ?? c\nconst x = 1')).toEqual({ '?.': 0, '??': 0, '??=': 0 })
    expect(countSyntaxTokens('const r = /a?.b/')).toEqual({ '?.': 0, '??': 0, '??=': 0 })
    expect(countSyntaxTokens('const r2 = /a??b/')).toEqual({ '?.': 0, '??': 0, '??=': 0 })
    expect(countSyntaxTokens('const r3 = /[/]/.test(x)')).toEqual({ '?.': 0, '??': 0, '??=': 0 })
  })

  it('真实语法 token 正确计数（含模板插值内、嵌套模板）', () => {
    expect(countSyntaxTokens('a?.b ?? c ??= d')).toEqual({ '?.': 1, '??': 1, '??=': 1 })
    expect(countSyntaxTokens('const t = `x${a?.b}y`')).toEqual({ '?.': 1, '??': 0, '??=': 0 })
    expect(countSyntaxTokens('`${a ?? b}`')).toEqual({ '?.': 0, '??': 1, '??=': 0 })
    expect(countSyntaxTokens('x = "a" + `b${`c${d?.e}`}`')).toEqual({ '?.': 1, '??': 0, '??=': 0 })
    expect(countSyntaxTokens('f(a?.b, { c: d?.e }, "x??y")')).toEqual({ '?.': 2, '??': 0, '??=': 0 })
  })

  it('压缩产物中的三元 + 小数（`a?.5`）与可选链调用形式不误报/不漏报', () => {
    // `a ? .5 : b` 压缩形态——不是可选链
    expect(countSyntaxTokens('let x = a?.5 : 0;')).toEqual({ '?.': 0, '??': 0, '??=': 0 })
    expect(countSyntaxTokens('let x = n.sensitive?.25:0;')).toEqual({ '?.': 0, '??': 0, '??=': 0 })
    // 可选链的各种合法形式仍识别
    expect(countSyntaxTokens('a?.b')).toEqual({ '?.': 1, '??': 0, '??=': 0 })
    expect(countSyntaxTokens('a?.[0]')).toEqual({ '?.': 1, '??': 0, '??=': 0 })
    expect(countSyntaxTokens('a?.(fn)')).toEqual({ '?.': 1, '??': 0, '??=': 0 })
  })
})

// ============================================================
// 产物断言
// ============================================================

/** 读取所有产物 chunk 源码（排除 sourcemap） */
function readChunks(): { name: string; code: string }[] {
  const files = readdirSync(NUXT_DIR).filter((f) => f.endsWith('.js'))
  return files.map((name) => ({ name, code: readFileSync(resolve(NUXT_DIR, name), 'utf8') }))
}

describe('构建产物兼容看护', () => {
  it('产物目录存在（test:e2e 前置 build 保证产物最新）', () => {
    expect(existsSync(PUBLIC_DIR)).toBe(true)
    expect(existsSync(NUXT_DIR)).toBe(true)
  })

  it('index.html：内联 polyfill 脚本先于 entry module 脚本', async () => {
    // node-server 预设不产出静态 index.html（首页 HTML 由渲染器运行时生成），
    // 因此优先读产物文件，不存在则取共享服务器的运行时 HTML——两者均代表部署形态
    const htmlPath = resolve(PUBLIC_DIR, 'index.html')
    const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : await $fetch<string>('/')
    // POLYFILL_SCRIPT 的特征代码（app/utils/polyfills.ts 的 Object.hasOwn shim 赋值）
    const polyfillIdx = html.indexOf('Object.hasOwn = function')
    const entryIdx = html.indexOf('<script type="module" src="/_nuxt/')
    expect(polyfillIdx).toBeGreaterThanOrEqual(0)
    expect(entryIdx).toBeGreaterThanOrEqual(0)
    expect(polyfillIdx).toBeLessThan(entryIdx)
  })

  it('产物不含 iOS 12 无法解析的语法（?. / ?? / ??= 均为 0）', () => {
    const chunks = readChunks()
    expect(chunks.length).toBeGreaterThan(0)
    const total = { '?.': 0, '??': 0, '??=': 0 }
    const offenders: string[] = []
    for (const { name, code } of chunks) {
      const counts = countSyntaxTokens(code)
      total['?.'] += counts['?.']
      total['??'] += counts['??']
      total['??='] += counts['??=']
      if (counts['?.'] || counts['??'] || counts['??=']) {
        offenders.push(`${name}: ${JSON.stringify(counts)}`)
      }
    }
    expect(offenders, `存在高版本语法残留：\n${offenders.join('\n')}`).toEqual([])
    expect(total).toEqual({ '?.': 0, '??': 0, '??=': 0 })
  })

  it('记录性：Object.hasOwn 与 matched.at 调用仍在产物中（由 polyfill shim 覆盖）', () => {
    const chunks = readChunks()
    const all = chunks.map((c) => c.code).join('\n')
    // devalue payload 解析的 hasOwn 调用
    expect(all).toContain('Object.hasOwn(')
    // Nuxt router afterEach 的 matched.at(-1)
    expect(all).toContain('matched.at(')
  })

  it('旧浏览器兼容：产物不含 import map（#entry 引用）', async () => {
    // import map 是 Safari 16.4+ 特性。Nuxt 4.5 的 experimental.entryImportMap
    // 默认开启，会把入口引用改写为 `import "#entry"`——iOS 12~16.3 忽略
    // <script type="importmap"> 导致模块解析失败（页面空白）。
    // 修复：nuxt.config.ts 已显式关闭；此断言防 Nuxt 升级默认值变化或有人重开。
    const htmlPath = resolve(PUBLIC_DIR, 'index.html')
    const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : await $fetch<string>('/')
    expect(html).not.toContain('type="importmap"')
    const chunks = readChunks()
    for (const { name, code } of chunks) {
      expect(
        code,
        `${name} 含 #entry 引用——请确认 nuxt.config.ts 中 experimental.entryImportMap 为 false（旧设备无法解析 import map）`,
      ).not.toContain('#entry')
    }
  })

  it('记录性：被裁剪的 core-js API 在产物中无调用点（出现则需加回 polyfills.client.ts）', () => {
    // 与 app/plugins/polyfills.client.ts 的裁剪清单保持一致（2026-08-16 扫描产物为 0 调用点）：
    // 若 Nuxt/依赖升级引入调用点，对应 core-js 模块必须重新加回，否则旧浏览器会崩
    const chunks = readChunks()
    const all = chunks.map((c) => c.code).join('\n')
    const trimmed = [
      { api: 'Promise.allSettled(', module: 'es.promise.all-settled' },
      { api: 'Promise.any(', module: 'es.promise.any' },
      { api: '.replaceAll(', module: 'es.string.replace-all' },
    ]
    const hits = trimmed.filter(({ api }) => all.includes(api))
    const detail = hits.map((h) => `${h.api} → ${h.module}`).join('、')
    expect(
      hits,
      `产物中发现被裁剪 API 的调用点：${detail}——请将对应 core-js 模块加回 app/plugins/polyfills.client.ts`,
    ).toEqual([])
  })
})
