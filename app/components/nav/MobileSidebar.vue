<template>
  <!-- 遮罩层：点击关闭 -->
  <Transition name="fade">
    <div v-if="isOpen" class="sidebar-overlay" @click="close"></div>
  </Transition>

  <!-- 左侧滑出面板：头部固定，内容区独立滚动 -->
  <Transition name="sidebar-slide">
    <aside v-if="isOpen" ref="sidebarRef" class="sidebar">
      <header class="sidebar-header">
        <ThemeSwitch variant="sidebar" />
        <button class="sidebar-close" aria-label="关闭菜单" @click="close">✕</button>
      </header>

      <div ref="sidebarBodyRef" class="sidebar-body">
        <SearchBox :modelValue="searchTerm" @update:modelValue="$emit('update:searchTerm', $event)" />

        <!-- 过滤等级（仅视频模式生效，直播无过滤概念） -->
        <PercentFilter
          v-if="viewMode === 'videos'"
          :modelValue="purifyPercent"
          @update:modelValue="$emit('update:purifyPercent', $event)"
        />

        <!-- 已屏蔽UP 折叠菜单：展开后全量平铺（无分页），标题 sticky 吸顶 -->
        <section class="blacklist-section">
          <button
            class="blacklist-toggle"
            :aria-expanded="blacklistOpen"
            @click="blacklistOpen = !blacklistOpen"
          >
            <span class="menu-toggle-name">已屏蔽UP</span>
            <span v-if="blockedUps.length" class="menu-count">{{ blockedUps.length }}</span>
            <span class="menu-arrow" :class="{ open: blacklistOpen }">▾</span>
          </button>
          <Transition name="fade">
            <div v-if="blacklistOpen" class="blacklist-body">
              <div v-if="sortedBlockedUps.length === 0" class="blacklist-empty">暂无屏蔽UP</div>
              <div v-for="item in sortedBlockedUps" :key="item.mid" class="blacklist-item">
                <span class="blacklist-name" :title="item.owner">{{ item.owner }}</span>
                <button class="blacklist-unblock" @click="$emit('unblock', item.mid)">取消屏蔽</button>
              </div>
            </div>
          </Transition>
        </section>

        <!-- 观看历史：默认展开，抽屉首次打开时拉取（需登录） -->
        <section class="history-section">
          <button
            class="history-toggle"
            :aria-expanded="historyOpen"
            @click="historyOpen = !historyOpen"
          >
            <span class="menu-toggle-name">观看历史</span>
            <span class="menu-arrow" :class="{ open: historyOpen }">▾</span>
          </button>
          <Transition name="fade">
            <div v-if="historyOpen" class="history-body">
              <!-- 未登录 -->
              <div v-if="!isLoggedIn" class="history-empty">请先登录后查看历史记录</div>
              <!-- 加载中 -->
              <div v-else-if="isLoading && history.length === 0" class="history-empty">
                <div class="history-spinner"></div>
                <p>加载中...</p>
              </div>
              <!-- 加载失败（列表已有数据时保留列表，可重试） -->
              <div v-else-if="error && history.length === 0" class="history-empty history-error">{{ error }}</div>
              <!-- 空列表 -->
              <div v-else-if="history.length === 0" class="history-empty">暂无观看记录</div>
              <!-- 视频列表 -->
              <template v-else>
                <a
                  v-for="(item, index) in history"
                  :key="item.bvid || item.roomId || index"
                  :href="getHistoryLink(item)"
                  target="_blank"
                  class="history-card"
                >
                  <div class="history-cover">
                    <img :src="item.cover" :alt="item.title" referrerpolicy="no-referrer" loading="lazy" />
                    <div
                      v-if="item.duration"
                      class="progress-bar"
                      :style="{ width: progressPercent(item) + '%' }"
                    ></div>
                    <span v-if="item.duration || item.progress" class="duration-badge">
                      {{ formatDuration(effectiveProgress(item)) }}/{{ formatDuration(item.duration) }}
                    </span>
                    <span v-else-if="item.isLive" class="duration-badge live-badge">直播</span>
                  </div>
                  <div class="history-info">
                    <p class="history-title">{{ item.title }}</p>
                    <div class="history-meta">
                      <p class="history-time">{{ formatViewTime(item.viewAt) }}</p>
                      <p class="history-author">{{ item.ownerName }}</p>
                    </div>
                  </div>
                </a>
                <!-- 下滑加载下一页（与视频卡片交互一致），最多 HISTORY_MAX_PAGES 页 -->
                <div v-if="historyHasMore" class="history-load-more" @click="loadMoreHistory">
                  <span v-if="isLoading">加载中...</span>
                  <span v-else>下滑加载更多...</span>
                </div>
                <div v-else class="history-load-more history-load-more--end">
                  已展示全部 {{ history.length }} 条记录
                </div>
              </template>
            </div>
          </Transition>
        </section>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import type { BlacklistItem, ViewMode } from '../../types'
import { formatDuration, formatViewTime, progressPercent, effectiveProgress, getHistoryLink } from '../../utils/history'

const props = defineProps<{
  searchTerm: string
  purifyPercent: number
  blockedUps: BlacklistItem[]
  viewMode: ViewMode
}>()

const emit = defineEmits<{
  'update:searchTerm': [value: string]
  'update:purifyPercent': [value: number]
  'unblock': [mid: string]
}>()

// 抽屉开合（与 MobileTopBar 共享模块级单例状态）
const { isOpen, close } = useMobileDrawer()

// 观看历史（数据与桌面 HistoryDropdown 同源）
const { isLoggedIn } = useAuth()
const { history, isLoading, error, hasMore, fetchHistory, loadMore } = useHistory()

// 观看历史折叠菜单（默认展开，与已屏蔽UP 默认收起相对）
const historyOpen = ref(true)
let historyFetched = false

// 历史分页：首屏=第1页，下滑加载最多 HISTORY_MAX_PAGES 页（游标分页，每页约 20 条）
const sidebarBodyRef = ref<HTMLElement | null>(null)
const sidebarRef = ref<HTMLElement | null>(null)
const historyPages = ref(1)
const historyHasMore = computed(() => hasHistoryMorePages(hasMore.value, historyPages.value))

/**
 * 加载下一页历史（点击加载条或下滑到底触发）
 * 失败不消耗页数，加载条回到可重试状态
 */
async function loadMoreHistory() {
  if (!historyHasMore.value || isLoading.value) return
  await loadMore()
  if (!error.value) historyPages.value++
}

// 黑名单折叠菜单（默认收起，与桌面下拉交互一致）
const blacklistOpen = ref(false)

// 全量平铺（无分页），按 UP 名拼音排序
const sortedBlockedUps = computed(() => sortBlacklistByOwner(props.blockedUps))

// 打开时锁定 body 滚动（防止抽屉下层页面滚动），关闭时恢复。
// 视口切到桌面（侧栏被 CSS 隐藏）时同样解锁，防止滚动锁残留
function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches
}

function syncBodyLock() {
  document.body.style.overflow = isOpen.value && isMobileViewport() ? 'hidden' : ''
}

watch(isOpen, syncBodyLock)

// 抽屉首次打开时拉取历史（与桌面下拉"首次展开拉取"一致）
watch(isOpen, (open) => {
  if (open && !historyFetched && isLoggedIn.value) {
    historyFetched = true
    fetchHistory()
  }
})

// ============================================================
// 历史下滑加载下一页（与视频卡片逻辑一致）：仅当"继续下滑"且
// 侧栏内容区滚到底部时触发；监听器挂在 .sidebar-body 上
// ============================================================
let lastTouchY = 0

function historyAtBottom() {
  const el = sidebarBodyRef.value
  if (!el) return false
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 5
}

function shouldLoadHistory() {
  return isOpen.value && historyOpen.value && historyHasMore.value && !isLoading.value
}

function onWheel(e: WheelEvent) {
  if (e.deltaY <= 0) return
  if (!shouldLoadHistory()) return
  if (historyAtBottom()) loadMoreHistory()
}

function onTouchStart(e: TouchEvent) {
  lastTouchY = e.touches[0].clientY
}

function onTouchMove(e: TouchEvent) {
  const currentY = e.touches[0].clientY
  const deltaY = lastTouchY - currentY
  lastTouchY = currentY
  if (deltaY <= 0) return // 只响应"继续下滑"
  if (!shouldLoadHistory()) return
  if (historyAtBottom()) loadMoreHistory()
}

function attachScrollListeners() {
  const el = sidebarBodyRef.value
  if (!el) return
  el.addEventListener('wheel', onWheel, { passive: true })
  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: true })
}

function detachScrollListeners() {
  const el = sidebarBodyRef.value
  if (!el) return
  el.removeEventListener('wheel', onWheel)
  el.removeEventListener('touchstart', onTouchStart)
  el.removeEventListener('touchmove', onTouchMove)
}

// 抽屉打开（aside v-if 挂载）后给内容区挂监听，关闭时移除
watch(isOpen, async (open) => {
  if (open) {
    await nextTick()
    attachScrollListeners()
    // 安卓兜底：与 MobileTopBar 同方案，内联写入双前缀毛玻璃
    // （aside 是 v-if 动态挂载的，只能在打开后写入）
    if (sidebarRef.value) {
      sidebarRef.value.style.backdropFilter = 'blur(8px)'
      sidebarRef.value.style.webkitBackdropFilter = 'blur(8px)'
    }
  } else {
    detachScrollListeners()
  }
})

// Esc 关闭抽屉
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', syncBodyLock)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', syncBodyLock)
  detachScrollListeners()
  document.body.style.overflow = '' // 兜底恢复（组件卸载时）
})
</script>

<style scoped>
/* 遮罩层 */
.sidebar-overlay {
  position: fixed;
  /* 不用 inset 简写：iOS 12（Safari 12）不支持，需长属性 */
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 210;
}

/* 面板：透明白底 + 毛玻璃（与 MobileTopBar 同款效果） */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: min(280px, 82vw);
  background: var(--surface-glass);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 220;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.15);
}

/* 完全不支持 backdrop-filter 的旧设备：近不透明白底，避免内容直接透出 */
@supports not ((backdrop-filter: blur(8px)) or (-webkit-backdrop-filter: blur(8px))) {
  .sidebar {
    background: var(--surface-glass-solid);
  }
}

/* 头部固定（不参与内容滚动） */
.sidebar-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
}

.sidebar-close {
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 16px;
  line-height: 1;
  padding: 6px;
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.2s;
}

.sidebar-close:hover {
  color: var(--b-pink);
}

/* 内容区：独立滚动 */
.sidebar-body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ==================== 折叠菜单公共样式 ==================== */
.menu-toggle-name {
  font-weight: 500;
}

.menu-count {
  background: var(--b-gray);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  text-align: center;
}

.menu-arrow {
  margin-left: auto;
  color: var(--text-3);
  font-size: 12px;
  transition: transform 0.2s;
}

.menu-arrow.open {
  transform: rotate(180deg);
}

.history-toggle,
.blacklist-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  font-size: 14px;
  color: var(--text-1);
  cursor: pointer;
}

.history-toggle:active,
.blacklist-toggle:active {
  border-color: var(--b-pink);
}

/* 折叠菜单标题：sticky 吸顶到内容区顶部（抵消 .sidebar-body 的 padding），
   长列表下滑时维持顶部 */
.history-toggle,
.blacklist-toggle {
  position: sticky;
  top: -12px;
  z-index: 2;
}

/* ==================== 观看历史 ==================== */
.history-body {
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 6px 6px;
  padding: 4px 0;
}

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 12px;
  color: var(--text-3);
  font-size: 13px;
}

.history-empty p {
  margin: 0;
}

.history-error {
  color: #ff6b6b;
}

.history-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--b-pink);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 历史卡片（紧凑版：缩略图 + 标题 + 观看时间/UP主） */
.history-card {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  text-decoration: none;
  color: inherit;
}

.history-card + .history-card {
  border-top: 1px solid var(--border);
}

.history-cover {
  position: relative;
  flex-shrink: 0;
  width: 88px;
  height: 55px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-muted);
}

.history-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.progress-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  background: var(--b-pink);
  border-radius: 0 1px 0 0;
}

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

/* 直播徽章（直播项无时长，置于封面右上角） */
.live-badge {
  top: 4px;
  bottom: auto;
  background: var(--b-pink);
}

.history-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.history-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-title);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-meta p {
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
  line-height: 1.3;
}

.history-author {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 下滑加载更多（与视频卡片加载条交互一致，侧栏内紧凑版） */
.history-load-more {
  text-align: center;
  padding: 12px;
  font-size: 13px;
  color: var(--text-3);
  cursor: pointer;
  user-select: none;
  border-top: 1px solid var(--border);
  transition: color 0.15s;
}

.history-load-more:active {
  color: var(--b-pink);
}

.history-load-more--end {
  cursor: default;
  color: var(--text-3);
}

.history-load-more--end:active {
  color: var(--text-3);
}

/* ==================== 已屏蔽UP ==================== */
.blacklist-body {
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 6px 6px;
  padding: 4px 0;
}

.blacklist-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
  color: var(--text-3);
  font-size: 13px;
}

.blacklist-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-title);
}

.blacklist-item + .blacklist-item {
  border-top: 1px solid var(--border);
}

.blacklist-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blacklist-unblock {
  flex-shrink: 0;
  border: 1px solid var(--border-strong);
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.blacklist-unblock:hover {
  border-color: var(--b-pink);
  color: var(--b-pink);
}

/* 过渡 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: transform 0.25s ease;
}

.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(-100%);
}

/* 桌面端不渲染侧栏（与 MobileTopBar 同断点） */
@media (min-width: 769px) {
  .sidebar-overlay,
  .sidebar {
    display: none;
  }
}
</style>
