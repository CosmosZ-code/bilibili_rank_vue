import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
  ],
  test: {
    projects: [
      // Unit tests — fast, no Nuxt runtime, pure Node
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
      // E2E tests — all specs share one Nitro instance (global-setup.ts)
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.{test,spec}.ts'],
          environment: 'node',
          // 浏览器测试（createPage）会懒启动 Playwright，首次启动计入测试时间
          testTimeout: 30_000,
          globalSetup: [fileURLToPath(new URL('./test/e2e/global-setup.ts', import.meta.url))],
        },
      },
      // Nuxt runtime tests — full Nuxt context
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.{test,spec}.ts'],
          environment: 'nuxt',
        },
      }),
    ],
  },
})
