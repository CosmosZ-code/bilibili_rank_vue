<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', `toast--${toast.type}`, { 'toast--visible': toast.visible }]"
        @click="removeToast(toast.id)"
      >
        <span class="toast-message">{{ toast.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
const { toasts, removeToast } = useToast()
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  min-width: 200px;
  max-width: 400px;
  padding: 12px 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  pointer-events: auto;
  opacity: 0;
  transform: translateX(100%);
  transition: all 0.3s ease;
}

.toast--visible {
  opacity: 1;
  transform: translateX(0);
}

.toast--info {
  border-left: 4px solid var(--b-blue, #00a1d6);
}

.toast--success {
  border-left: 4px solid #52c41a;
}

.toast--warning {
  border-left: 4px solid #faad14;
}

.toast--error {
  border-left: 4px solid #ff4d4f;
}

.toast-message {
  color: #333;
  font-size: 14px;
  line-height: 1.5;
}

/* Transition 动画 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.toast-move {
  transition: transform 0.3s ease;
}

/* 移动端适配 */
@media (max-width: 480px) {
  .toast-container {
    left: 10px;
    right: 10px;
    top: 10px;
  }

  .toast {
    min-width: unset;
    max-width: unset;
    width: 100%;
  }
}
</style>
