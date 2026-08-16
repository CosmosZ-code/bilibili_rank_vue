<template>
  <div class="layer" :style="mergedStyle">
    <img
      v-if="!isVideo"
      :src="layer.src"
      class="layer-img"
      :style="imgStyle"
    />
    <video
      v-else
      :src="layer.src"
      loop
      autoplay
      muted
      playsinline
      class="layer-img"
      :style="imgStyle"
    />
  </div>
</template>

<script setup lang="ts">
import type { BannerLayerData } from '../../types'

const props = defineProps<{
  layer: BannerLayerData
  style?: { transform: string; opacity?: number }
  compensate: number
}>()

const isVideo = computed(() => props.layer.tagName === 'video')

const mergedStyle = computed(() => {
  const s: Record<string, string | number> = {}
  if (props.style?.transform) s.transform = props.style.transform
  if (props.style?.opacity !== undefined) s.opacity = props.style.opacity
  return s
})

const imgStyle = computed(() => {
  const s: Record<string, string | number> = {}
  if (props.layer.blur) s.filter = `blur(${props.layer.blur}px)`
  // width/height 已在 useBanner.layers 中乘过 compensate，这里直接用
  s.width = `${props.layer.width || 0}px`
  if (props.layer.height) s.height = `${props.layer.height}px`
  return s
})
</script>

<style scoped>
/* 原 index.css — .layer */
.layer {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 原 index.css — img */
.layer-img {
  user-select: none;
  pointer-events: none;
}
</style>
