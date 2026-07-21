<template>
  <div>
    <!-- 加载中骨架屏 -->
    <div v-if="isLoading" class="video-grid">
      <VideoCardSkeleton v-for="n in 12" :key="n" />
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="error">加载失败: {{ error }}</div>

    <!-- 无结果 -->
    <div v-else-if="videos.length === 0 && !isLoading" class="no-results">
      没有找到匹配的视频
    </div>

    <!-- 视频列表 -->
    <div v-else class="video-grid">
      <VideoCard
        v-for="(video, index) in videos"
        :key="(video as any).bvid || index"
        :video="video"
        :index="index"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { VideoInfo } from '../../types'

defineProps<{
  videos: VideoInfo[]
  isLoading: boolean
  error: string | null
}>()
</script>

<style scoped>
.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 20px;
}

@media (max-width: 768px) {
  .video-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}

.error {
  text-align: center;
  padding: 50px;
  font-size: 18px;
  color: #ff4d4f;
}

.no-results {
  text-align: center;
  padding: 50px;
  font-size: 18px;
  color: #666;
}
</style>
