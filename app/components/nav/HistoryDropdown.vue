<template>
  <div
    ref="historyWrapperRef"
    class="history-dropdown"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <!-- 触发按钮：触屏下第一次点按展开面板，第二次点按跳转 -->
    <a
      ref="triggerRef"
      class="history-trigger"
      href="https://www.bilibili.com/history"
      target="_blank"
      @mouseenter="onPanelEnter"
      @click="onTriggerClick"
    >历史</a>

    <!-- 下拉面板（Teleport 到 body，突破 banner overflow:hidden） -->
    <Teleport to="body">
      <Transition name="fade">
      <div v-if="isOpen" ref="historyPanelRef" class="history-panel" :style="panelStyle" @mouseenter="onPanelEnter" @mouseleave="onMouseLeave">
      <!-- 未登录 -->
      <div v-if="!isLoggedIn" class="history-placeholder">
        <p>请先登录后查看历史记录</p>
      </div>

      <!-- 加载中 -->
      <div v-else-if="isLoading && history.length === 0" class="history-placeholder">
        <div class="loading-spinner"></div>
        <p>加载中...</p>
      </div>

      <!-- 加载失败 -->
      <div v-else-if="error" class="history-placeholder">
        <p class="error-text">{{ error }}</p>
      </div>

      <!-- 空列表 -->
      <div v-else-if="!isLoading && history.length === 0" class="history-placeholder">
        <p>暂无观看记录</p>
      </div>

      <!-- 视频列表 -->
      <div v-else class="history-list">
        <a
          v-for="item in history"
          :key="item.bvid"
          :href="`https://www.bilibili.com/video/${item.bvid}`"
          target="_blank"
          class="history-card"
        >
          <!-- 缩略图区域 -->
          <div class="card-cover">
            <img
              :src="item.cover"
              :alt="item.title"
              referrerpolicy="no-referrer"
              loading="lazy"
            />
            <!-- 观看进度条 -->
            <div
              v-if="item.duration"
              class="progress-bar"
              :style="{ width: progressPercent(item) + '%' }"
            ></div>
            <span v-if="item.duration || item.progress" class="duration-badge">
              {{ formatDuration(effectiveProgress(item)) }}/{{ formatDuration(item.duration) }}
            </span>
          </div>

          <!-- 文本信息 -->
          <div class="card-info">
            <p class="card-title">{{ item.title }}</p>
            <div class="card-meta-bottom">
              <p class="card-meta">{{ formatViewTime(item.viewAt) }}</p>
              <p class="card-author">{{ item.ownerName }}</p>
            </div>
          </div>
        </a>

        <!-- 加载更多提示 -->
        <div v-if="isLoading && history.length > 0" class="history-placeholder history-loadmore">
          <div class="loading-spinner"></div>
        </div>

        <!-- 查看全部 -->
        <a
          v-if="history.length > 0"
          href="https://www.bilibili.com/history"
          target="_blank"
          class="history-view-all"
        >查看全部</a>
      </div>
    </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { formatDuration, formatViewTime, progressPercent, effectiveProgress } from '../../utils/history'

const { isLoggedIn } = useAuth()
const { history, isLoading, error, fetchHistory } = useHistory()
const { isTouch } = useTouchDevice()

const isOpen = ref(false)
const hasFetched = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const historyWrapperRef = ref<HTMLElement | null>(null)
const historyPanelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
let closeTimer: ReturnType<typeof setTimeout> | null = null

/** 根据触发按钮位置计算面板坐标 */
function updatePanelPosition() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  panelStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 6}px`,
    left: `${rect.left + rect.width / 2}px`,
    transform: 'translateX(-50%)',
  }
}

/** 触屏设备：点击下拉外部时关闭 */
function onDocumentClick(e: MouseEvent) {
  if (!isTouch.value || !isOpen.value) return
  if (isClickOutside(e.target as Node, [historyWrapperRef.value, historyPanelRef.value])) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})

/** 鼠标进入触发按钮 */
function onMouseEnter() {
  if (isTouch.value) return
  clearCloseTimer()
  isOpen.value = true
  // 首次展开时拉取数据
  if (!hasFetched.value && isLoggedIn.value && !isLoading.value) {
    hasFetched.value = true
    fetchHistory()
  }
  // 面板渲染后计算位置
  nextTick(updatePanelPosition)
}

/** 鼠标进入下拉面板（阻止关闭） */
function onPanelEnter() {
  if (isTouch.value) return
  clearCloseTimer()
}

/** 鼠标离开（延迟关闭） */
function onMouseLeave() {
  if (isTouch.value) return
  closeTimer = setTimeout(() => {
    isOpen.value = false
  }, 200)
}

/** 触屏设备：点按触发按钮
 *  第一次点按：阻止跳转，展开面板
 *  第二次点按：正常跳转到历史页面 */
function onTriggerClick(e: MouseEvent) {
  if (!isTouch.value) return
  const { shouldOpen, shouldTriggerAction } = computeTriggerTap(isTouch.value, isOpen.value)
  if (shouldOpen && !shouldTriggerAction) {
    e.preventDefault()
    isOpen.value = true
    // 首次展开时拉取数据
    if (!hasFetched.value && isLoggedIn.value && !isLoading.value) {
      hasFetched.value = true
      fetchHistory()
    }
    nextTick(updatePanelPosition)
    return
  }
  // 第二次点按：不阻止默认行为，正常跳转
}

function clearCloseTimer() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}
</script>

<style scoped>
.history-dropdown {
  position: relative;
  display: inline-block;
}

/* 触发按钮 — 复用 BannerNav .nav-link 风格 */
.history-trigger {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  line-height: 1;
  font-size: 14px;
  font-weight: 500;
  padding: 5px 10px;
  border-radius: 4px;
  transition: background-color 0.3s;
  font-family: inherit;
}

.history-trigger:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

/* 淡入淡出过渡 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 下拉面板 */
.history-panel {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  width: 340px;
  max-height: 490px;
  overflow-y: auto;
  overscroll-behavior: contain;
  z-index: 200;
  padding: 8px 0;
  /* Firefox 滚动条 */
  scrollbar-width: thin;
  scrollbar-color: #d0d0d0 transparent;
}

/* 占位状态 */
.history-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #999;
  font-size: 14px;
  gap: 8px;
}

.history-placeholder p {
  margin: 0;
}

.history-loadmore {
  padding: 16px 20px;
}

.error-text {
  color: #ff6b6b !important;
}

/* 加载动画 */
.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e5e5e5;
  border-top-color: var(--b-pink);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 视频列表 */
.history-list {
  padding: 0;
}

/* 查看全部 */
.history-view-all {
  display: block;
  text-align: center;
  padding: 10px 16px;
  font-size: 13px;
  color: #666;
  text-decoration: none;
  border-top: 1px solid #eee;
  transition: background-color 0.15s, color 0.15s;
}
.history-view-all:hover {
  background-color: #f5f5f5;
  color: var(--b-pink);
}

/* 视频卡片 */
.history-card {
  display: flex;
  gap: 12px;
  padding: 10px 16px;
  text-decoration: none;
  color: inherit;
  transition: background-color 0.15s;
  cursor: pointer;
}

.history-card:hover {
  background-color: #eaeaea;
}

/* 缩略图 */
.card-cover {
  position: relative;
  flex-shrink: 0;
  width: 120px;
  height: 75px;
  border-radius: 4px;
  overflow: hidden;
  background: #f0f0f0;
}

.card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 观看进度条 */
.progress-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  background: var(--b-pink);
  border-radius: 0 1px 0 0;
}

/* 时长标签 */
.duration-badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: monospace;
}

/* 文本信息区 */
.card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

/* 标题：加粗、最多两行、省略号 */
.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #222;
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 播放时间 */
.card-meta {
  font-size: 12px;
  color: #999;
  margin: 0;
  line-height: 1.3;
}

/* UP主名称 */
.card-author {
  font-size: 12px;
  color: #999;
  margin: 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 自定义滚动条 — 细长灰色，靠右侧 */
.history-panel::-webkit-scrollbar {
  width: 5px;
}

.history-panel::-webkit-scrollbar-track {
  background: transparent;
}

.history-panel::-webkit-scrollbar-thumb {
  background: #d0d0d0;
  border-radius: 3px;
}

.history-panel::-webkit-scrollbar-thumb:hover {
  background: #b0b0b0;
}
</style>
