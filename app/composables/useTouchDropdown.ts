/**
 * useTouchDropdown — 触屏设备下拉菜单交互逻辑
 *
 * 提取各组件中重复的触屏适配逻辑：
 * - 两阶段点按（首次展开下拉，二次触发操作）
 * - 点击外部关闭下拉
 *
 * 与 useTouchDevice 配合使用：useTouchDevice 提供 isTouch 检测，
 * useTouchDropdown 提供触屏下的交互行为计算。
 */

/**
 * 计算触屏下点击触发器的两阶段行为
 *
 * 桌面设备（非触屏）：始终触发原操作
 * 触屏设备：首次点按仅展开下拉，第二次点按才触发操作
 *
 * @param isTouch - 是否为触屏设备
 * @param isOpen  - 当前下拉是否已打开
 * @returns shouldOpen（是否应展开）和 shouldTriggerAction（是否应触发原操作）
 */
export function computeTriggerTap(
  isTouch: boolean,
  isOpen: boolean,
): { shouldOpen: boolean; shouldTriggerAction: boolean } {
  if (!isTouch) {
    // 桌面设备：点击直接触发原操作，不改变下拉状态
    return { shouldOpen: isOpen, shouldTriggerAction: true }
  }
  if (!isOpen) {
    // 触屏首次点按：展开下拉，不触发原操作
    return { shouldOpen: true, shouldTriggerAction: false }
  }
  // 触屏第二次点按：触发原操作
  return { shouldOpen: isOpen, shouldTriggerAction: true }
}

/**
 * 判断点击目标是否在所有容器元素之外
 *
 * 当所有容器均为 null/undefined（尚未挂载）时返回 false（不关闭），
 * 与各组件原有 if (el && !el.contains(...)) 行为一致。
 *
 * @param target     - 点击事件的目标节点
 * @param containers - 容器元素列表（可为 undefined/null）
 * @returns true 表示点击在所有有效容器之外
 */
export function isClickOutside(
  target: Node,
  containers: (HTMLElement | undefined | null)[],
): boolean {
  const validContainers = containers.filter((el): el is HTMLElement => el != null)
  if (validContainers.length === 0) return false
  return !validContainers.some((el) => el.contains(target))
}
