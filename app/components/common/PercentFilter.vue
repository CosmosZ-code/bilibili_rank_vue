<template>
  <div class="percent-filter" :class="{ 'percent-filter--hidden': hidden }">
    <label for="percent-range" class="percent-label">过滤等级：</label>
    <input
      id="percent-range"
      type="range"
      min="0"
      max="100"
      class="percent-range"
      :value="modelValue"
      @input="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
    <span class="percent-value">{{ modelValue }}%</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: number
  /** 隐藏时仅 visibility: hidden 占位（桌面直播模式：保持搜索框位置不动） */
  hidden?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: number]
}>()
</script>

<style scoped>
.percent-filter {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 隐藏时占位（桌面直播模式：保持搜索框位置不动，不触发布局抖动） */
.percent-filter--hidden {
  visibility: hidden;
}

.percent-label {
  font-size: 14px;
  color: #333;
  white-space: nowrap;
}

.percent-range {
  width: 180px;
}

.percent-value {
  font-size: 14px;
  color: #333;
  min-width: 40px;
  text-align: right;
}

/* 移动端（侧栏内）：滑块弹性占满剩余宽度，便于拖动 */
@media (max-width: 768px) {
  .percent-range {
    width: 100%;
    flex: 1;
  }
}
</style>
