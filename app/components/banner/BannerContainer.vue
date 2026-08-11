<template>
  <div
    id="app"
    class="banner-root"
    @mouseenter="onEnter"
    @mousemove="onMove"
    @mouseleave="onLeave"
  >
    <!-- 图层（绝对定位，覆盖整个 banner） -->
    <BannerLayer
      v-for="(layer, i) in layers"
      :key="i"
      :layer="layer"
      :style="layerStyles[i]"
      :compensate="compensate"
    />

    <!-- 顶部导航（覆盖在图层上方） -->
    <BannerNav />

    <!-- B站 Logo（居中） -->
    <div class="header-banner__inner">
      <a href="//www.bilibili.com">
        <img alt="B站" width="162" height="78" src="/logo.png" />
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BannerDataSet } from '../../app/types'

const props = defineProps<{ initialBanners?: BannerDataSet[] }>()

const { layers, compensate, moveX, initX, getLayerStyles, updateCompensate } = useBanner(props.initialBanners)

const layerStyles = ref<{ transform: string; opacity?: number }[]>([])
let frameId = 0

function renderFrame(progress?: number) {
  layerStyles.value = getLayerStyles(layers.value, moveX.value, progress)
}

function onEnter(e: MouseEvent) { initX.value = e.pageX }
function onMove(e: MouseEvent) { moveX.value = e.pageX - initX.value }

function onLeave() {
  // 启动回位动画
  const duration = 300
  let start = 0
  function step(ts: number) {
    if (!start) start = ts
    const progress = Math.min((ts - start) / duration, 1)
    renderFrame(progress)
    if (progress < 1) frameId = requestAnimationFrame(step)
  }
  cancelAnimationFrame(frameId)
  frameId = requestAnimationFrame(step)
}

let moveWatchStop: (() => void) | null = null

onMounted(() => {
  updateCompensate()
  renderFrame()
  // 鼠标移动时实时渲染
  moveWatchStop = watch(moveX, () => {
    cancelAnimationFrame(frameId)
    frameId = requestAnimationFrame(() => renderFrame())
  })
  window.addEventListener('resize', updateCompensate)
  // 窗口失焦时回位（对齐 HTML: window.onblur = leave）
  window.addEventListener('blur', onLeave)
})

onUnmounted(() => {
  moveWatchStop?.()
  cancelAnimationFrame(frameId)
  window.removeEventListener('resize', updateCompensate)
  window.removeEventListener('blur', onLeave)
})
</script>

<style scoped>
.banner-root {
  position: relative;
  overflow: hidden;
  margin: 0 auto;
  min-height: 155px;
  height: 10vw;
  max-height: 240px;
}

/* 夜间模式遮罩：半透明深灰压暗明亮的 Banner 图（图层与 logo 之上、导航之下）。
   仅夜间显示，pointer-events: none 不拦截视差鼠标事件 */
.banner-root::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  background: rgba(0, 0, 0, 0.4);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
}

[data-theme='dark'] .banner-root::after {
  opacity: 1;
}

.header-banner__inner {
  position: relative;
  top: 50%;
  transform: translateY(-60%);
  z-index: 1;
  max-width: 1160px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .banner-root { display: none !important; }
}
</style>
