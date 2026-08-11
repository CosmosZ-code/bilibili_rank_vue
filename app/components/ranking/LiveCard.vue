<template>
  <div
    class="live-card"
    @click="openRoom"
  >
    <div class="live-thumbnail">
      <div v-if="index < 3" class="rank-badge" :class="rankClass">{{ index + 1 }}</div>
      <img
        :src="thumbnailUrl"
        :alt="room.title"
        @error="onImageError"
      />
    </div>
    <div class="live-info">
      <div class="live-title">{{ room.title }}</div>
      <div class="live-meta">
        <span class="area-tag">{{ room.parent_area_name }}</span>
        <span class="face-uname">
          <img v-if="room.face" :src="room.face" class="face-img" @error="onFaceError" />
          {{ room.uname }}
        </span>
      </div>
    </div>
    <div class="online-count">
      <b>{{ room.online_formatted }}</b>人气
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LiveRoomInfo } from '../../types'

const props = defineProps<{
  room: LiveRoomInfo
  index: number
}>()

const rankClass = computed(() => {
  if (props.index < 3) return `rank-${props.index + 1}`
  return ''
})

const thumbnailUrl = computed(() => {
  const pic = props.room.cover || 'https://i0.hdslb.com/bfs/live/67db4a6eae398c309244e74f6e85ae8d813bd7c9.jpg'
  return `${pic}@320w_200h_1c_!web-space-index-myvideo.webp`
})

const fallbackPic = 'https://i0.hdslb.com/bfs/archive/67db4a6eae398c309244e74f6e85ae8d813bd7c9.jpg'

const defaultFace = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="8" r="4" fill="%23ccc"/%3E%3Cpath d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="%23ccc"/%3E%3C/svg%3E'

function onImageError(e: Event) {
  const img = e.target as HTMLImageElement
  if (img.src !== fallbackPic) {
    img.src = fallbackPic
  }
}

function onFaceError(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}

function openRoom() {
  window.open(props.room.link, '_blank')
}
</script>

<style scoped>
.live-card {
  background-color: var(--bg-card);
  border: 1px solid var(--b-border);
  border-radius: 4px;
  overflow: hidden;
  transition: transform 0.3s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}

.live-card b {
  margin-right: 4px;
}

.live-card:hover b {
  transition: color 0.2s ease;
  color: var(--b-pink);
}

.live-thumbnail {
  position: relative;
  width: 100%;
  padding-top: 65%;
  overflow: hidden;
  cursor: pointer;
}

.live-thumbnail img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.live-info {
  padding: 15px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.live-title {
  color: var(--text-title);
  font-size: 12px;
  line-height: 14px;
  margin-bottom: 10px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  cursor: pointer;
  transition: color 0.3s;
}

.live-title:hover {
  color: var(--b-blue) !important;
}

.live-meta {
  display: flex;
  align-items: center;
  color: var(--b-gray);
  font-size: 12px;
  margin-top: auto;
  gap: 6px;
  flex-wrap: wrap;
}

.area-tag {
  background-color: var(--bg-muted);
  border-radius: 2px;
  padding: 1px 6px;
  font-size: 11px;
  color: var(--text-2);
}

.face-uname {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.face-img {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.online-count {
  color: var(--text-1);
  background-color: var(--b-border);
  font-size: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3px 8px;
  height: 30px;
  margin-top: auto;
}

.rank-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: bold;
  font-size: 16px;
  z-index: 1;
}

.rank-1, .rank-2, .rank-3 {
  width: 35px;
  height: 35px;
  font-size: 18px;
}

.rank-1 { background-color: var(--rank-1); color: #333; }
.rank-2 { background-color: var(--rank-2); color: #333; }
.rank-3 { background-color: var(--rank-3); color: #333; }
</style>
