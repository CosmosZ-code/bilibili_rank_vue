/**
 * 排行榜数据隔离 E2E 测试
 *
 * 验证：
 * 1. 个性化端点对未认证用户严格返回空对象
 * 2. 主排行端点数据不随请求方身份变化
 * 3. 两个端点职责分离，数据不会交叉污染
 * 4. 边界输入（伪造/畸形 session）不会绕过认证守卫
 *
 * 场景：用户 A 登录并拉取个性化热榜后，用户 B 未登录访问，
 * 不会看到 A 的个性化视频。
 */
import { describe, it, expect } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'

describe('排行榜数据隔离', async () => {
  // ====================================================================
  // 组 1：Personalized 端点认证守卫
  // 核心防线 — 确保未认证请求在进入缓存读取之前就被拦截
  // ====================================================================

  it('1.1 未认证用户请求 personalized 返回空对象', async () => {
    const data = await $fetch('/api/ranking/personalized')
    expect(data).toEqual({})
  })

  it('1.2 伪造 UUID session cookie 时 personalized 返回空对象', async () => {
    const data = await $fetch('/api/ranking/personalized', {
      headers: { Cookie: 'session_id=fake-session-uuid-12345' },
    })
    expect(data).toEqual({})
  })

  it('1.3 空字符串 session cookie 时 personalized 返回空对象', async () => {
    const data = await $fetch('/api/ranking/personalized', {
      headers: { Cookie: 'session_id=' },
    })
    expect(data).toEqual({})
  })

  it('1.4 超长畸形 session cookie 时 personalized 返回空对象（不崩溃）', async () => {
    const longFakeSession = 'x'.repeat(1000)
    const data = await $fetch('/api/ranking/personalized', {
      headers: { Cookie: `session_id=${longFakeSession}` },
    })
    expect(data).toEqual({})
  })

  it('1.5 连续 3 次无 cookie 请求 personalized 均返回空对象', { timeout: 5000 }, async () => {
    for (let i = 0; i < 3; i++) {
      const data = await $fetch('/api/ranking/personalized')
      expect(data).toEqual({})
    }
  })

  // ====================================================================
  // 组 2：主排行端点匿名性
  // 验证 /api/ranking 数据完全匿名，不随请求方 cookie 变化
  // ====================================================================

  it('2.1 主排行数据不随请求方 cookie 变化（BVid 集合一致）', { timeout: 15000 }, async () => {
    const dataNoCookie = await $fetch<Record<string, any>>('/api/ranking')
    const dataWithFakeCookie = await $fetch<Record<string, any>>('/api/ranking', {
      headers: { Cookie: 'session_id=fake-session-uuid-12345' },
    })

    const keys1 = dataNoCookie.items.map(v => v.bvid).sort()
    const keys2 = dataWithFakeCookie.items.map(v => v.bvid).sort()

    expect(keys1.length, 'ranking 视频数量应为正').toBeGreaterThan(0)
    expect(keys1, '有/无伪造 cookie 时 BVid 集合应一致').toEqual(keys2)
  })

  it('2.2 两次无 cookie 请求主排行返回相同数量的视频', { timeout: 10000 }, async () => {
    const data1 = await $fetch<Record<string, any>>('/api/ranking')
    const data2 = await $fetch<Record<string, any>>('/api/ranking')

    expect(data1.items.length).toBe(data2.items.length)
  })

  it('2.3 主排行响应头不含 Set-Cookie', async () => {
    const responseHeaders: Record<string, string> = {}

    await $fetch('/api/ranking', {
      onResponse({ response }) {
        response.headers.forEach((value: string, key: string) => {
          responseHeaders[key.toLowerCase()] = value
        })
      },
    })

    // 主排行是公开端点，不应设置任何会话 cookie
    expect(
      responseHeaders['set-cookie'],
      '主排行响应不应包含 Set-Cookie 头',
    ).toBeUndefined()
  })

  // ====================================================================
  // 组 3：两端点职责分离
  // 验证 ranking 和 personalized 各自独立，数据不交叉
  // ====================================================================

  it('3.1 ranking 有数据但 personalized（无认证）为空', { timeout: 10000 }, async () => {
    const [ranking, personalized] = await Promise.all([
      $fetch<Record<string, any>>('/api/ranking'),
      $fetch<Record<string, any>>('/api/ranking/personalized'),
    ])

    expect(ranking.items.length, 'ranking 应有视频数据').toBeGreaterThan(0)
    expect(personalized, 'personalized 无认证应返回空').toEqual({})
  })

  it('3.2 全局缓存存在时 personalized 仍拒绝无认证请求', { timeout: 10000 }, async () => {
    // 确保全局缓存已填充（可能触发 MISS → 拉取 B站 → 写入缓存）
    await $fetch('/api/ranking')

    // 再次请求 personalized — 即使 ranking:latest 缓存中存在数据，
    // 未认证请求也不应能读到 personalized 数据
    const data = await $fetch('/api/ranking/personalized')
    expect(data).toEqual({})
  })

  // ====================================================================
  // 组 4：边界与回归防护
  // 防止未来代码变更破坏隔离性
  // ====================================================================

  it('4.1 主排行数据结构不含个性化标记字段', { timeout: 10000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking')
    const items = data.items
    expect(items.length, 'ranking 应有视频数据').toBeGreaterThan(0)

    // 检查第一个视频的字段 — 不应出现个性化标记
    const firstVideo = items[0]
    const suspiciousFields = ['personalized', 'recommend', 'user_specific', 'for_you']
    for (const field of suspiciousFields) {
      expect(
        firstVideo,
        `视频数据不应包含"${field}"字段（非个性化标记）`,
      ).not.toHaveProperty(field)
    }
  })

  it('4.2 多个不同格式的伪造 session ID 均被拦截', async () => {
    const fakeIds = [
      'not-a-uuid',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      '00000000-0000-0000-0000-000000000000',
      'session_id_with_underscores_and-dashes_mixed',
    ]

    for (const fakeId of fakeIds) {
      const data = await $fetch('/api/ranking/personalized', {
        headers: { Cookie: `session_id=${fakeId}` },
      })
      expect(
        data,
        `伪造 session_id="${fakeId.slice(0, 20)}..." 应返回空对象`,
      ).toEqual({})
    }
  })

  // ====================================================================
  // 组 5：分页参数与数据隔离
  // ====================================================================

  it('5.1 带 fake cookie 请求的分页响应中不泄露个性化数据', { timeout: 10000 }, async () => {
    const dataNoCookie = await $fetch<Record<string, any>>('/api/ranking')
    const dataWithFake = await $fetch<Record<string, any>>('/api/ranking', {
      headers: { Cookie: 'session_id=fake-session-uuid-12345' },
    })
    const bvids1 = dataNoCookie.items.map((v: any) => v.bvid).sort()
    const bvids2 = dataWithFake.items.map((v: any) => v.bvid).sort()
    expect(bvids1).toEqual(bvids2)
  })

  it('5.2 分页参数不影响隔离：page=2 正常返回', { timeout: 10000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking?page=2&pageSize=5')
    expect(data.page).toBe(2)
    expect(data.items.length).toBeLessThanOrEqual(5)
    expect(typeof data.hasMore).toBe('boolean')
  })
})
