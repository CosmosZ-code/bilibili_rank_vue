<template>
  <div class="controls">
    <!-- 标题区 -->
    <div class="b-head online">
      <span class="b-head-i"></span>
      <span class="b-head-t">观看列表</span> <span class="b-head-desc">根据稿件网页端的观看情况，定时更新</span>
    </div>

    <!-- 过滤等级滑块 -->
    <div style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
      <label for="percent-range" style="font-size: 14px; color: #333;">过滤等级：</label>
      <input
        id="percent-range"
        type="range"
        min="0"
        max="100"
        :value="purifyPercent"
        style="width: 180px;"
        @input="$emit('update:purifyPercent', Number(($event.target as HTMLInputElement).value))"
      />
      <span
        style="font-size: 14px; color: #333; min-width: 40px; text-align: right;"
      >
        {{ purifyPercent }}%
      </span>
    </div>

    <!-- 搜索框 -->
    <SearchBox :modelValue="searchTerm" @update:modelValue="$emit('update:searchTerm', $event)" />

    <!-- 排序按钮 -->
    <div class="sort-options">
      <button
        class="sort-btn"
        :class="{ active: sortBy === 'count' }"
        @click="$emit('update:sortBy', 'count')"
      >
        按在线人数排序
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SortBy } from '../../types'

defineProps<{
  sortBy: SortBy
  searchTerm: string
  purifyPercent: number
}>()

defineEmits<{
  'update:sortBy': [value: SortBy]
  'update:searchTerm': [value: string]
  'update:purifyPercent': [value: number]
}>()
</script>

<style scoped>
.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  border-top: 1px solid var(--b-border);
  border-bottom: 1px solid var(--b-border);
  padding: 10px 0;
}

.b-head-t {
  font-size: 18px;
  color: var(--b-dark);
}

.b-head-desc {
  font-size: 13px;
  color: var(--b-gray);
}

.sort-options {
  display: flex;
  gap: 10px;
  margin: 10px 0;
}

.sort-btn {
  background-color: #fff;
  border: 1px solid #ddd;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
}

.sort-btn:hover,
.sort-btn.active {
  background-color: var(--b-pink);
  color: white;
  border-color: var(--b-pink);
}
</style>
