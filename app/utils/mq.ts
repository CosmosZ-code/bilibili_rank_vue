/**
 * MediaQueryList 变更监听兼容助手
 *
 * iOS 12（Safari 12）的 MediaQueryList 只有 addListener / removeListener，
 * 没有 addEventListener / removeEventListener（Safari 14+ 才支持）。
 * 这里做特性检测并返回解除函数，调用方无需关心新旧 API 差异。
 *
 * 用法：
 *   const off = onMqChange(mq, (e) => { ... })
 *   // 组件卸载时：off()
 */
export function onMqChange(
  mq: MediaQueryList,
  cb: (e: MediaQueryListEvent) => void,
): () => void {
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
  }
  // iOS 12 回退：旧式监听器
  mq.addListener(cb)
  return () => mq.removeListener(cb)
}
