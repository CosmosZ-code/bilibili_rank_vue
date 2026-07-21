<template>
  <div
    class="nav-dropdown"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <button class="nav-dropdown-trigger">
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

const isOpen = ref(false)
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
