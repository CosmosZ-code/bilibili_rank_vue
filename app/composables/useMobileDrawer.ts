/**
 * useMobileDrawer — 移动端侧栏抽屉开合状态
 *
 * 模块级单例（懒初始化，避免纯 Node 单元测试环境加载 Vue 依赖）：
 * MobileTopBar（汉堡按钮）与 MobileSidebar（抽屉面板）共享同一状态。
 */

let _isOpen: Ref<boolean> | null = null

export function useMobileDrawer() {
  if (!_isOpen) {
    _isOpen = ref(false)
  }
  const isOpen = _isOpen

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  function toggle() {
    isOpen.value = !isOpen.value
  }

  return { isOpen, open, close, toggle }
}
