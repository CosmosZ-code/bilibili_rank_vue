<template>
  <div class="controls">
    <!-- 标题区 -->
    <div class="b-head online">
      <span class="b-head-i"></span>
      <span class="b-head-t">观看列表</span> <span class="b-head-desc" title="根据稿件网页端的观看情况，定时更新">根据稿件网页端的观看情况，定时更新</span>
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

    <!-- 视频模式：过滤等级滑块（隐藏时用占位保持搜索框位置不动，仅桌面端显示） -->
    <PercentFilter
      class="controls-percent"
      :model-value="purifyPercent"
      :hidden="viewMode !== 'videos'"
      @update:model-value="$emit('update:purifyPercent', $event)"
    />

    <!-- 搜索框（移动端移至侧栏，仅桌面端显示） -->
    <SearchBox :modelValue="searchTerm" @update:modelValue="$emit('update:searchTerm', $event)" />

    <!-- 视图切换（视频/直播 + 分区下拉）— 与移动顶栏共用 ViewSwitch -->
    <ViewSwitch
      class="controls-view-switch"
      :view-mode="viewMode"
      :area-id="areaId"
      :areas="areas"
      @update:view-mode="$emit('update:viewMode', $event)"
      @update:area-id="$emit('update:areaId', $event)"
    />
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
const {
  page: blacklistPage,
  totalPages: blacklistTotalPages,
  pageItems: blacklistPageItems,
} = useBlacklistPanel(toRef(props, 'blockedUps'))

// 点击 document 外部关闭黑名单下拉（全设备）
function onDocumentClick(e: MouseEvent) {
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

/* 桌面端过滤滑块（PercentFilter 根元素）：保持原内联样式的间距 */
.controls-percent {
  margin-left: 8px;
}

.b-head-t {
  font-size: 18px;
  color: var(--text-title);
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
  background-color: var(--bg-card);
  color: var(--text-3);
  border: 1px solid var(--border-strong);
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
  box-shadow: 0 0 0 2px var(--bg-card);
}

.blacklist-btn:hover .blacklist-count,
.blacklist-btn.active .blacklist-count {
  background-color: var(--bg-card);
  color: var(--b-gray);
}

/* 屏蔽面板 — 整体模仿 HistoryDropdown 历史面板风格 */
.blacklist-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-card);
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
  scrollbar-color: var(--scrollbar) transparent;
}

/* 空态 — 仿 history-placeholder */
.blacklist-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-3);
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
  color: var(--text-title);
  transition: background-color 0.15s;
}

.blacklist-item:hover {
  background-color: var(--bg-hover);
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
  border-top: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-2);
}

.blacklist-page-btn {
  border: none;
  background: none;
  color: var(--text-2);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: color 0.2s, background-color 0.2s;
}

.blacklist-page-btn:hover:not(:disabled) {
  color: var(--b-pink);
  background-color: var(--bg-hover);
}

.blacklist-page-btn:disabled {
  color: var(--text-3);
  cursor: default;
}

.blacklist-page-info {
  min-width: 32px;
  text-align: center;
  font-size: 13px;
  color: var(--text-2);
}

/* 自定义滚动条 — 细长灰色，靠右侧（仿历史面板） */
.blacklist-menu::-webkit-scrollbar {
  width: 5px;
}

.blacklist-menu::-webkit-scrollbar-track {
  background: transparent;
}

.blacklist-menu::-webkit-scrollbar-thumb {
  background: var(--scrollbar);
  border-radius: 3px;
}

.blacklist-menu::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}

/* ==================== 视图切换（ViewSwitch 组件） ==================== */
/* 容器间距保持原 sort-options 的 margin */
.controls-view-switch {
  margin: 10px 0;
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

/* 768–1280px：控制栏一行放不下时会换行；视频/直播切换增减"已屏蔽UP"按钮导致行数变化、切换按钮跳行。
   此区间强制单行（nowrap）：行内溢出时标题说明文字可收缩省略、搜索框可收缩（见 SearchBox.vue） */
@media (min-width: 768px) and (max-width: 1280px) {
  .controls {
    flex-wrap: nowrap;
    gap: 10px; /* 溢出收缩时项目间的最小间隙，避免搜索框与切换按钮贴在一起 */
  }

  .b-head {
    display: flex;
    align-items: baseline;
    min-width: 0; /* 关键：放开 flex 最小宽度，标题区才可收缩 */
  }

  .b-head-t {
    flex-shrink: 0; /* "观看列表"标题不收缩 */
  }

  .b-head-desc {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* 移动端：整个控制栏隐藏（切换按钮移至顶栏 MobileTopBar，其余控件收纳进侧栏）。
   置于文件末尾，保证媒体查询规则不被前面同特异性规则覆盖 */
@media (max-width: 768px) {
  .controls {
    display: none;
  }
}
</style>
