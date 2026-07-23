/**
 * useScrollToTop — 返回顶部逻辑
 *
 * 管理返回顶部按钮的显示/隐藏 + 点击行为
 * 对应原 index.html 中的 backToTopBtn 逻辑
 */
export function useScrollToTop(scrollThreshold: number = 300) {
  const showButton = ref(false)

  /**
   * 滚动监听（更新按钮可见性）
   */
  function onScroll() {
    if (typeof window !== 'undefined') {
      showButton.value = window.scrollY > scrollThreshold
    }
  }

  /**
   * 滚动到顶部 + 刷新数据
   *
   * 流程：平滑滚动到顶 → 等滚动结束 → 刷新数据 → 等 DOM 更新 → 再次锚定顶部
   * 避免移动端因骨架屏/卡片高度变化导致布局抖动触发下拉刷新
   */
  function scrollToTop(refreshCallback?: () => void) {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })

      const doRefresh = () => {
        if (refreshCallback) {
          refreshCallback()
          // 数据刷新后 DOM 会更新（骨架屏 ↔ 真实卡片），
          // 等 Vue 完成渲染后再次确保滚动位置在顶部
          nextTick(() => {
            window.scrollTo({ top: 0, behavior: 'instant' })
          })
        }
      }

      if ('onscrollend' in window) {
        window.addEventListener('scrollend', doRefresh, { once: true })
      } else {
        // 移动端平滑滚动可能超过 500ms，降级延迟给到 1000ms
        setTimeout(doRefresh, 1000)
      }
    } else if (refreshCallback) {
      refreshCallback()
    }
  }

  // 注册/注销滚动监听
  onMounted(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', onScroll, { passive: true })
    }
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', onScroll)
    }
  })

  return {
    showButton,
    scrollToTop,
    onScroll,
  }
}
