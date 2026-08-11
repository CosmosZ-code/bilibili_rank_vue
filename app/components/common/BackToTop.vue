<template>
  <button
    id="back-to-top"
    :class="{ show }"
    title="返回顶部"
    @click="handleClick"
  >
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 15l7-7 7 7" />
    </svg>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  click: []
}>()

function handleClick() {
  emit('click')
}
</script>

<style scoped>
#back-to-top {
  position: fixed;
  bottom: 70px;
  right: 30px;
  width: 50px;
  height: 50px;
  background: var(--bg-card);
  color: var(--b-pink);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: all 0.3s;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

#back-to-top.show {
  opacity: 1;
  pointer-events: auto;
}

#back-to-top:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
</style>
