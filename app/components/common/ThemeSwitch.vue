<template>
  <button
    class="theme-switch"
    :class="`theme-switch--${variant}`"
    :aria-label="`切换主题，当前${modeLabel}`"
    :title="`主题：${modeLabel}，点击切换到${nextLabel}`"
    @click="cycleTheme"
  >
    <!-- 太阳：日间（按用户选择的三态模式显示，auto 时显示半日半月以示区分） -->
    <svg v-if="theme === 'light'" class="theme-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="4.5" />
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
      <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
      <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
      <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
    </svg>
    <!-- 月亮：夜间 -->
    <svg v-else-if="theme === 'dark'" class="theme-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
    <!-- 半日半月：跟随系统 -->
    <svg v-else class="theme-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2v16a8 8 0 0 1 0-16z" />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { nextTheme, type ThemeMode } from '../../composables/useTheme'

withDefaults(defineProps<{
  /** float：桌面右下角常驻悬浮按钮；sidebar：移动端侧栏 header 紧凑按钮 */
  variant?: 'float' | 'sidebar'
}>(), {
  variant: 'float',
})

// 图标按用户选择的三态模式（theme）显示：auto 显示半日半月，与 resolvedTheme 区分开
const { theme, cycleTheme } = useTheme()

const MODE_LABEL: Record<ThemeMode, string> = {
  light: '日间',
  dark: '夜间',
  auto: '跟随系统',
}

const modeLabel = computed(() => MODE_LABEL[theme.value])
const nextLabel = computed(() => MODE_LABEL[nextTheme(theme.value)])
</script>

<style scoped>
/* 三态切换按钮：图标颜色跟随文字色（light 模式深色图标，dark 模式浅色图标） */
.theme-switch {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--text-2);
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;
}

.theme-switch:hover {
  color: var(--b-pink);
}

/* 桌面端：右下角回顶按钮上方的常驻悬浮按钮。
   transition: all 与 BackToTop 一致，保证 hover 上浮/阴影平滑。
   图标常驻品牌粉（与回顶按钮一致，hover 不变色） */
.theme-switch--float {
  position: fixed;
  bottom: 130px;
  right: 30px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--bg-card);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  z-index: 999;
  color: var(--b-pink);
  transition: all 0.3s;
}

.theme-switch--float:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* 移动端：侧栏 header 紧凑按钮（图标常驻品牌粉，与桌面按钮一致） */
.theme-switch--sidebar {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  color: var(--b-pink);
}

.theme-switch--sidebar:active {
  background: rgba(0, 0, 0, 0.08);
}

.theme-icon {
  flex-shrink: 0;
}

/* 移动端不显示悬浮按钮（入口在侧栏 header） */
@media (max-width: 768px) {
  .theme-switch--float {
    display: none;
  }
}
</style>
