<template>
  <div class="controls">
    <!-- 标题区 -->
    <div class="b-head online">
      <span class="b-head-i"></span>
      <span class="b-head-t">观看列表</span> <span class="b-head-desc">根据稿件网页端的观看情况，定时更新</span>
    </div>

    <!-- 已屏蔽UP（点击展开管理下拉）— 仅视频模式显示（黑名单只过滤视频排行，直播不受影响） -->
    <div v-if="viewMode === 'videos'" ref="blacklistDropdownRef" class="blacklist-dropdown">
      <button
        class="blacklist-btn"
        :class="{ active: blacklistOpen }"
        @click="toggleBlacklist"
      >
        已屏蔽UP
        <span v-if="blockedUps.length" class="blacklist-count">{{ blockedUps.length }}</span>
      </button>
      <Transition name="fade">
        <div v-if="blacklistOpen" class="blacklist-menu">
          <div v-if="blockedUps.length === 0" class="blacklist-empty">暂无屏蔽UP</div>
          <template v-else>
            <div v-for="item in blacklistPageItems" :key="item.mid" class="blacklist-item">
              <span class="blacklist-name" :title="item.owner">{{ item.owner }}</span>
              <button class="blacklist-unblock" @click.stop="$emit('unblock', item.mid)">取消屏蔽</button>
            </div>
            <div v-if="blacklistTotalPages > 1" class="blacklist-pagination">
              <button
                class="blacklist-page-btn"
                :disabled="blacklistPage <= 1"
                @click.stop="blacklistPage--"
              >&lt;</button>
              <span class="blacklist-page-info">{{ blacklistPage }}/{{ blacklistTotalPages }}</span>
              <button
                class="blacklist-page-btn"
                :disabled="blacklistPage >= blacklistTotalPages"
                @click.stop="blacklistPage++"
              >&gt;</button>
            </div>
          </template>
        </div>
      </Transition>
    </div>

    <!-- 视频模式：过滤等级滑块（隐藏时用占位保持搜索框位置不动） -->
    <div :style="{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '8px', visibility: viewMode === 'videos' ? 'visible' : 'hidden' }">
      <label for="percent-range" style="font-size: 14px; color: #333;">过滤等级：</label>
      <input
        id="percent-range"
        type="range"
        min="0"
        max="100"
        :value="purifyPercent"
        style="width: 180px;"
        @input="$emit('update:purifyPercent', Number(($event.target as HTMLInputElement).value))"
      />
      <span style="font-size: 14px; color: #333; min-width: 40px; text-align: right;">
        {{ purifyPercent }}%
      </span>
    </div>

    <!-- 搜索框 -->
    <SearchBox :modelValue="searchTerm" @update:modelValue="$emit('update:searchTerm', $event)" />

    <!-- 排序/切换区 — sort-btn 风格的两个按钮 -->
    <div class="sort-options">
      <div class="tab-group">
        <!-- 视频 -->
        <button
          class="tab-btn"
          :class="{ active: viewMode === 'videos' }"
          @click="$emit('update:viewMode', 'videos')"
        >
          视频
        </button>

        <!-- 直播（带悬浮分区下拉） -->
        <div
          ref="liveDropdownRef"
          class="live-dropdown"
          :class="{ active: viewMode === 'live' }"
          @mouseenter="onDropdownEnter"
          @mouseleave="onDropdownLeave"
        >
          <span class="live-trigger" @click="clickLive">直播</span>
          <Transition name="fade">
            <div v-if="dropdownOpen" class="dropdown-menu" @mouseenter="onDropdownEnter">
              <div
                class="dropdown-item"
                :class="{ active: areaId === 0 }"
                @click="selectArea(0)"
              >
                全站
              </div>
              <div
                v-for="area in areas"
                :key="area.id"
                class="dropdown-item"
                :class="{ active: areaId === area.id }"
                @click="selectArea(area.id)"
              >
                {{ area.name }}
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ViewMode, LiveArea, BlacklistItem } from '../../types'

const props = defineProps<{
  viewMode: ViewMode
  searchTerm: string
  purifyPercent: number
  areaId: number
  areas: LiveArea[]
  blockedUps: BlacklistItem[]
}>()

const emit = defineEmits<{
  'update:viewMode': [value: ViewMode]
  'update:searchTerm': [value: string]
  'update:purifyPercent': [value: number]
  'update:areaId': [value: number]
  'unblock': [mid: string]
}>()

// ============================================================
// 触屏设备检测 + 两阶段点按
// ============================================================
const { isTouch } = useTouchDevice()
const liveDropdownRef = ref<HTMLDivElement | null>(null)

// 悬浮下拉状态（桌面：hover 控制；触屏：点击控制）
const dropdownOpen = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | null = null

function onDropdownEnter() {
  if (isTouch.value) return
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  dropdownOpen.value = true
}

function onDropdownLeave() {
  if (isTouch.value) return
  closeTimer = setTimeout(() => {
    dropdownOpen.value = false
  }, 200)
}

function selectArea(id: number) {
  if (props.viewMode !== 'live') {
    emit('update:viewMode', 'live')
  }
  emit('update:areaId', id)
  dropdownOpen.value = false
}

// 点击"直播"文字：桌面直接切全站；触屏两阶段（首次展开，二次切全站）
function clickLive() {
  const { shouldOpen, shouldTriggerAction } = computeTriggerTap(isTouch.value, dropdownOpen.value)
  if (shouldOpen) {
    dropdownOpen.value = true
    if (!shouldTriggerAction) return
  }
  // 桌面点击 或 触屏二次点击：切直播全站
  emit('update:viewMode', 'live')
  emit('update:areaId', 0)
  dropdownOpen.value = false
}

// ============================================================
// 已屏蔽UP 下拉（点击模式，全设备）
// ============================================================
const blacklistOpen = ref(false)
const blacklistDropdownRef = ref<HTMLDivElement | null>(null)

function toggleBlacklist() {
  blacklistOpen.value = !blacklistOpen.value
}

// 切换视图（视频 ↔ 直播）时关闭屏蔽面板，避免切回视频时菜单残留
watch(() => props.viewMode, () => {
  blacklistOpen.value = false
})

// ---- 屏蔽列表排序 + 分页（每页 10 条，按 UP 名首字拼音排序） ----
const BLACKLIST_PAGE_SIZE = 10
const blacklistPage = ref(1)

const sortedBlockedUps = computed(() => sortBlacklistByOwner(props.blockedUps))

const blacklistTotalPages = computed(() =>
  Math.max(1, Math.ceil(sortedBlockedUps.value.length / BLACKLIST_PAGE_SIZE)),
)

const blacklistPageItems = computed(() => {
  const start = (blacklistPage.value - 1) * BLACKLIST_PAGE_SIZE
  return sortedBlockedUps.value.slice(start, start + BLACKLIST_PAGE_SIZE)
})

// 列表变化（取消屏蔽等）→ 页码越界时回退到最后一页
watch(() => props.blockedUps.length, () => {
  if (blacklistPage.value > blacklistTotalPages.value) {
    blacklistPage.value = Math.max(1, blacklistTotalPages.value)
  }
})

// 点击 document 外部关闭下拉（直播下拉仅触屏；黑名单下拉全设备）
function onDocumentClick(e: MouseEvent) {
  if (isTouch.value && dropdownOpen.value) {
    if (isClickOutside(e.target as Node, [liveDropdownRef.value])) {
      dropdownOpen.value = false
    }
  }
  if (blacklistOpen.value) {
    if (isClickOutside(e.target as Node, [blacklistDropdownRef.value])) {
      blacklistOpen.value = false
    }
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<style scoped>
.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  border-top: 1px solid var(--b-border);
  border-bottom: 1px solid var(--b-border);
  padding: 10px 0;
}

.b-head-t {
  font-size: 18px;
  color: var(--b-dark);
}

.b-head-desc {
  font-size: 13px;
  color: var(--b-gray);
}

/* ==================== 已屏蔽UP 下拉 ==================== */
.blacklist-dropdown {
  position: relative;
  margin-left: 20px;
}

.blacklist-btn {
  background-color: #fff;
  color: #999;
  border: 1px solid #ddd;
  padding: 8px 14px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.blacklist-btn:hover,
.blacklist-btn.active {
  background-color: var(--b-pink);
  color: white;
  border-color: var(--b-pink);
}

/* 数量角标：绝对定位在按钮右上角，出现/消失不占用布局宽度，不影响相邻控件位置 */
.blacklist-count {
  position: absolute;
  top: -5px;
  right: -7px;
  background-color: var(--b-gray);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  display: inline-block;
  text-align: center;
  box-shadow: 0 0 0 2px #fff;
}

.blacklist-btn:hover .blacklist-count,
.blacklist-btn.active .blacklist-count {
  background-color: #fff;
  color: var(--b-gray);
}

/* 屏蔽面板 — 整体模仿 HistoryDropdown 历史面板风格 */
.blacklist-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  width: 240px;
  max-height: 490px;
  overflow-y: auto;
  overscroll-behavior: contain;
  z-index: 200;
  padding: 8px 0;
  /* Firefox 滚动条 */
  scrollbar-width: thin;
  scrollbar-color: #d0d0d0 transparent;
}

/* 空态 — 仿 history-placeholder */
.blacklist-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #999;
  font-size: 14px;
}

/* 列表项 — 仿 history-card */
.blacklist-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  font-size: 13px;
  color: #222;
  transition: background-color 0.15s;
}

.blacklist-item:hover {
  background-color: #eaeaea;
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
  border: 1px solid #e0e0e0;
  background: #fff;
  color: #666;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.blacklist-unblock:hover {
  border-color: var(--b-pink);
  color: var(--b-pink);
}

/* 分页栏 — 仿 history-view-all 底部分隔栏，居中 */
.blacklist-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid #eee;
  font-size: 13px;
  color: #666;
}

.blacklist-page-btn {
  border: none;
  background: none;
  color: #666;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: color 0.2s, background-color 0.2s;
}

.blacklist-page-btn:hover:not(:disabled) {
  color: var(--b-pink);
  background-color: #f5f5f5;
}

.blacklist-page-btn:disabled {
  color: #ccc;
  cursor: default;
}

.blacklist-page-info {
  min-width: 32px;
  text-align: center;
  font-size: 13px;
  color: #666;
}

/* 自定义滚动条 — 细长灰色，靠右侧（仿历史面板） */
.blacklist-menu::-webkit-scrollbar {
  width: 5px;
}

.blacklist-menu::-webkit-scrollbar-track {
  background: transparent;
}

.blacklist-menu::-webkit-scrollbar-thumb {
  background: #d0d0d0;
  border-radius: 3px;
}

.blacklist-menu::-webkit-scrollbar-thumb:hover {
  background: #b0b0b0;
}

/* ==================== 视图标签切换（sort-btn 风格） ==================== */
.sort-options {
  display: flex;
  gap: 10px;
  margin: 10px 0;
}

.tab-group {
  display: flex;
  gap: 0;
  border-radius: 4px;
  overflow: visible;
  position: relative;
}

.tab-btn,
.live-trigger {
  background-color: #fff;
  color: #999;
  border: 1px solid #ddd;
  padding: 8px 18px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  display: inline-block;
}

.tab-btn:first-child {
  border-radius: 4px 0 0 4px;
}

/* 直播触发器和它外侧包装共享右边框，形成一个连续的分组按钮 */
.live-dropdown {
  margin-left: -1px; /* 与左边按钮边框重叠 */
  position: relative;
}

.live-trigger {
  cursor: pointer;
  border-radius: 0 4px 4px 0;
}

.tab-btn:hover,
.live-dropdown:not(.active) .live-trigger:hover {
  background-color: var(--b-pink);
  color: white;
  border-color: var(--b-pink);
}

.tab-btn.active,
.live-dropdown.active .live-trigger {
  background-color: var(--b-pink);
  color: white;
  border-color: var(--b-pink);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 4px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: max-content;
  width: auto;
  z-index: 200;
  padding: 8px 0;
}

.dropdown-item {
  padding: 10px 24px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  white-space: nowrap;
  text-align: center;
}

.dropdown-item:hover {
  background-color: #f5f5f5;
  color: var(--b-pink);
}

.dropdown-item.active {
  color: var(--b-pink);
  font-weight: 600;
}

/* 淡入淡出过渡 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
