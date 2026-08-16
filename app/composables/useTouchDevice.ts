/**
 * useTouchDevice — 触屏设备检测
 *
 * 使用 matchMedia('(hover: none) and (pointer: coarse)') 检测主指针为触摸的设备。
 * 用于在下拉菜单等悬浮交互组件中，对触屏设备切换为点按模式。
 *
 * 注意：仅客户端可用（依赖 window.matchMedia），SSR 期间返回 false。
 */
import { onMqChange } from '../utils/mq'

export function useTouchDevice() {
  const isTouch = ref(false)

  onMounted(() => {
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)')
    isTouch.value = mq.matches

    const onChange = (e: MediaQueryListEvent) => {
      isTouch.value = e.matches
    }
    // iOS 12（Safari 12）无 addEventListener，onMqChange 内部回退 addListener
    const off = onMqChange(mq, onChange)

    // 组件卸载时清理监听器
    onUnmounted(off)
  })

  return { isTouch }
}
