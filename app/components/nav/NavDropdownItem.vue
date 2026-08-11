<template>
  <a
    v-if="href"
    :href="href"
    class="nav-dropdown-item"
    :target="href.startsWith('http') ? '_blank' : undefined"
  >
    <slot></slot>
  </a>
  <button v-else class="nav-dropdown-item" @click="$emit('click')">
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  href?: string
}>()

defineEmits<{
  click: []
}>()
</script>

<style scoped>
.nav-dropdown-item {
  display: block;
  width: 100%;
  padding: 10px 16px;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-1);
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.nav-dropdown-item:hover {
  background-color: var(--bg-hover);
}
</style>
