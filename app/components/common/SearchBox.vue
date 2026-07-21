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
  border: 1px solid #ddd;
  border-radius: 4px;
  width: 250px;
  margin: 10px 0;
}
</style>
