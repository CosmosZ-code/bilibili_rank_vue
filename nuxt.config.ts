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
  },

  // Nitro server config
  nitro: {
    // 部署预设：Cloudflare Pages
    preset: 'cloudflare_pages',

    // 实验性功能：定时任务
    experimental: {
      tasks: true,
    },
    // 定时任务：每周日清除 Banner 缓存
    scheduledTasks: {
      '0 0 * * 0': ['refresh-banners'],
    },

    storage: {
      // 排行榜缓存（5 分钟 TTL）— Cloudflare KV
      cache: {
        driver: 'cloudflare-kv-binding',
        binding: 'RANKING_CACHE',
      },
      // Cookie 加密存储 — Cloudflare KV
      bilibili: {
        driver: 'cloudflare-kv-binding',
        binding: 'BILIBILI_STORE',
      },
    },

    // 本地开发时回退到文件系统
    devStorage: {
      cache: {
        driver: 'fs',
        base: './.nitro/data/cache',
      },
      bilibili: {
        driver: 'fs',
        base: './.nitro/data/bilibili',
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
