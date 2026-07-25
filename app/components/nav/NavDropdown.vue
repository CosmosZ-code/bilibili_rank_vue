<template>
  <div
    ref="navDropdownRef"
    class="nav-dropdown"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <button class="nav-dropdown-trigger" @click="onTriggerClick">
      <slot name="trigger">{{ triggerLabel }}</slot>
    </button>
    <div v-if="isOpen" class="nav-dropdown-menu">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  triggerLabel?: string
}>()

const { isTouch } = useTouchDevice()

const isOpen = ref(false)
const navDropdownRef = ref<HTMLElement | null>(null)
let closeTimer: ReturnType<typeof setTimeout> | null = null

function onMouseEnter() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  isOpen.value = true
}

function onMouseLeave() {
  closeTimer = setTimeout(() => {
    isOpen.value = false
  }, 200)
}

/** 触屏设备：点按切换下拉菜单 */
function onTriggerClick() {
  if (!isTouch.value) return
  isOpen.value = !isOpen.value
}

/** 触屏设备：点击下拉外部时关闭 */
function onDocumentClick(e: MouseEvent) {
  if (!isTouch.value || !isOpen.value) return
  const el = navDropdownRef.value
  if (!el) return
  if (!el.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<style scoped>
.nav-dropdown {
  position: relative;
  display: inline-block;
}

.nav-dropdown-trigger {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 14px;
  padding: 5px 10px;
  border-radius: 4px;
}

.nav-dropdown-trigger:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.nav-dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 200px;
  z-index: 200;
  padding: 8px 0;
}
</style>
