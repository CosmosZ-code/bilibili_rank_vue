<template>
  <div class="not-found">
    <div class="not-found-content">
      <h1>404</h1>
      <p>页面不存在</p>
      <a href="/" class="back-home">返回首页</a>
    </div>
  </div>
</template>

<script setup lang="ts">
const event = useRequestEvent()
if (event) {
  setResponseStatus(event, 404)
}
</script>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  text-align: center;
}

.not-found-content h1 {
  font-size: 6rem;
  margin: 0;
  color: var(--b-pink);
}

.not-found-content p {
  font-size: 1.2rem;
  color: var(--text-3);
  margin: 0.5rem 0 2rem;
}

.back-home {
  display: inline-block;
  padding: 0.5rem 1.5rem;
  background: var(--b-pink);
  color: #fff;
  border-radius: 4px;
  text-decoration: none;
  transition: opacity 0.2s;
}

.back-home:hover {
  opacity: 0.85;
}
</style>
