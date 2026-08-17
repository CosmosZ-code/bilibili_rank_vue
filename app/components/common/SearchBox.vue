<template>
  <input
    type="text"
    class="search-box"
    placeholder="搜索视频标题或UP主..."
    :value="modelValue"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<style scoped>
.search-box {
  padding: 8px 15px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  width: 250px;
  margin: 10px 0;
  /* 半透明底（--surface-input 日间透明白 / 夜间透明深灰），融入页面与玻璃面板 */
  background: var(--surface-input);
  color: var(--text-1);
  outline: none; /* 聚焦用自定义粉色描边替代默认 outline */
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
}

.search-box::placeholder {
  color: var(--text-3);
}

.search-box:hover {
  border-color: var(--b-pink);
}

.search-box:focus {
  border-color: var(--b-pink);
  box-shadow: 0 0 0 3px rgba(251, 114, 153, 0.15); /* 粉色柔光晕 */
}

/* 768–1280px：控制栏强制单行（RankingControls 的 nowrap），行内溢出时允许搜索框收缩 */
@media (min-width: 768px) and (max-width: 1280px) {
  .search-box {
    min-width: 0; /* 输入框默认最小宽度≈placeholder 宽度，放开后才能继续收缩 */
  }
}

/* 移动端：侧栏内全宽（控制栏的搜索框此时已被隐藏，无副作用） */
@media (max-width: 768px) {
  .search-box {
    width: 100%;
  }
}
</style>
