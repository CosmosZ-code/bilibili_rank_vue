import { defineConfig } from 'unocss'

export default defineConfig({
  // UnoCSS 配置 — B站色系快捷方式
  shortcuts: {
    'btn': 'border border-solid border-gray-300 rounded px-4 py-2 cursor-pointer transition-all duration-300',
    'btn-active': 'bg-[var(--b-pink)] text-white border-[var(--b-pink)]',
    'btn-hover': 'hover:bg-[var(--b-pink)] hover:text-white hover:border-[var(--b-pink)]',
  },
  theme: {
    colors: {
      'b-pink': '#fb7299',
      'b-blue': '#00AEEC',
    },
  },
})
