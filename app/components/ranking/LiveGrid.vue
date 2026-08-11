<template>
  <div>
    <!-- 加载中骨架屏 -->
    <div v-if="isLoading" class="live-grid">
      <VideoCardSkeleton v-for="n in 12" :key="n" />
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="error">加载失败: {{ error }}</div>

    <!-- 无结果 -->
    <div v-else-if="rooms.length === 0 && !isLoading" class="no-results">
      没有找到匹配的直播间
    </div>

    <!-- 直播列表 -->
    <div v-else class="live-grid">
      <LiveCard
        v-for="(room, index) in rooms"
        :key="room.roomid"
        :room="room"
        :index="index"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LiveRoomInfo } from '../../types'

defineProps<{
  rooms: LiveRoomInfo[]
  isLoading: boolean
  error: string | null
}>()
</script>

<style scoped>
.live-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 20px;
}

@media (max-width: 768px) {
  .live-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    padding: 0 6px; /* 左右余量（与切换按钮右侧余量对齐） */
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
