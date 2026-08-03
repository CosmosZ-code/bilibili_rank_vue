/**
 * 全局 Toast 通知管理
 *
 * 提供 showToast() 方法显示通知，支持多个实例堆叠
 */

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: number
  message: string
  type: ToastType
  visible: boolean
}

// 全局状态（模块级单例）
const toasts = ref<ToastItem[]>([])
let nextId = 0

/**
 * Toast 管理器
 */
export function useToast() {
  /**
   * 显示一条 Toast 通知
   *
   * @param message - 通知内容
   * @param type - 类型（默认 info）
   * @param duration - 持续时间（毫秒，默认 3000）
   * @returns toast id（可用于手动关闭）
   */
  function showToast(message: string, type: ToastType = 'info', duration = 3000): number {
    const id = ++nextId
    const toast: ToastItem = {
      id,
      message,
      type,
      visible: true,
    }

    toasts.value.push(toast)

    // 自动消失
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }

  /**
   * 移除一条 Toast（带退出动画）
   */
  function removeToast(id: number) {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      // 先触发退出动画
      toasts.value[index].visible = false
      // 动画结束后移除
      setTimeout(() => {
        toasts.value = toasts.value.filter((t) => t.id !== id)
      }, 300)
    }
  }

  return {
    toasts: readonly(toasts),
    showToast,
    removeToast,
  }
}
