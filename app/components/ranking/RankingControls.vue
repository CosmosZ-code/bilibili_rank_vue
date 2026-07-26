<template>
  <div class="controls">
    <!-- 标题区 -->
    <div class="b-head online">
      <span class="b-head-i"></span>
      <span class="b-head-t">观看列表</span> <span class="b-head-desc">根据稿件网页端的观看情况，定时更新</span>
    </div>

    <!-- 视频模式：过滤等级滑块（隐藏时用占位保持搜索框位置不动） -->
    <div :style="{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '20px', visibility: viewMode === 'videos' ? 'visible' : 'hidden' }">
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
import type { ViewMode, LiveArea } from '../../types'

const props = defineProps<{
  viewMode: ViewMode
  searchTerm: string
  purifyPercent: number
  areaId: number
  areas: LiveArea[]
}>()

const emit = defineEmits<{
  'update:viewMode': [value: ViewMode]
  'update:searchTerm': [value: string]
  'update:purifyPercent': [value: number]
  'update:areaId': [value: number]
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

// 点击 document 外部关闭下拉（仅触屏设备开启时有效）
function onDocumentClick(e: MouseEvent) {
  if (!isTouch.value || !dropdownOpen.value) return
  if (isClickOutside(e.target as Node, [liveDropdownRef.value])) {
    dropdownOpen.value = false
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
