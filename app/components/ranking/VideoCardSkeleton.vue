<template>
  <div class="video-card skeleton">
    <div class="video-thumbnail skeleton-box"></div>
    <div class="video-info">
      <div class="skeleton-line" style="width: 80%;"></div>
      <div class="skeleton-line" style="width: 60%; margin-top: 8px;"></div>
      <div class="skeleton-line" style="width: 40%; margin-top: 8px;"></div>
    </div>
    <div class="skeleton-line" style="height: 30px;"></div>
  </div>
</template>

<style scoped>
.video-card {
  background-color: var(--bg-card);
  border: 1px solid var(--b-border);
  border-radius: 4px;
  overflow: hidden;
}

.video-thumbnail {
  position: relative;
  width: 100%;
  padding-top: 65%;
  overflow: hidden;
}

.video-info {
  padding: 15px;
}

.skeleton-box {
  background: linear-gradient(90deg, var(--bg-muted) 25%, var(--bg-skeleton) 50%, var(--bg-muted) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

.skeleton-line {
  height: 12px;
  background: linear-gradient(90deg, var(--bg-muted) 25%, var(--bg-skeleton) 50%, var(--bg-muted) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
