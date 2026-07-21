<template>
  <div
    class="video-card"
    @click="openVideo"
  >
    <div class="video-thumbnail">
      <div v-if="index < 3" class="rank-badge" :class="rankClass">{{ index + 1 }}</div>
      <img
        :src="thumbnailUrl"
        :alt="video.title"
        referrerpolicy="no-referrer"
        @error="onImageError"
      />
    </div>
    <div class="video-info">
      <div class="video-title">{{ video.title }}</div>
      <div class="video-meta">
        <span class="play">
          <svg class="svg-icon-next play" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
            <path d="M8 3.332C6.321 3.332 4.855 3.417 3.82 3.501 3.101 3.56 2.544 4.109 2.48 4.822 2.404 5.667 2.333 6.78 2.333 8c0 1.218.07 2.333.147 3.177.064.713.622 1.262 1.341 1.32C4.855 12.58 6.321 12.665 8 12.665s3.145-.086 4.18-.17c.719-.058 1.276-.607 1.34-1.32C13.596 10.332 13.667 9.218 13.667 8c0-1.219-.07-2.333-.147-3.178-.064-.713-.622-1.262-1.341-1.32C11.145 3.418 9.679 3.332 8 3.332zM3.74 2.505C4.795 2.42 6.288 2.332 8 2.332s3.205.087 4.26.173c1.199.097 2.148 1.024 2.256 2.227.078.866.15 2.01.15 3.267s-.072 2.4-.15 3.267c-.108 1.203-1.057 2.13-2.256 2.227C11.205 13.578 9.712 13.665 8 13.665s-3.205-.087-4.26-.172c-1.199-.097-2.148-1.024-2.256-2.228C1.406 10.399 1.333 9.254 1.333 8s.073-2.4.15-3.267c.109-1.203 1.058-2.13 2.257-2.228z" fill="currentColor" />
            <path d="M9.809 7.312c.53.306.53 1.07 0 1.375L7.69 9.91c-.53.306-1.19-.076-1.19-.688V6.777c0-.611.66-.993 1.19-.688l2.119 1.223z" fill="currentColor" />
          </svg>
          {{ video.play_count }}
        </span>
        <span class="dm">
          <svg class="svg-icon-next dm" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
            <path d="M8 3.332C6.321 3.332 4.855 3.417 3.82 3.501 3.101 3.56 2.544 4.109 2.48 4.822 2.404 5.667 2.333 6.78 2.333 8c0 1.218.07 2.333.147 3.177.064.713.622 1.262 1.341 1.32C4.855 12.58 6.321 12.665 8 12.665s3.145-.086 4.18-.17c.719-.058 1.276-.607 1.34-1.32C13.596 10.332 13.667 9.218 13.667 8c0-1.219-.07-2.333-.147-3.178-.064-.713-.622-1.262-1.341-1.32C11.145 3.418 9.679 3.332 8 3.332zM3.74 2.505C4.795 2.42 6.288 2.332 8 2.332s3.205.087 4.26.173c1.199.097 2.148 1.024 2.256 2.227.078.866.15 2.01.15 3.267s-.072 2.4-.15 3.267c-.108 1.203-1.057 2.13-2.256 2.227C11.205 13.578 9.712 13.665 8 13.665s-3.205-.087-4.26-.172c-1.199-.097-2.148-1.024-2.256-2.228C1.406 10.399 1.333 9.254 1.333 8s.073-2.4.15-3.267c.109-1.203 1.058-2.13 2.257-2.228z" fill="currentColor" />
            <path d="M10.583 7.167H6.583a.5.5 0 010-1h4a.5.5 0 010 1zM11.583 9.833H7.583a.5.5 0 010-1h4a.5.5 0 010 1zM5.25 6.667a.5.5 0 01-.5.5h-.333a.5.5 0 010-1H4.75a.5.5 0 01.5.5zM6.25 9.333a.5.5 0 01-.5.5h-.333a.5.5 0 010-1H5.75a.5.5 0 01.5.5z" fill="currentColor" />
          </svg>
          {{ video.danmaku_count }}
        </span>
      </div>
      <div class="video-owner" @click.stop="openOwner">
        {{ video.owner }}
      </div>
    </div>
    <div class="online-count">
      <b>{{ video.online_count }}</b>人在看
    </div>
  </div>
</template>

<script setup lang="ts">
import type { VideoInfo } from '../../types'

const props = defineProps<{
  video: VideoInfo & { bvid?: string }
  index: number
}>()

const rankClass = computed(() => {
  if (props.index < 3) return `rank-${props.index + 1}`
  return ''
})

const thumbnailUrl = computed(() => {
  const pic = props.video.pic || 'https://i0.hdslb.com/bfs/archive/67db4a6eae398c309244e74f6e85ae8d813bd7c9.jpg'
  return `${pic}@320w_200h_1c_!web-space-index-myvideo.webp`
})

const fallbackPic = 'https://i0.hdslb.com/bfs/archive/67db4a6eae398c309244e74f6e85ae8d813bd7c9.jpg'

function onImageError(e: Event) {
  const img = e.target as HTMLImageElement
  if (img.src !== fallbackPic) {
    img.src = fallbackPic
  }
}

function openVideo() {
  const bvid = (props.video as any).bvid || ''
  if (bvid) {
    window.open(`https://www.bilibili.com/video/${bvid}`, '_blank')
  }
}

function openOwner() {
  const mid = props.video.mid
  if (mid) {
    window.open(`https://space.bilibili.com/${mid}`, '_blank')
  }
}
</script>

<style scoped>
.video-card {
  background-color: #fff;
  border: 1px solid var(--b-border);
  border-radius: 4px;
  overflow: hidden;
  transition: transform 0.3s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}

.video-card b {
  margin-right: 4px;
}

.video-card:hover b {
  transition: color 0.2s ease;
  color: var(--b-pink);
}

.video-thumbnail {
  position: relative;
  width: 100%;
  padding-top: 65%;
  overflow: hidden;
  cursor: pointer;
}

.video-thumbnail img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-info {
  padding: 15px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.video-title {
  color: var(--b-dark);
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

.video-title:hover {
  color: var(--b-blue) !important;
}

.video-meta {
  display: flex;
  align-items: center;
  color: var(--b-gray);
  font-size: 12px;
  margin-top: auto;
}

.video-meta span {
  display: flex;
  align-items: center;
  width: 90px;
}

.video-owner {
  color: var(--b-gray);
  font-size: 12px;
  transition: color 0.3s;
  margin-top: 6px;
  cursor: pointer;
}

.video-owner:hover {
  color: var(--b-blue) !important;
}

.online-count {
  color: #000;
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
