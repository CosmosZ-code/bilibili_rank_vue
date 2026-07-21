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
   */
  function scrollToTop(refreshCallback?: () => void) {
    if (typeof window !== 'undefined') {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }
    // 可选：触发数据刷新
    if (refreshCallback) {
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
