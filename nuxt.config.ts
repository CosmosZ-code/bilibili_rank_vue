// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // 禁用组件目录前缀（BackToTop 而非 CommonBackToTop）
  components: [{ path: "~/components", pathPrefix: false }],
  devtools: { enabled: true },

  // Modules
  modules: [
    '@unocss/nuxt',
    '@nuxt/test-utils/module',
  ],

  // Runtime config (server-side secrets)
  runtimeConfig: {
    // Encryption key for B站 Cookie storage (override via NUXT_ENCRYPT_KEY env)
    encryptKey: process.env.NUXT_ENCRYPT_KEY || 'dev-encrypt-key-change-in-production',
    // B站 API base URL
    bilibili: {
      apiBase: 'https://api.bilibili.com',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    // 排行榜缓存刷新间隔（毫秒），默认 4 分钟（env: NUXT_CACHE_WARMER_REFRESH_INTERVAL_MS）
    cacheWarmer: {
      refreshIntervalMs: Number(process.env.NUXT_CACHE_WARMER_REFRESH_INTERVAL_MS) || 4 * 60 * 1000,
    },
  },

  // Nitro server config
  nitro: {
    // 部署预设：node-server（可改为 vercel, cloudflare-pages, netlify 等）
    preset: 'node-server',
    storage: {
      // Cache storage (memory in dev, can use Redis in production)
      cache: {
        driver: 'memory',
      },
      // Cookie storage (must be persistent in production)
      bilibili: {
        driver: 'memory', // 生产环境建议使用 Redis: { driver: 'redis', host: '...' }
      },
    },
  },

  // UnoCSS config
  unocss: {
    // Nuxt module auto-detects uno.config.ts
  },

  // TypeScript
  typescript: {
    strict: true,
  },

  // Global CSS
  css: ['~/assets/css/main.css'],
})
