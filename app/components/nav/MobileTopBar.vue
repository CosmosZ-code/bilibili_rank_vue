<template>
  <div ref="topBarRef" class="mobile-top-bar" :class="{ 'mobile-top-bar--hidden': isHidden }">
    <button class="menu-btn" aria-label="打开菜单" @click="toggle">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
      </svg>
    </button>

    <!-- 视频/直播切换（compact 透明描边样式，绝对居中） -->
    <ViewSwitch
      class="topbar-switch"
      compact
      :view-mode="viewMode"
      :area-id="areaId"
      :areas="areas"
      @update:view-mode="$emit('update:viewMode', $event)"
      @update:area-id="$emit('update:areaId', $event)"
    />

    <BilibiliLogin />
  </div>
</template>

<script setup lang="ts">
import type { ViewMode, LiveArea } from '../../types'

// 移动端顶部导航条：仅手机端显示。
// BannerContainer 在 <=768px 时整体隐藏（含桌面导航栏与登录按钮），
// 因此这里提供独立的登录入口。
// 交互：向下滚动自动隐藏（避免遮挡内容），向上滚动重新显示（顶部区域常驻）。
// 布局：☰ 侧栏按钮（左）｜视频/直播切换（中）｜登录/头像（右）。

defineProps<{
  viewMode: ViewMode
  areaId: number
  areas: LiveArea[]
}>()

defineEmits<{
  'update:viewMode': [value: ViewMode]
  'update:areaId': [value: number]
}>()

const { toggle } = useMobileDrawer()

const isHidden = ref(false)
let lastScrollY = 0
let ticking = false

const topBarRef = ref<HTMLElement>()

function onScroll() {
  // rAF 节流，避免频繁触发样式更新
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    const scrollY = window.scrollY

    // 顶部区域（含 iOS 下拉回弹的负值）始终显示
    if (scrollY <= 80) {
      isHidden.value = false
    } else if (scrollY > lastScrollY + 4) {
      // 向下滚动 → 隐藏
      isHidden.value = true
    } else if (scrollY < lastScrollY - 4) {
      // 向上滚动 → 显示
      isHidden.value = false
    }

    lastScrollY = scrollY
    ticking = false
  })
}

onMounted(() => {
  // 安卓部分浏览器对构建后的 scoped CSS backdrop-filter 渲染不稳定。
  if (topBarRef.value) {
    topBarRef.value.style.backdropFilter = 'blur(8px)'
    topBarRef.value.style.webkitBackdropFilter = 'blur(8px)'
  }
  lastScrollY = window.scrollY
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<style scoped>
.mobile-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
  padding: 0 14px;
  /* 透明白底 + 毛玻璃：白底半透明，模糊透过的内容（日/夜间由 --surface-glass 切换） */
  background: var(--surface-glass);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 200;
  transition: transform 0.3s ease;
}

/* 完全不支持 backdrop-filter 的旧设备：近不透明白底，避免内容直接透出（看起来透明） */
@supports not ((backdrop-filter: blur(8px)) or (-webkit-backdrop-filter: blur(8px))) {
  .mobile-top-bar {
    background: var(--surface-glass-solid);
  }
}

/* 向下滚动后隐藏（移出屏幕） */
.mobile-top-bar--hidden {
  transform: translateY(-100%);
}

/* 切换按钮绝对居中（不受左右元素宽度影响） */
.topbar-switch {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  background: none;
  color: var(--b-gray);
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.menu-btn:active {
  background: rgba(0, 0, 0, 0.08);
}

/* 桌面端隐藏顶栏：断点与 controls 隐藏（RankingControls max-width: 768px）共用 768 */
.mobile-top-bar {
  display: none;
}

@media (max-width: 768px) {
  .mobile-top-bar {
    display: flex;
  }
}
</style>
