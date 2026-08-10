<template>
  <div class="mobile-top-bar" :class="{ 'mobile-top-bar--hidden': isHidden }">
    <button class="menu-btn" aria-label="打开菜单" @click="toggle">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
      </svg>
    </button>
    <BilibiliLogin />
  </div>
</template>

<script setup lang="ts">
// 移动端顶部导航条：仅手机端显示。
// BannerContainer 在 <=768px 时整体隐藏（含桌面导航栏与登录按钮），
// 因此这里提供独立的登录入口。
// 交互：向下滚动自动隐藏（避免遮挡内容），向上滚动重新显示（顶部区域常驻）。
// 左侧汉堡按钮展开侧栏（MobileSidebar：收纳搜索/过滤/已屏蔽UP 控件）。

const { toggle } = useMobileDrawer()

const isHidden = ref(false)
let lastScrollY = 0
let ticking = false

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
  /* 透明底 + 毛玻璃：模糊透过的内容，本身不设底色 */
  background: transparent;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 200;
  transition: transform 0.3s ease;
}

/* 向下滚动后隐藏（移出屏幕） */
.mobile-top-bar--hidden {
  transform: translateY(-100%);
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

@media (min-width: 769px) {
  .mobile-top-bar {
    display: none;
  }
}
</style>
